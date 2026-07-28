# Sprint 2 Deploy Checklist — Shiftsoft Migration + Group + Magic Link

> **Status:** ⏸️ Pending deploy per 2026-07-28. Semua code + docs siap.
> **Referensi mobile handover:** `../../ecc-mobile-app/docs/backend-notice-*.md` (3 docs).
> **Deploy workflow umum:** `future-changes-deploy-workflow.md` (7 skenario template).
>
> Sprint ini mencakup 3 modul yg deploy bareng karena schema patch + endpoint + data migration semua saling dependent:
> - Shiftsoft legacy import (Jemaat +14 field, Group module 23)
> - Group visibility + notif WA
> - Magic Link email login + onboarding wizard + session 365d

---

## Ringkasan dampak

| Layer | Detail |
|---|---|
| Migrations baru | 5 file (`20260731000000_legacy_shiftsoft_fields`, `20260731100000_group`, `20260731200000_group_visibility`, `20260731300000_magic_link_onboarding`, `20260731400000_group_menu_rbac`) |
| Env vars baru | 8 SendGrid/magic-link + 8 SHIFTSOFT_HASH_* + `JWT_REFRESH_EXPIRES_IN` extended |
| Dependency baru | `@sendgrid/mail` (di `apps/core-api`) |
| Data migration | Import 6782 jemaat + 314 group dari 8 tenant Shiftsoft (via CLI script post-deploy) |
| Endpoint baru | 12 Group + 4 Magic-link + 1 me/group-membership |
| Breaking change | ❌ Tidak ada. Semua field baru nullable, response envelope tetap. |

---

## 1. Pre-deploy — verify local siap

```bash
cd /Users/<you>/Projects/ecc-core-platform

# 1. Pastikan branch bersih + up-to-date
git status
git pull origin main

# 2. Typecheck semua workspace
pnpm typecheck

# 3. Build produksi (catch error early)
pnpm build

# 4. Verify migration files valid Prisma
pnpm --filter @ecc/database exec prisma migrate diff \
  --from-migrations packages/database/prisma/migrations \
  --to-schema-datamodel packages/database/prisma/schema.prisma \
  --exit-code
# Expect: exit 0 (schema in sync with migrations)
```

---

## 2. Push branch + tag

```bash
# Tag release supaya rollback point jelas
git tag -a sprint-2-shiftsoft-group-magiclink -m "Sprint 2 deploy: Shiftsoft migration + Group + Magic Link"
git push origin main --tags
```

---

## 3. VPS deploy — step-by-step

SSH masuk dulu:

```bash
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform
```

### 3.1 Backup DB (WAJIB sebelum apply migration)

```bash
BACKUP_FILE="/var/backups/ecc/pre-sprint2-$(date +%Y%m%d-%H%M%S).sql.gz"
sudo mkdir -p /var/backups/ecc
sudo -u postgres pg_dump ecc_prod | gzip > $BACKUP_FILE
ls -lh $BACKUP_FILE
```

### 3.2 Pull code + install deps (@sendgrid/mail baru)

```bash
git fetch origin
git checkout main
git pull origin main

# Install deps — pnpm-lock updated
pnpm install --frozen-lockfile
```

### 3.3 Set env vars baru di `.env` root

Buka `nano .env` dan tambahkan (**JANGAN commit ke git**):

```env
# ─── SendGrid + Magic Link ───
SENDGRID_API_KEY="SG.xxxxx"                              # dari SendGrid dashboard
EMAIL_FROM="noreply@eccchurch.global"
EMAIL_FROM_NAME="Elshaddai Creative Community"
EMAIL_MAGIC_LINK_MOBILE_URL="ecc://auth/email/verify"    # deeplink app
EMAIL_MAGIC_LINK_WEB_URL="https://portal.eccchurch.global/auth/email/verify"
MAGIC_LINK_TTL_MINUTES=15

# ─── Session extended ─── (was 30d, JWT_ACCESS tetap 7d)
JWT_REFRESH_EXPIRES_IN="365d"

# ─── Shiftsoft migration (hanya untuk one-time import) ───
SHIFTSOFT_HASH_GLOBAL="xxx"
SHIFTSOFT_HASH_BANDUNG="xxx"
SHIFTSOFT_HASH_JAKARTA="xxx"
SHIFTSOFT_HASH_BALI="xxx"
SHIFTSOFT_HASH_MALANG="xxx"
SHIFTSOFT_HASH_SYDNEY="xxx"
SHIFTSOFT_HASH_KUALA_LUMPUR="xxx"
SHIFTSOFT_HASH_MAKASSAR="xxx"
```

Untuk value asli, ambil dari:
- SendGrid key: dashboard SendGrid (Ari punya credentials)
- SHIFTSOFT hashes: `.env.example.local` di dev machine

### 3.4 Apply migrations Prisma

```bash
cd packages/database
npx dotenv-cli -e ../../.env -- npx prisma migrate deploy
# Expect output: "5 migrations applied" (atau kurang kalau sudah pernah deploy sebagian)

npx dotenv-cli -e ../../.env -- npx prisma generate
cd ../..
```

**Verify tables baru:**

```bash
sudo -u postgres psql ecc_prod -c "\dt church_group group_member magic_link_token"
# Expect: 3 tables listed

sudo -u postgres psql ecc_prod -c "\d jemaat" | grep -E "onboarded_at|legacy_shiftsoft_id|tanggal_bergabung_gereja"
# Expect: 3 columns listed
```

### 3.5 Build + reload PM2 (zero-downtime)

```bash
pnpm build
pm2 reload ecosystem.config.js
pm2 logs --lines 30
# Cek tidak ada error boot, listen port 4100/3100
```

### 3.6 Smoke test API

```bash
# Basic health
curl -s https://api.eccchurch.global/health | jq

# Magic link endpoint reachable (should return generic success)
curl -s -X POST https://api.eccchurch.global/auth/email/request-magic-link \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@example.com"}' | jq
# Expect: {"success":true,"message":"Kalau email terdaftar..."}

# Group list (perlu JWT admin — skip kalau belum ada login)
```

---

## 4. Run Shiftsoft data migration (post-deploy, one-time)

Setelah migration & env siap, run script import (idempotent — aman rerun):

```bash
cd /var/www/ecc-core-platform

# Bootstrap 8 CabangGereja kalau belum ada
pnpm --filter @ecc/database db:seed-cabang

# Jemaat — semua tenant (~20-40 menit)
pnpm --filter @ecc/database db:migrate-shiftsoft -- --all --commit --exclude-system

# Group + membership — semua tenant (~5-10 menit)
pnpm --filter @ecc/database db:migrate-shiftsoft-groups -- --all --commit

# Cleanup system placeholder accounts
pnpm --filter @ecc/database db:migrate-shiftsoft-cleanup -- --commit

# Verify counts
sudo -u postgres psql ecc_prod -c "
SELECT
  (SELECT COUNT(*) FROM jemaat WHERE legacy_shiftsoft_id IS NOT NULL) AS jemaat_imported,
  (SELECT COUNT(*) FROM church_group WHERE legacy_shiftsoft_circle_id IS NOT NULL) AS group_imported,
  (SELECT COUNT(*) FROM group_member) AS memberships;
"
# Expect approx: jemaat_imported=6782, group_imported=314, memberships=2802
```

**Kalau ada error P2002 (unique collision):** script auto-null-retry hingga 4x per record. Report final di log stdout — cek `Collision-nulled` count.

---

## 5. Post-deploy verification

### 5.1 Backend

- [ ] `GET https://api.eccchurch.global/health` → 200
- [ ] `POST /auth/email/request-magic-link` → 200 generic response
- [ ] Login OTP existing masih jalan (regression check)
- [ ] PM2 logs bersih 5 menit setelah reload

### 5.2 Portal

- [ ] `https://portal.eccchurch.global/dashboard/jemaat/<any>` → tampil 14 field baru di form edit
- [ ] `https://portal.eccchurch.global/dashboard/group` → list group ter-import
- [ ] `https://portal.eccchurch.global/dashboard/group/<id>` → detail + members list
- [ ] Sidebar menampilkan "Group" di section Community
- [ ] Filter cabang + jenis di list page berfungsi
- [ ] PIC bisa toggle isPublic → joinCode auto-generate
- [ ] Add/remove member → notif WA terkirim (cek `notification_log` table)

### 5.3 Email delivery (SendGrid)

- [ ] Test request magic link ke jemaat real dengan email valid → cek inbox delivery (kadang masuk Spam pertama kali)
- [ ] Klik link → verify token → JWT terbit

### 5.4 Session

- [ ] Login → refresh → check refresh token expiry ~365 hari via jwt.io decode

---

## 6. Rollback plan (kalau perlu)

### Full rollback (belum ada user activity baru)

```bash
# 1. Restore DB dari backup
gunzip -c /var/backups/ecc/pre-sprint2-<timestamp>.sql.gz | sudo -u postgres psql ecc_prod

# 2. Rollback git ke tag sebelum sprint 2
git reset --hard <previous-tag-atau-sha>
pnpm install --frozen-lockfile
pnpm build
pm2 reload ecosystem.config.js
```

### Partial rollback (sudah ada data user baru, tidak mau lose)

Hanya rollback code + env, biarkan schema baru — semua schema change 100% additive (nullable), tidak break existing endpoint.

```bash
git reset --hard <previous-tag>
pnpm install --frozen-lockfile
pnpm build
pm2 reload ecosystem.config.js
# schema tetap ada extra columns / tables — Prisma toleran ke extra fields.
```

---

## 7. Communication ke stakeholder

Setelah verify sukses, kirim ke:

- **Tim mobile (Ari)** — WA/DM: "Sprint 2 sudah live di prod. 3 backend-notice docs di `ecc-mobile-app/docs/` sudah final, silakan mulai UI develop."
- **Pastor / admin gereja** — brief tentang data legacy sudah masuk, ada 46 system account deactivated (perlu review manual kalau ada nama valid yg salah ke-flag).
- **Cabang leaders** — kalau perlu, sosialisasi feature Group public/private + kode invitation via QR (Ari akan build di mobile app).

---

## Referensi

- **Deploy workflow umum:** `future-changes-deploy-workflow.md`
- **VPS runbook:** `deployment-runbook.md`
- **Backend notice docs (mobile):** `../../ecc-mobile-app/docs/backend-notice-shiftsoft-migration.md`, `backend-notice-magic-link-email-login.md`, `backend-notice-group-endpoints.md`
- **Shiftsoft migration script:** `packages/database/prisma/scripts/migrate-shiftsoft/README.md`

---

*Doc versi: 1.0 — 2026-07-28. Deprecate/archive doc ini setelah Sprint 2 deploy selesai + verified stable.*
