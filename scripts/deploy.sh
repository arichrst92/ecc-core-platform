#!/usr/bin/env bash
# ============================================================
# ECC Core Platform — VPS deploy script
# ============================================================
# Di-invoke oleh .github/workflows/ci.yml setelah `git pull` ke working dir.
# Aman dipanggil manual juga: `cd /var/www/ecc-core-platform && ./scripts/deploy.sh`.
#
# Asumsi:
#   - Node 20+ + pnpm 9+ sudah installed di VPS
#   - PostgreSQL accessible via DATABASE_URL di .env
#   - PM2 installed global (`npm i -g pm2`)
#   - ecosystem.config.cjs di root mengatur core-api + portal process
#   - .env file persisten di /var/www/ecc-core-platform/.env (jangan di-overwrite via deploy)
# ============================================================

set -euo pipefail

# Color helpers (CI / terminal-friendly)
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log() { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err() { echo -e "${RED}[deploy ERR]${NC} $*" >&2; }

# ============================================================
# 1. Sanity checks
# ============================================================
log "Working dir: $(pwd)"
log "Node: $(node --version)"
log "pnpm: $(pnpm --version)"

if [ ! -f ".env" ]; then
  err "File .env tidak ditemukan di $(pwd). Setup pertama kali: copy .env.example, isi values, simpan."
  exit 1
fi

# ============================================================
# 2. Install dependencies
# ============================================================
log "Installing dependencies (frozen lockfile)..."
pnpm install --frozen-lockfile

# Prisma client auto-generate via postinstall, tapi jalankan eksplisit jaga-jaga.
log "Generating Prisma client..."
pnpm --filter @ecc/database exec prisma generate

# ============================================================
# 3. Apply pending migrations
# ============================================================
log "Applying database migrations (prisma migrate deploy)..."
# `migrate deploy` aman untuk prod — hanya apply migration baru, tidak prompt.
pnpm --filter @ecc/database db:migrate:deploy

# ============================================================
# 4. Build all apps
# ============================================================
log "Building all apps (turbo)..."
pnpm turbo build

# ============================================================
# 5. Reload services via PM2
# ============================================================
if command -v pm2 > /dev/null 2>&1; then
  if [ -f "ecosystem.config.cjs" ]; then
    log "Reloading services via PM2..."
    # `pm2 reload` = zero-downtime restart (vs `restart` yang put-down + put-up).
    # Kalau process belum running, fallback ke `start`.
    pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
    pm2 save  # persist current process list supaya survive VPS reboot
  else
    warn "ecosystem.config.cjs tidak ada — skip PM2 reload."
    warn "Restart manual: pm2 restart all atau systemctl restart <service>"
  fi
else
  warn "PM2 tidak ditemukan di PATH. Manual restart core-api + portal."
  warn "Install: npm install -g pm2"
fi

# ============================================================
# 6. Health check (best effort)
# ============================================================
sleep 2
CORE_API_URL="${CORE_API_URL:-http://localhost:4100}"
if curl --fail --silent --max-time 5 "$CORE_API_URL/health" > /dev/null 2>&1; then
  log "Health check OK: $CORE_API_URL/health"
else
  warn "Health check skipped/failed di $CORE_API_URL/health — cek log PM2."
fi

log "✅ Deploy selesai: $(git rev-parse --short HEAD)"
