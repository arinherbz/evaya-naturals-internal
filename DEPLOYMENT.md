# Hostinger Pilot Deployment

This document covers both:

- standard local development on Homebrew PostgreSQL 16
- Hostinger pilot deployment on PostgreSQL

This document prepares `evaya-naturals-internal` for a Hostinger pilot on:

- Hostinger VPS or Hostinger Node.js hosting
- PostgreSQL
- browser access for staff on phone, tablet, and computer

The app now supports:

- PostgreSQL in local development through `DATABASE_URL`
- PostgreSQL in production through `DATABASE_URL`
- Drizzle PostgreSQL migrations
- idempotent seed data
- in-memory `PGlite` fallback only when `DATABASE_URL` is not set outside production

## 0. Standard Local Development Database

Evaya local development should use:

- Homebrew PostgreSQL 16
- `localhost:5432`
- database name: `evaya_naturals`

Example local environment:

```env
DATABASE_URL=postgresql://YOUR_MAC_USERNAME@localhost:5432/evaya_naturals
```

Standard local setup:

```bash
brew services start postgresql@16
createdb evaya_naturals
npm run db:migrate
npm run db:seed
npm run dev
```

Useful local service commands:

```bash
brew services stop postgresql@16
brew services restart postgresql@16
```

If you also use Postgres.app locally, move it to port `5433`. Homebrew PostgreSQL on `5432` is the Evaya default.

## 1. Hostinger VPS Setup

1. Create a Hostinger VPS with Ubuntu 22.04 or newer.
2. Point your domain to the VPS IP.
3. SSH into the VPS.
4. Install Node.js 20+, npm, git, nginx, and PM2:

```bash
sudo apt update
sudo apt install -y nginx git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

5. Clone the repo:

```bash
git clone https://github.com/arinherbz/evaya-naturals-internal.git
cd evaya-naturals-internal
```

6. Install all dependencies:

```bash
npm install
npm run install:all
```

## 2. Hostinger Node.js Hosting

If you use Hostinger Node.js hosting instead of a VPS:

1. upload the repo
2. run:

```bash
npm install
npm run install:all
npm run build
```

3. set the start command to:

```bash
npm run start:production
```

4. configure the environment variables listed below

Important:

- if frontend and backend are split on Hostinger, serve the built frontend as static files and route API traffic to the backend domain or `/api`
- if you want one domain, VPS + nginx is the cleaner pilot setup

## 3. PostgreSQL Connection Steps

1. Create a PostgreSQL database.
2. Create a database user with a strong password.
3. Get the connection string:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB_NAME
```

4. Add it to the production environment.

Current status:

- local development should use PostgreSQL through `DATABASE_URL`
- production uses PostgreSQL through `DATABASE_URL`
- production fails clearly if `DATABASE_URL` is missing
- production fails clearly if a non-PostgreSQL URL is supplied
- local experiments and tests can run without PostgreSQL by using in-memory `PGlite`

## 4. Environment Variables

Set these on Hostinger:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB_NAME
SESSION_SECRET=change-this-to-a-secure-random-secret
CLIENT_URL=https://yourdomain.com
VITE_API_URL=https://yourdomain.com/api
```

Notes:

- never commit real secrets
- `CLIENT_URL` is used for backend CORS
- `VITE_API_URL` is used by the frontend production build
- `SESSION_SECRET` is required in production and should be a long random string
- keep `.env` files local to the server or workstation and out of GitHub

## 5. Database Commands

Run these in order:

```bash
git pull
npm install
npm run install:all
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm run start:production
```

What they do:

- `npm run db:generate`
  - generates SQL migrations from the Drizzle PostgreSQL schema
- `npm run db:migrate`
  - applies migrations to the configured PostgreSQL database
- `npm run db:seed`
  - creates core data and sample pilot data without duplicating records

Database discipline:

- use code and migrations as the schema source of truth
- do not change the Hostinger PostgreSQL schema manually unless it is documented and followed by a migration-backed code change
- take a backup before production migrations
- run the same migration flow on local, VPS, and production
- after `npm run db:migrate`, verify the Drizzle tracking table exists:

```sql
select * from drizzle.__drizzle_migrations order by created_at desc;
```

## 6. Build Commands

```bash
npm run build
```

This runs:

- frontend build
- backend build

## 7. Start Commands

Backend only:

```bash
npm run start:server
```

Production alias:

```bash
npm run start:production
```

## 8. PM2 Setup

Use PM2 on a VPS:

```bash
pm2 start npm --name evaya-api -- run start:production
pm2 save
pm2 startup
```

After `pm2 startup`, run the generated `systemd` command once, then save again:

```bash
pm2 save
systemctl status pm2-root
```

To inspect logs:

```bash
pm2 logs evaya-api
```

## 9. Nginx Reverse Proxy Example

Example `/etc/nginx/sites-available/evaya`:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /var/www/evaya/client/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then enable it:

```bash
sudo ln -s /etc/nginx/sites-available/evaya /etc/nginx/sites-enabled/evaya
sudo nginx -t
sudo systemctl reload nginx
```

## 10.5 Backups

Production should have automatic PostgreSQL backups.

Recommended daily backup command:

```bash
pg_dump "$DATABASE_URL" | gzip > /var/backups/evaya/evaya_internal-$(date +%F-%H%M%S).sql.gz
```

Recommended practice:

- run daily backups
- take a backup before migrations or major updates
- keep backup files outside the app directory
- copy backups off-server regularly

## 10. SSL and Domain

Use Let’s Encrypt after nginx is working:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## 11. Health Check

Test the API locally on the server:

```bash
curl -i http://127.0.0.1:3001/api/health
```

Expected:

- HTTP `200`
- JSON with `status: "ok"`
- no secrets, stack traces, or database details

## 12. Staff Access

Staff open:

```text
https://yourdomain.com/login
```

Notes:

- no app install is required
- it works in a normal browser
- it is intended for phones, tablets, and computers
- each staff member signs in with the login assigned to them

## 13. Production Checklist

- [ ] environment variables are set
- [ ] domain and SSL are working
- [ ] PostgreSQL database exists
- [ ] PostgreSQL credentials work
- [ ] latest code is pulled from GitHub
- [ ] dependencies are installed
- [ ] `npm run check` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] production backup is taken before migrations
- [ ] database schema is migrated
- [ ] admin user is created
- [ ] seed data completed
- [ ] app is rebuilt
- [ ] PM2 is restarted
- [ ] `/api/health` returns `200`
- [ ] login works
- [ ] POS works
- [ ] PDF report download works
- [ ] mobile layout is checked on a phone
- [ ] tablet layout is checked
- [ ] backups are configured
- [ ] daily PostgreSQL backup is configured
- [ ] backup is stored outside the server
- [ ] backup is taken before major updates
- [ ] PM2 restarts cleanly after reboot

## 14. Backup Recommendation

For the pilot:

- take a daily PostgreSQL backup
- take a manual backup before major updates
- take a manual backup before production migrations
- store backups outside the Hostinger server
- periodically test restoring a backup to a non-production database

## 15. Staff Pilot Access

For the pilot:

1. open `https://yourdomain.com/login`
2. sign in with the assigned staff account
3. use POS, Inventory, Reports, and other allowed pages in the browser
4. report any broken layout or slow workflow immediately

## 16. Local Verification Links

- `http://127.0.0.1:3000/login`
- `http://127.0.0.1:3000/pos`
- `http://127.0.0.1:3001/api/health`

## 17. Local Development Behavior

When `DATABASE_URL` is not set:

- production will fail fast
- local development falls back to in-memory `PGlite`
- tests use in-memory `PGlite`

That fallback is only for quick experiments and CI. For persistent local Evaya work, use Homebrew PostgreSQL 16 on `localhost:5432`.

## 18. Production Database Verification

After migration and seed:

1. open `https://yourdomain.com/login`
2. sign in with the seeded admin user
3. confirm `/api/health` returns `200`
4. confirm POS loads
5. confirm report preview and PDF download work
6. confirm a sale can be completed and appears in reports

## 19. Deployment Workflow

Production deploys should use the same gated order every time:

```bash
git pull --ff-only origin main
npm ci
npm --prefix server ci
npm --prefix client ci
npm run check
npm test
npm run build
npm run db:migrate
pm2 restart evaya-api --update-env
bash scripts/smoke-check.sh https://yourdomain.com
```

The production restart must happen only after:

- typecheck passes
- tests pass
- build passes
- migrations pass

If any step fails, stop and do not restart PM2.

## 20. Rollback

If a deploy must be rolled back:

1. identify the last known good commit
2. restore that commit on the VPS
3. rebuild from that commit
4. restart PM2
5. rerun smoke checks

Example:

```bash
cd /var/www/evaya-naturals-internal
git log --oneline -n 5
git checkout main
git reset --hard <previous-good-commit>
npm ci
npm --prefix server ci
npm --prefix client ci
npm run build
pm2 restart evaya-api --update-env
bash scripts/smoke-check.sh https://yourdomain.com
```

Before rollback:

- confirm whether the latest migration changed data shape
- restore a PostgreSQL backup first if the rollback requires database reversal
- keep the backup outside the server

## 21. Deployment Reality Check

This repo is now PostgreSQL-ready for deployment review and pilot setup.

What is done:
- PostgreSQL runtime support is in place
- SQLite is no longer allowed in local or production `DATABASE_URL` usage
- Drizzle PostgreSQL migrations are generated
- seed is idempotent
- frontend production API config is environment-driven
- local and test environments can still run without PostgreSQL when needed
- validate migrations and seed flow against PostgreSQL
