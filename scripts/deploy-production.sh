#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/evaya-naturals-internal}"
APP_DOMAIN="${APP_DOMAIN:-evayainternal.com}"
TARGET_COMMIT="${TARGET_COMMIT:-}"
PREVIOUS_COMMIT="${PREVIOUS_COMMIT:-}"
LOCAL_HEALTH_URL="${LOCAL_HEALTH_URL:-http://127.0.0.1:3001/api/health}"

log() {
  printf '[deploy][%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$1"
}

fail() {
  printf '[deploy][%s] ERROR: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$1" >&2
  exit 1
}

run_step() {
  log "$1"
  shift
  "$@"
}

cd "${APP_DIR}"

CURRENT_COMMIT="$(git rev-parse HEAD)"
log "Deploying from ${APP_DIR}"
log "Current checkout: ${CURRENT_COMMIT}"

if [ -n "${TARGET_COMMIT}" ] && [ "${CURRENT_COMMIT}" != "${TARGET_COMMIT}" ]; then
  fail "Checked-out commit ${CURRENT_COMMIT} does not match requested commit ${TARGET_COMMIT}"
fi

if [ -n "${PREVIOUS_COMMIT}" ]; then
  log "Previous commit before deploy: ${PREVIOUS_COMMIT}"
fi

run_step "Installing root dependencies" npm ci
run_step "Installing server dependencies" npm --prefix server ci
run_step "Installing client dependencies" npm --prefix client ci
run_step "Running typecheck" npm run check
run_step "Running test suite" npm test
run_step "Building production artifacts" npm run build
run_step "Running database migrations" npm run db:migrate
run_step "Restarting PM2 process" pm2 restart evaya-api --update-env
run_step "Waiting for API process to warm up" sleep 5
run_step "Checking PM2 status" pm2 status evaya-api
run_step "Checking local API health" curl -fsS "${LOCAL_HEALTH_URL}"
run_step "Checking nginx status" systemctl is-active nginx
run_step "Running public smoke checks" bash scripts/smoke-check.sh "https://${APP_DOMAIN}"

SYNCED_COMMIT="$(git rev-parse HEAD)"
log "Deployment complete on commit ${SYNCED_COMMIT}"

if [ -n "${PREVIOUS_COMMIT}" ]; then
  log "Rollback target if needed: ${PREVIOUS_COMMIT}"
fi
