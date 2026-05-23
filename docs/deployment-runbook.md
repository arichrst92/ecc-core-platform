# Deployment Runbook — ECC Core Platform ke VPS Production

**Target**: VPS 187.77.118.85, Ubuntu 22.04 LTS
**Domains**: `portal.eccchurch.global` (Next.js portal) + `api.eccchurch.global` (Express backend)
**DNS**: Namecheap
**Data**: Migrasi dari local Postgres 16 ke VPS Postgres 16

---

## Phase 1 — DNS di Namecheap

Login ke Namecheap → Domain List → klik **MANAGE** di sebelah `eccchurch.global` → tab **Advanced DNS** → **ADD NEW RECORD**:

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `portal` | `187.77.118.85` | Automatic / 5 min |
| A Record | `api` | `187.77.118.85` | Automatic / 5 min |

Klik **SAVE ALL CHANGES**. Tunggu propagation ~5–30 menit.

Verifikasi dari komputer lokal:
```bash
dig +short portal.eccchurch.global    # harus return 187.77.118.85
dig +short api.eccchurch.global       # harus return 187.77.118.85
```

Kalau belum resolve, tunggu lebih lama atau cek via online tool `https://dnschecker.org`.

---

## Phase 2 — Initial VPS Setup

### 2.1 SSH pertama kali ke VPS

```bash
ssh root@187.77.118.85
# Atau kalau user beda: ssh <user>@187.77.118.85
```

Password dari provider VPS. Saat prompt fingerprint, ketik `yes`.

### 2.2 Update system + install essentials

```bash
apt update && apt upgrade -y
apt install -y git curl wget build-essential ca-certificates gnupg unzip
```

### 2.3 Setup user `deploy` + sudo

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

# Allow deploy sudo tanpa password (optional, untuk CI/CD smooth)
echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
chmod 0440 /etc/sudoers.d/deploy

# Copy authorized_keys root ke deploy supaya SSH masuk
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null || echo "No root keys, skipping"
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys 2>/dev/null || true
```

Dari **komputer lokal**, generate SSH key khusus deploy:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/ecc-deploy -N "" -C "ecc-deploy@$(hostname)"
# Hasil: ~/.ssh/ecc-deploy (private) + ecc-deploy.pub (public)

cat ~/.ssh/ecc-deploy.pub
# Copy output → paste ke VPS
```

Di VPS (sebagai root atau deploy):
```bash
echo "<paste public key>" >> /home/deploy/.ssh/authorized_keys
```

Test dari lokal:
```bash
ssh -i ~/.ssh/ecc-deploy deploy@187.77.118.85
# Harusnya langsung masuk tanpa password
```

### 2.4 Firewall ufw

```bash
# Login sebagai deploy (atau root, terus sudo)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH        # port 22
sudo ufw allow 'Nginx Full'    # port 80 + 443
sudo ufw enable
sudo ufw status
```

⚠️ **Pastikan port 22 (SSH) sudah di-allow SEBELUM enable ufw**, jangan sampai kena lock-out.

### 2.5 Set timezone (opsional, untuk log readable + cron WIB)

```bash
sudo timedatectl set-timezone Asia/Jakarta
date    # verify WIB
```

---

## Phase 3 — Install Dependencies

### 3.1 Node 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # v20.x
```

### 3.2 pnpm 9 via corepack

```bash
sudo corepack enable
sudo corepack prepare pnpm@9.7.0 --activate
pnpm --version    # 9.7.0
```

### 3.3 PM2

```bash
sudo npm install -g pm2
pm2 --version
```

### 3.4 PostgreSQL 16

Ubuntu 22.04 default = Postgres 14. Tambah PGDG repo untuk Postgres 16:

```bash
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'

sudo apt update
sudo apt install -y postgresql-16 postgresql-client-16
sudo systemctl status postgresql    # active (running)
psql --version    # psql (PostgreSQL) 16.x
```

### 3.5 Nginx + Certbot (Let's Encrypt)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl status nginx
```

---

## Phase 4 — Setup Database di VPS

```bash
# Create user + database via psql sebagai postgres
sudo -u postgres psql <<EOF
CREATE USER ecc_user WITH PASSWORD 'ganti-dengan-password-kuat-min-16-char';
CREATE DATABASE ecc_platform OWNER ecc_user;
GRANT ALL PRIVILEGES ON DATABASE ecc_platform TO ecc_user;
\q
EOF

# Test koneksi
psql -h localhost -U ecc_user -d ecc_platform -c "SELECT version();"
# Akan prompt password
```

⚠️ **Simpan password** — akan dipakai di `.env` step Phase 5.

---

## Phase 5 — Clone Repo + Setup .env

```bash
# Login sebagai deploy
sudo -i -u deploy
cd ~

# Buat parent dir
sudo mkdir -p /var/www
sudo chown deploy:deploy /var/www

cd /var/www
git clone https://github.com/<github-org>/ecc-core-platform.git
cd ecc-core-platform

# Copy .env.example
cp .env.example .env
nano .env
```

**Isi `.env` minimal:**

```bash
NODE_ENV=production
LOG_LEVEL=info

# Database — pakai password yang baru kamu set di Phase 4
DATABASE_URL="postgresql://ecc_user:ganti-dengan-password-kuat-min-16-char@localhost:5432/ecc_platform?schema=public"

# JWT — generate 2 secret kuat (32+ chars)
JWT_SECRET="<run di terminal: openssl rand -base64 48>"
JWT_EXPIRES_IN="7d"
JWT_REFRESH_EXPIRES_IN="30d"

# Liveness gate secret terpisah (recommended)
LIVENESS_NONCE_SECRET="<openssl rand -base64 48>"

# WhatsApp Fonnte
FONNTE_TOKEN="<token dari https://fonnte.com dashboard>"

# OTP
OTP_LENGTH=6
OTP_EXPIRES_SECONDS=300
OTP_MAX_ATTEMPTS=3
OTP_RESEND_COOLDOWN_SECONDS=60

# Face recognition
FACE_MATCH_THRESHOLD=0.5

# File storage (persistent di VPS)
UPLOADS_DIR="/var/www/ecc-core-platform/uploads"
UPLOAD_MAX_BYTES=5242880

# Ports (internal — Nginx reverse proxy ke port ini)
PORT=4100
HOST=0.0.0.0

# URLs (production)
PORTAL_URL="https://portal.eccchurch.global"
CORE_API_URL="https://api.eccchurch.global"
NEXT_PUBLIC_CORE_API_URL="https://api.eccchurch.global"

# CORS
CORS_ALLOWED_ORIGINS="https://portal.eccchurch.global"

# Scheduled jobs
AUDIT_LOG_RETENTION_DAYS=365
REMINDER_SEND_HOUR_START=7
REMINDER_SEND_HOUR_END=10
```

Save (Ctrl+O, Enter, Ctrl+X di nano).

**Quick generate secrets:**
```bash
openssl rand -base64 48    # untuk JWT_SECRET
openssl rand -base64 48    # untuk LIVENESS_NONCE_SECRET
```

---

## Phase 6 — Migrasi Data dari Local ke VPS

### 6.1 Di komputer lokal — dump database

```bash
# Pastikan tidak ada koneksi aktif (stop core-api dev kalau jalan)
cd /Users/idea/Projects/ecc-core-platform

# Full dump (schema + data + migration history)
# Sesuaikan kredensial dengan .env lokal
pg_dump \
  --host=localhost \
  --port=5432 \
  --username=ecc_user \
  --dbname=ecc_platform \
  --no-owner --no-acl \
  --clean --if-exists \
  --file=ecc_platform_dump_$(date +%Y%m%d_%H%M).sql

# Hasil: ecc_platform_dump_20260523_1430.sql (~beberapa MB)
ls -lh ecc_platform_dump_*.sql
```

### 6.2 Transfer dump ke VPS

```bash
# Dari lokal — pakai SSH key yang sama dengan deploy
scp -i ~/.ssh/ecc-deploy \
  ecc_platform_dump_*.sql \
  deploy@187.77.118.85:/tmp/
```

### 6.3 Restore di VPS

```bash
# SSH ke VPS sebagai deploy
ssh -i ~/.ssh/ecc-deploy deploy@187.77.118.85

# Restore — `--clean --if-exists` di dump tadi sudah handle DROP existing
psql --host=localhost --username=ecc_user --dbname=ecc_platform --file=/tmp/ecc_platform_dump_*.sql

# Verify row counts beberapa table utama
psql --host=localhost --username=ecc_user --dbname=ecc_platform -c "
SELECT 'sinode' AS tbl, COUNT(*) FROM sinode
UNION ALL SELECT 'cabang_gereja', COUNT(*) FROM cabang_gereja
UNION ALL SELECT 'jemaat', COUNT(*) FROM jemaat
UNION ALL SELECT 'ibadah', COUNT(*) FROM ibadah
UNION ALL SELECT 'event', COUNT(*) FROM event
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;
"

# Bersihkan dump file
rm /tmp/ecc_platform_dump_*.sql
```

⚠️ **Kalau ada error**: cek versi Postgres lokal vs VPS (`pg_dump --version`), lalu re-export dengan format compatible.

### 6.4 Migrasi folder `uploads/` (foto profile, hero image, PDF, dst)

```bash
# Dari komputer lokal — rsync incremental
cd /Users/idea/Projects/ecc-core-platform

rsync -avz --progress \
  -e "ssh -i ~/.ssh/ecc-deploy" \
  uploads/ \
  deploy@187.77.118.85:/var/www/ecc-core-platform/uploads/

# Verify di VPS
ssh -i ~/.ssh/ecc-deploy deploy@187.77.118.85 \
  "du -sh /var/www/ecc-core-platform/uploads/ && \
   ls /var/www/ecc-core-platform/uploads/"
```

⚠️ **Pastikan permission**: di VPS, `chown -R deploy:deploy /var/www/ecc-core-platform/uploads/` kalau perlu.

---

## Phase 7 — First Deploy di VPS

```bash
# SSH sebagai deploy
ssh -i ~/.ssh/ecc-deploy deploy@187.77.118.85
cd /var/www/ecc-core-platform

# Install dependencies (frozen lockfile dari repo)
pnpm install --frozen-lockfile

# Generate Prisma client (postinstall biasanya jalan, tapi explicit jaga-jaga)
pnpm --filter @ecc/database db:generate

# Verifikasi schema vs DB konsisten — kalau dump+restore sudah lengkap
# termasuk migration history, ini tidak perlu apa-apa. Kalau ada migration
# baru yang belum di-apply di local saat dump:
pnpm --filter @ecc/database db:migrate:deploy

# Build semua apps (turbo cache)
pnpm turbo build

# Verify build artifacts
ls apps/core-api/dist/index.js
ls apps/portal/.next/BUILD_ID
```

### 7.1 PM2 start + persist

```bash
cd /var/www/ecc-core-platform
pm2 start ecosystem.config.cjs
pm2 save

# Auto-start setelah VPS reboot
pm2 startup
# Output akan kasih command sudo — copy-paste dan jalankan
# Mis: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u deploy --hp /home/deploy

# Verify
pm2 status    # ecc-core-api + ecc-portal harus "online"
pm2 logs --lines 20    # quick sanity check no errors
```

### 7.2 Test internal connectivity

```bash
# Dari VPS — pastikan service listen di port internal
curl -s http://localhost:4100/health    # core-api health
curl -s -I http://localhost:3100/        # portal (HTML response 200)
```

---

## Phase 8 — Nginx Reverse Proxy

### 8.1 Config portal (port 3100)

```bash
sudo nano /etc/nginx/sites-available/portal.eccchurch.global
```

Paste:
```nginx
server {
  listen 80;
  listen [::]:80;
  server_name portal.eccchurch.global;

  # Body size untuk file upload (dilihat dari mobile via API, tapi safety)
  client_max_body_size 10M;

  location / {
    proxy_pass http://localhost:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 60s;
  }
}
```

### 8.2 Config API (port 4100)

```bash
sudo nano /etc/nginx/sites-available/api.eccchurch.global
```

Paste:
```nginx
server {
  listen 80;
  listen [::]:80;
  server_name api.eccchurch.global;

  # Lebih besar untuk upload hero image (5MB) + PDF (5MB)
  client_max_body_size 20M;

  # Core API
  location / {
    proxy_pass http://localhost:4100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;     # face recognition + image processing bisa lambat
  }

  # Static uploads — serve langsung via Nginx (lebih cepat + hemat Node)
  location /uploads/ {
    alias /var/www/ecc-core-platform/uploads/;
    expires 7d;
    add_header Cache-Control "public, immutable";
    access_log off;
  }
}
```

### 8.3 Enable + reload

```bash
sudo ln -s /etc/nginx/sites-available/portal.eccchurch.global /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/api.eccchurch.global /etc/nginx/sites-enabled/

# Remove default site kalau ada
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t
# Harusnya: "syntax is ok" + "test is successful"

sudo systemctl reload nginx
```

### 8.4 Test HTTP (sebelum SSL)

```bash
# Dari komputer lokal
curl -I http://portal.eccchurch.global/    # harus 200 / 307 redirect
curl -s http://api.eccchurch.global/health    # harus { "status": "ok", ... }
```

Kalau timeout: cek DNS sudah propagate (`dig +short portal.eccchurch.global`), atau firewall VPS allow 80.

---

## Phase 9 — SSL via Let's Encrypt (Certbot)

Email valid (untuk renewal warnings):

```bash
sudo certbot --nginx \
  -d portal.eccchurch.global \
  -d api.eccchurch.global \
  --non-interactive --agree-tos \
  --email admin@eccchurch.global \
  --redirect

# Outputnya akan modify Nginx config untuk add SSL + auto-redirect HTTP→HTTPS
```

Certbot auto-renew:
```bash
# Verifikasi systemd timer aktif
sudo systemctl status certbot.timer
# Dry-run renewal untuk pastikan setup OK
sudo certbot renew --dry-run
```

Buka browser:
- `https://portal.eccchurch.global` — should show login page
- `https://api.eccchurch.global/health` — should show `{"status":"ok"}`

🔒 Gembok hijau = SSL aktif.

---

## Phase 10 — Verify End-to-End

### 10.1 Login portal

1. Buka `https://portal.eccchurch.global`
2. Masukkan nomor HP Fulltimer (yang sudah ada di DB hasil restore)
3. Klik Kirim OTP → cek WhatsApp Anda → masukkan kode
4. Dashboard muncul → sidebar menu lengkap

### 10.2 Smoke test fitur kritis

- Klik Jemaat → list tampil dengan data hasil restore
- Klik Ibadah → kalender + occurrence appear
- Klik **Server Health** → semua stat hijau, fonnte configured, liveness secret set
- Klik **Maintenance** → trigger refresh-token cleanup → toast sukses

### 10.3 Mobile app

Update endpoint di mobile app `.env.production` (atau equivalent):
```
API_URL=https://api.eccchurch.global
```

Test login + fetch data di mobile app.

---

## Phase 11 — Setup CI/CD (Optional, Recommended)

Sudah ada workflow `.github/workflows/ci.yml`. Tinggal set secrets:

### 11.1 GitHub Secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `VPS_HOST` | `187.77.118.85` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | Full content `~/.ssh/ecc-deploy` (private key, mulai `-----BEGIN OPENSSH PRIVATE KEY-----` sampai `-----END OPENSSH PRIVATE KEY-----`) |
| `VPS_PORT` | `22` (opsional, default 22) |
| `DEPLOY_PATH` | `/var/www/ecc-core-platform` |

### 11.2 Test CI

```bash
# Dari lokal, push small change
cd /Users/idea/Projects/ecc-core-platform
echo "# Production deployment 2026-05-23" >> README.md
git add README.md
git commit -m "chore: trigger CI/CD test"
git push origin main
```

Buka GitHub → Actions tab → workflow harus jalan validate → deploy job → success.

Verify di VPS: `pm2 logs ecc-core-api --lines 20` → restart event muncul.

---

## Phase 12 — Hardening Post-Launch (Recommended)

### 12.1 Backup automation (cron daily 02:00 WIB)

```bash
sudo nano /etc/cron.daily/ecc-backup.sh
```

Paste:
```bash
#!/bin/bash
set -e
BACKUP_DIR="/var/backups/ecc"
mkdir -p "$BACKUP_DIR"
DATE=$(date +%Y%m%d_%H%M)

# DB dump
sudo -u postgres pg_dump ecc_platform | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Uploads tar
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C /var/www/ecc-core-platform uploads/

# Retention: keep last 14 days
find "$BACKUP_DIR" -name "*.gz" -mtime +14 -delete

# Optional: rsync ke storage offsite (S3/Backblaze/dst)
# rsync -avz "$BACKUP_DIR/" backup@offsite-server:/ecc-backups/
```

```bash
sudo chmod +x /etc/cron.daily/ecc-backup.sh
sudo /etc/cron.daily/ecc-backup.sh    # test run
ls -lh /var/backups/ecc/    # cek hasil
```

### 12.2 Monitoring sederhana

PM2 sudah punya basic monitoring. Untuk external uptime check:

- Sign up gratis di `uptimerobot.com` atau `betterstack.com`
- Add monitor untuk `https://api.eccchurch.global/health` (interval 5 menit)
- Alert via email/Slack/WA kalau down

### 12.3 Firewall tighten

```bash
sudo ufw status verbose
# Postgres 5432 tidak boleh di-expose ke internet — pastikan tidak ada `ufw allow 5432`
# Kalau perlu remote DB access untuk dev, gunakan SSH tunnel (ssh -L 5432:localhost:5432 deploy@vps)
```

---

## Troubleshooting

### DNS belum propagate

```bash
dig +short portal.eccchurch.global    # kosong = belum
# Tunggu sampai 60 menit, atau cek via dnschecker.org
```

### Certbot gagal

```bash
sudo certbot --nginx -d portal.eccchurch.global -v
# Common cause: DNS belum propagate, atau firewall block port 80
# Solusi: tunggu DNS, atau allow port 80: sudo ufw allow 80
```

### Service tidak start

```bash
pm2 logs ecc-core-api --lines 100    # cek error stack
pm2 logs ecc-portal --lines 100
pm2 status

# Restart manual
pm2 restart ecc-core-api
pm2 restart ecc-portal

# Clean build kalau perlu
cd /var/www/ecc-core-platform
rm -rf apps/core-api/dist apps/portal/.next
pnpm turbo build
pm2 reload ecosystem.config.cjs --update-env
```

### Database connection error

```bash
# Cek Postgres listening
sudo systemctl status postgresql
sudo ss -tlnp | grep 5432

# Test connection sebagai ecc_user
psql -h localhost -U ecc_user -d ecc_platform -c "SELECT 1;"
```

### Migrate error

```bash
# Cek state migration
cd /var/www/ecc-core-platform
pnpm --filter @ecc/database exec prisma migrate status

# Kalau drift: re-deploy migrations
pnpm --filter @ecc/database db:migrate:deploy
```

### Permission error di uploads

```bash
sudo chown -R deploy:deploy /var/www/ecc-core-platform/uploads
sudo chmod -R 755 /var/www/ecc-core-platform/uploads
```

### Rollback ke commit sebelumnya

```bash
cd /var/www/ecc-core-platform
git log --oneline -10
git reset --hard <commit-sha>
./scripts/deploy.sh
```

⚠️ Migration tidak ada "down" — kalau migration sudah jalan, rollback DB butuh restore dari backup.

---

## Catatan Lain

- **Fonnte WhatsApp**: pastikan device WA terhubung di dashboard Fonnte sebelum production launch. Token expired → OTP gagal kirim.
- **Cabang admin scoping**: saat ini cuma Fulltimer yang punya akses portal. Untuk multi-cabang admin, butuh setup role baru (lihat `knowledge-base.md` section 12 outstanding items).
- **Liveness V2 cutover** target 2026-06-01 — flip nonce dari optional ke required setelah mobile confirm migrate.
- **Migration baru** di repo nanti akan otomatis di-apply via `scripts/deploy.sh` saat CI deploy → `prisma migrate deploy`.
