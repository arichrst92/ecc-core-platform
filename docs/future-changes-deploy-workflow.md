# Future Changes — Deployment Workflow

> Standard procedure untuk deploy perubahan ke production setelah initial deploy 2026-05-23.
>
> **Live URLs:**
> - Portal: https://portal.eccchurch.global
> - API: https://api.eccchurch.global
> - VPS: deploy@187.77.118.85
> - Repo: /var/www/ecc-core-platform

Workflow di-bagi per **skenario perubahan**. Pilih yang sesuai, copy-paste blok command. Setiap blok dirancang aman untuk di-jalankan berurutan.

> 🚧 **Sprint 2 (Shiftsoft + Group + Magic Link) — pending deploy.** Karena kompleks (5 migration + 8 env + npm dep + data import), pakai runbook dedicated: **[`sprint-2-deploy-checklist.md`](./sprint-2-deploy-checklist.md)**.

---

## Skenario 1 — Code change saja (no schema, no env, no deps)

Contoh: fix bug di endpoint, tweak UI portal, refactor function, update text/copy.

### 1a. Local (Mac) — verify + commit + push

```bash
cd /Users/idea/Projects/ecc-core-platform

# Build local untuk catch TypeScript error sebelum push
pnpm build 2>&1 | tail -20

# Type check tambahan kalau perlu
pnpm type-check 2>&1 | tail -10

# Review changes
git status
git diff --stat

# Commit + push
git add <files-changed>
git commit -m "fix(scope): brief description

Detail kenapa perubahan ini diperlukan dan apa yang ke-impact."
git push origin main
```

### 1b. VPS — pull + build + restart

```bash
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform

# Pull commit baru
git pull origin main
git log -1 --stat | head -15

# Build (turbo cache aware — cuma rebuild yang berubah)
pnpm build 2>&1 | tail -20

# Reload PM2 dengan env baru (zero-downtime)
pm2 reload ecosystem.config.cjs --update-env

# Tunggu settle + cek logs untuk error
sleep 3
pm2 list
pm2 logs --lines 20 --nostream
```

### 1c. Verify

```bash
# Health check API
curl https://api.eccchurch.global/health

# Smoke test portal
curl -I https://portal.eccchurch.global/
```

Hard reload browser (Cmd+Shift+R) — verify perubahan visible.

---

## Skenario 2 — Code change + new npm dependency

Contoh: tambah library baru (`pnpm add some-lib` di app/core-api atau packages/*).

### 2a. Local — install + verify + commit + push

```bash
cd /Users/idea/Projects/ecc-core-platform

# Install di app/package yang relevant
pnpm --filter @ecc/core-api add some-lib
# Atau ke package: pnpm --filter @ecc/auth add some-lib

# Build untuk verify type-check pass
pnpm build 2>&1 | tail -20

git status   # confirm package.json + pnpm-lock.yaml berubah

git add apps/core-api/package.json pnpm-lock.yaml <file-yang-pakai-lib>
git commit -m "feat: add some-lib for X purpose"
git push origin main
```

### 2b. VPS — pull + install + build + restart

```bash
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform

git pull origin main

# pnpm install — lock file baru akan di-install
pnpm install

# Verify lib ter-install
ls apps/core-api/node_modules/some-lib 2>&1 | head -2

# Build + restart
pnpm build 2>&1 | tail -20
pm2 reload ecosystem.config.cjs --update-env
sleep 3
pm2 list
pm2 logs --lines 20 --nostream
```

---

## Skenario 3 — Code change + new env variable

Contoh: tambah feature yang butuh API key external baru, atau flag baru di runtime.

### 3a. Local — update .env.example + ecosystem + code

**⚠️ WAJIB update 3 tempat:**
1. `.env.example` — template untuk dev baru
2. `ecosystem.config.cjs` `sharedEnv` object — supaya ke-inject ke PM2
3. Code yang baca env (mis. `process.env.NEW_VAR`)

```bash
cd /Users/idea/Projects/ecc-core-platform

# Edit ketiga file via editor
# Lalu test local — pastikan tidak ada typo
pnpm build 2>&1 | tail -20

git status
git add .env.example ecosystem.config.cjs <code-files>
git commit -m "feat: add NEW_VAR env for X feature

NEW_VAR default value docs.
Source: openssl rand -hex 16 (atau dapat dari mana)."
git push origin main
```

### 3b. VPS — pull + update .env + build + restart

```bash
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform

git pull origin main

# Tambah env var baru ke .env (jangan paste secret di chat!)
nano .env
# Tambah: NEW_VAR="actual-secret-value-here"
# Save + exit (Ctrl+O, Enter, Ctrl+X)

# Verify ter-tulis
grep NEW_VAR .env

# Test ecosystem load .env baru
node -e "const c=require('/var/www/ecc-core-platform/ecosystem.config.cjs'); console.log('NEW_VAR set:', !!c.apps[0].env.NEW_VAR);"

# Build + restart
pnpm build 2>&1 | tail -20
pm2 reload ecosystem.config.cjs --update-env   # --update-env critical untuk env baru
sleep 3
pm2 logs ecc-core-api --lines 20 --nostream
```

**⚠️ Catatan kalau env baru itu `NEXT_PUBLIC_*`:**
- Portal harus **rebuild** (bukan cuma reload PM2) — env client-side di-bake build-time.
- Setelah build, `pm2 delete ecc-portal && pm2 start ecosystem.config.cjs --only ecc-portal` (delete + start, bukan reload).
- Hard reload browser untuk clear cached chunks.

---

## Skenario 4 — Code change + Prisma migration (schema change)

Contoh: tambah kolom baru, tambah table, ubah constraint.

### 4a. Local — buat migration + verify

```bash
cd /Users/idea/Projects/ecc-core-platform

# Edit packages/database/prisma/schema.prisma
# Lalu create migration (jangan langsung db push, harus ada file SQL trackable)
pnpm --filter @ecc/database db:migrate
# Prompt: kasih nama migration deskriptif, mis. "add_jemaat_alergi_field"

# Verify migration file ke-generate
ls packages/database/prisma/migrations/ | tail -3

# Edit migration SQL kalau perlu (mis. tambah RBAC backfill, default value, dll)
# Lihat pattern di migration existing — semua punya RBAC backfill kalau tambah menu

# Build untuk verify Prisma client + type-check pass
pnpm build 2>&1 | tail -20

git status
git add packages/database/prisma/schema.prisma \
        packages/database/prisma/migrations/<timestamp>_<name>/ \
        <code-files>
git commit -m "feat(db): add <field>/<table> for <feature>

Migration: <timestamp>_<name>
- ADD COLUMN / CREATE TABLE
- Backfill default kalau ada
- RBAC entry kalau menu baru"
git push origin main
```

### 4b. VPS — pull + migrate + build + restart

**⚠️ Migration urutan kritis. Migrate DULU, baru build + restart.**

```bash
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform

# Backup database SEBELUM migration (just in case)
pg_dump -U ecc_user -h localhost -p 5432 ecc_platform > /tmp/ecc_pre_migration_$(date +%Y%m%d_%H%M%S).sql
ls -lh /tmp/ecc_pre_migration_*.sql

git pull origin main
pnpm install   # in case Prisma client perlu regenerate

# Apply migration (db:migrate:deploy — production-safe, tidak interactive)
pnpm --filter @ecc/database db:migrate:deploy 2>&1 | tail -20

# Build + restart
pnpm build 2>&1 | tail -20
pm2 reload ecosystem.config.cjs --update-env
sleep 3
pm2 logs ecc-core-api --lines 20 --nostream

# Verify schema applied (psql)
psql "postgresql://ecc_user:EccGlobal2026%40@localhost:5432/ecc_platform" -c "\d nama_table_yang_berubah"
```

**Kalau migration GAGAL:**

```bash
# Check apa yang gagal
pnpm --filter @ecc/database db:migrate:deploy 2>&1
# Atau cek _prisma_migrations table:
psql "postgresql://ecc_user:EccGlobal2026%40@localhost:5432/ecc_platform" -c "SELECT * FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5;"

# Kalau perlu rollback manual:
psql "postgresql://ecc_user:EccGlobal2026%40@localhost:5432/ecc_platform" < /tmp/ecc_pre_migration_<timestamp>.sql
```

---

## Skenario 5 — Emergency rollback

Kalau deploy bikin production rusak dan perlu instant revert.

### 5a. Rollback via git (paling cepat)

```bash
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform

# Cek commit history
git log --oneline -10

# Revert ke commit sebelumnya (last known good)
git reset --hard <commit-hash-yg-stable>

# Rebuild + restart
pnpm install
pnpm build 2>&1 | tail -20
pm2 reload ecosystem.config.cjs --update-env
```

**⚠️ Kalau commit yang di-rollback include migration:**
- Database schema sudah berubah, code lama mungkin tidak compatible.
- Solusi: restore database dari backup pre-migration:
  ```bash
  pm2 stop all   # stop traffic dulu
  psql "postgresql://ecc_user:EccGlobal2026%40@localhost:5432/ecc_platform" < /tmp/ecc_pre_migration_<timestamp>.sql
  pm2 reload ecosystem.config.cjs --update-env
  ```

### 5b. Force push fix dari Mac (kalau ada hotfix urgent)

```bash
# Di Mac
cd /Users/idea/Projects/ecc-core-platform
# Fix bug → commit → push
git push origin main

# Di VPS
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform
git pull origin main
pnpm build && pm2 reload ecosystem.config.cjs --update-env
```

---

## Skenario 6 — Restart tanpa code change (mis. setelah update .env manual)

```bash
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform

# Reload supaya pick up env baru
pm2 reload ecosystem.config.cjs --update-env
sleep 2
pm2 logs ecc-core-api --lines 15 --nostream
curl https://api.eccchurch.global/health
```

---

## Skenario 7 — Database backup manual

Restore strategy + setup pg_dump scheduled. Belum di-cron, lakukan manual sampai automated.

### Backup manual

```bash
ssh deploy@187.77.118.85

# Backup gz-compressed (recommended untuk database besar)
pg_dump -U ecc_user -h localhost -p 5432 ecc_platform \
  | gzip > /var/backups/ecc_platform_$(date +%Y%m%d_%H%M%S).sql.gz

ls -lh /var/backups/ecc_platform_*.sql.gz

# Optional: copy ke Mac via scp dari Mac local:
# scp deploy@187.77.118.85:/var/backups/ecc_platform_*.sql.gz ~/Backups/
```

### Setup automated backup (cron)

```bash
ssh deploy@187.77.118.85

# Buat backup script
sudo mkdir -p /var/backups
sudo chown deploy:deploy /var/backups

cat > /home/deploy/backup-ecc.sh <<'EOF'
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/var/backups
pg_dump -U ecc_user -h localhost -p 5432 ecc_platform \
  | gzip > $BACKUP_DIR/ecc_platform_$TIMESTAMP.sql.gz

# Retention 30 hari
find $BACKUP_DIR -name "ecc_platform_*.sql.gz" -mtime +30 -delete
EOF

chmod +x /home/deploy/backup-ecc.sh

# Setup cron — daily 02:00 WIB
crontab -e
# Tambah baris:
# 0 2 * * * /home/deploy/backup-ecc.sh > /var/log/ecc-backup.log 2>&1
```

---

## Cheat Sheet — Quick Reference

```bash
# === Health & Status ===
pm2 list                                                # process status
pm2 logs ecc-core-api --lines 30 --nostream            # recent logs
curl https://api.eccchurch.global/health                # API up?
curl -I https://portal.eccchurch.global/                # Portal up?
sudo nginx -t                                           # nginx config valid?
sudo systemctl status certbot.timer                     # SSL auto-renew aktif?

# === Restart variants ===
pm2 reload ecosystem.config.cjs --update-env           # zero-downtime, pick up env baru
pm2 restart ecc-core-api                                # hard restart 1 process
pm2 delete all && pm2 start ecosystem.config.cjs       # nuclear option

# === Build variants ===
pnpm build                                              # full (turbo cache aware)
pnpm --filter @ecc/core-api build                       # cuma core-api
pnpm --filter @ecc/portal build                         # cuma portal (rebuild bundle untuk NEXT_PUBLIC_*)
rm -rf .turbo packages/*/dist apps/*/dist apps/portal/.next   # full clean before build

# === Database ===
pnpm --filter @ecc/database db:migrate:deploy          # apply pending migrations
pnpm --filter @ecc/database db:studio                  # GUI (port 5555, akses via SSH tunnel)

# === SSH tunnel untuk db:studio dari Mac ===
ssh -L 5555:localhost:5555 deploy@187.77.118.85       # buka di terminal Mac, biarkan running
# Lalu di VPS shell: pnpm --filter @ecc/database db:studio
# Buka http://localhost:5555 di Mac browser
```

---

## Pre-Deploy Checklist (gunakan tiap kali deploy ke prod)

Sebelum push ke main + deploy:

- [ ] Build local sukses tanpa error (`pnpm build`)
- [ ] Type-check pass (`pnpm type-check`)
- [ ] Lint pass (`pnpm lint`) — kalau ada perubahan TS
- [ ] Migration file diff sudah di-review — tidak ada DROP atau destructive change yang tidak diinginkan
- [ ] `.env.example` updated kalau ada env var baru
- [ ] `ecosystem.config.cjs` `sharedEnv` updated kalau ada env var baru
- [ ] Commit message clear + ada body jelaskan kenapa
- [ ] Kalau touching auth/RBAC — extra review
- [ ] Kalau touching migration — backup database SEBELUM apply

Post-deploy verify:

- [ ] `pm2 list` — both apps online, restart count tidak nambah unusual
- [ ] `pm2 logs --lines 20` — tidak ada error baru
- [ ] `curl /health` — 200 OK
- [ ] Hard reload portal di browser — feature baru visible
- [ ] Smoke test endpoint yang di-touch (mis. login flow kalau ubah auth)
- [ ] Server Health page di portal — semua green (port, db, disk, memory)

---

## Common Issues & Quick Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| `ERR_CONNECTION_REFUSED localhost:4100` di browser | `NEXT_PUBLIC_CORE_API_URL` salah di bundle | Rebuild portal + hard reload |
| `SyntaxError: Unexpected identifier 'global'` | Workspace package belum compile ke dist/ | `pnpm build` (3 packages harus compile) |
| `Cannot find module 'X'` | Transitive dep tidak ke-hoist | Tambah `X` sebagai direct dep di `apps/<app>/package.json` |
| `JWT_SECRET missing or too short` | `.env` tidak ke-load atau ecosystem.config.cjs lupa pass var | Cek `node -e "console.log(require('./ecosystem.config.cjs').apps[0].env.JWT_SECRET?.length)"` |
| Gambar upload 404 | Path mismatch `UPLOADS_DIR` vs Nginx alias | Cek absolute path + permission `deploy:www-data 755` |
| Certbot renew fail | DNS expired / firewall block 80 | `sudo certbot renew --dry-run`, fix DNS atau ufw |
| `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` | Express tidak trust proxy | Sudah fixed di code (app.set('trust proxy', 1)) |
| PM2 process loop crash | Build artifact stale | `pnpm build` lalu `pm2 delete all && pm2 start ecosystem.config.cjs` |

---

*Dokumen ini di-update saat ada perubahan deploy procedure. Sources of truth: `ecosystem.config.cjs` + `docs/deployment-runbook.md` (initial setup) + section 27 di `knowledge-base.md`.*
