#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-${APP_BASE_URL:-}}"

if [ -z "${BASE_URL}" ]; then
  echo "Usage: bash scripts/smoke-check.sh https://yourdomain.com" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"

log() {
  printf '[smoke][%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$1"
}

check_url() {
  local label="$1"
  local url="$2"
  local code

  log "Checking ${label}: ${url}"
  code="$(curl -fsS -o /dev/null -w '%{http_code}' "${url}")"

  if [ "${code}" != "200" ]; then
    echo "Smoke check failed for ${url}: expected 200, got ${code}" >&2
    exit 1
  fi
}

check_url "health" "${BASE_URL}/api/health"
check_url "login" "${BASE_URL}/login"
check_url "pos" "${BASE_URL}/pos"

log "Public smoke checks passed"
