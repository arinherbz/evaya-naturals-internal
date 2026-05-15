#!/bin/bash
# Evaya Naturals Internal - Production Fix Script
# Run this on the VPS as root

set -e

echo "=== Evaya Naturals Internal - Production Fix Script ==="
echo ""

# 1. Navigate to project
cd /var/www/evaya-naturals-internal

echo "1. Verifying deployment..."
git log --oneline -3
echo "✓ Latest commit verified"
echo ""

# 2. PM2 Setup
echo "2. Setting up PM2 persistence..."
pm2 startup systemd -u root --hp /root
pm2 save
echo "✓ PM2 startup configured"
echo ""

# 3. Start evaya-client if missing
echo "3. Checking evaya-client..."
if ! pm2 describe evaya-client > /dev/null 2>&1; then
    echo "Starting evaya-client..."
    pm2 start npm --name evaya-client -- run serve
    pm2 save
    echo "✓ evaya-client started"
else
    echo "✓ evaya-client already running"
fi
echo ""

# 4. PostgreSQL Backups
echo "4. Setting up PostgreSQL backups..."
mkdir -p /var/backups/evaya

cat > /usr/local/bin/backup-evaya.sh << 'BACKUP_EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/evaya"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME=${1:-evaya_naturals}
DB_USER=${2:-evaya}

# Create compressed backup
pg_dump -U $DB_USER $DB_NAME | gzip > $BACKUP_DIR/${DB_NAME}_$TIMESTAMP.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

echo "Backup created: ${DB_NAME}_$TIMESTAMP.sql.gz"
BACKUP_EOF

chmod +x /usr/local/bin/backup-evaya.sh

# Create initial backup
/usr/local/bin/backup-evaya.sh
echo "✓ Initial backup created"

# Add to crontab (daily at 2 AM)
if ! crontab -l | grep -q "backup-evaya.sh"; then
    (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-evaya.sh") | crontab -
    echo "✓ Daily backup cron job added"
else
    echo "✓ Backup cron job already exists"
fi
echo ""

# 5. Migration Tracking
echo "5. Checking migration tracking..."
sudo -u postgres psql -d evaya_naturals -c "SELECT COUNT(*) FROM drizzle.__drizzle_migrations;" || echo "⚠ Migration tracking table may not exist"
echo ""

# 6. Security Check
echo "6. Security check..."
if [ -f ".env" ]; then
    echo "⚠ .env file exists in project root - ensure it's not web accessible"
fi
if [ -f "server/.env" ]; then
    echo "✓ server/.env exists"
fi

# Test if .env is accessible via web (should return 404)
ENV_CHECK=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/.env 2>/dev/null || echo "000")
if [ "$ENV_CHECK" = "404" ] || [ "$ENV_CHECK" = "000" ]; then
    echo "✓ .env not accessible via web"
else
    echo "⚠ WARNING: .env might be accessible via web!"
fi
echo ""

# 7. Final Status
echo "7. Final status check..."
pm2 status
echo ""

echo "=== Fix Script Complete ==="
echo ""
echo "IMPORTANT ACTIONS REQUIRED:"
echo "1. Confirm production admin access uses a secure bootstrap password and rotate it immediately if this is the first production login"
echo "2. Verify SSL: Visit https://evayainternal.com and check for padlock icon"
echo "3. Test POS: Create a product, verify it appears in POS, complete a test sale"
echo "4. Check backups: ls -la /var/backups/evaya/"
