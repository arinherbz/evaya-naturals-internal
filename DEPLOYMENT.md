# Hostinger Pilot Deployment

This document prepares `evaya-naturals-internal` for a Hostinger pilot on:

- Hostinger VPS or Hostinger Node.js hosting
- PostgreSQL
- browser access for staff on phone, tablet, and computer

Important current blocker:

- the frontend and deployment config are now production-oriented
- the backend runtime and Drizzle schema are still SQLite-based in code
- before a real PostgreSQL cutover, the schema layer must be migrated from Drizzle `sqlite-core` to PostgreSQL-compatible definitions
- the runtime now fails fast if production tries to boot on SQLite, or if a PostgreSQL URL is supplied before that migration is complete

That means this repo is now deployment-prepared, but not yet PostgreSQL-runtime-complete.

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

- the repo now requires PostgreSQL in production by policy
- the backend still needs a real SQLite-to-PostgreSQL schema migration before it can run on PostgreSQL
- do not attempt a real production boot on PostgreSQL until that migration is completed

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

## 5. Build Commands

```bash
npm run build
```

This runs:

- frontend build
- backend build

## 6. Start Commands

Backend only:

```bash
npm run start:server
```

Production alias:

```bash
npm run start:production
```

## 7. PM2 Setup

Use PM2 on a VPS:

```bash
pm2 start npm --name evaya-api -- run start:production
pm2 save
pm2 startup
```

To inspect logs:

```bash
pm2 logs evaya-api
```

## 8. Nginx Reverse Proxy Example

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

## 9. SSL and Domain

Use Let’s Encrypt after nginx is working:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## 10. Health Check

Test the API locally on the server:

```bash
curl -i http://127.0.0.1:3001/api/health
```

Expected:

- HTTP `200`
- JSON with `status: "ok"`

## 11. Staff Access

Staff open:

```text
https://yourdomain.com/login
```

Notes:

- no app install is required
- it works in a normal browser
- it is intended for phones, tablets, and computers
- each staff member signs in with the login assigned to them

## 12. Production Checklist

- [ ] environment variables are set
- [ ] domain and SSL are working
- [ ] PostgreSQL database exists
- [ ] PostgreSQL credentials work
- [ ] SQLite-to-PostgreSQL schema migration is completed
- [ ] database schema is initialized
- [ ] admin user is created
- [ ] `/api/health` returns `200`
- [ ] login works
- [ ] POS works
- [ ] PDF report download works
- [ ] mobile layout is checked on a phone
- [ ] tablet layout is checked
- [ ] backups are configured
- [ ] PM2 restarts cleanly after reboot

## 13. Staff Pilot Access

For the pilot:

1. open `https://yourdomain.com/login`
2. sign in with the assigned staff account
3. use POS, Inventory, Reports, and other allowed pages in the browser
4. report any broken layout or slow workflow immediately

## 14. Local Verification Links

- `http://127.0.0.1:3000/login`
- `http://127.0.0.1:3000/pos`
- `http://127.0.0.1:3001/api/health`

## 15. Deployment Reality Check

This repo is now prepared for deployment review, but not yet ready for a real PostgreSQL production launch.

What is done:

- production env template
- production script cleanup
- frontend production API URL support
- Hostinger deployment docs
- production safety guard against accidental SQLite deployment

What is still required before real PostgreSQL deployment:

- migrate the Drizzle schema from SQLite core to PostgreSQL-compatible schema files
- replace the SQLite runtime adapter with a PostgreSQL adapter
- validate migrations and seed flow against PostgreSQL
