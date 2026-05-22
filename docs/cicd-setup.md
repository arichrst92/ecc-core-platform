# CI/CD Setup — GitHub Actions + VPS deploy

Pipeline: setiap push ke `main` jalankan validate (lint + type-check + build), kalau pass auto-deploy ke VPS via SSH.

## Arsitektur

```
GitHub push main
    │
    ▼
┌────────────────────────────────────┐
│ GitHub Actions: validate job       │
│  - install deps                    │
│  - prisma generate + format check  │
│  - turbo lint + type-check + build │
└────────────────────────────────────┘
    │ (pass)
    ▼
┌────────────────────────────────────┐
│ GitHub Actions: deploy job         │
│  SSH → VPS → scripts/deploy.sh     │
│   - git pull                       │
│   - pnpm install                   │
│   - prisma migrate deploy          │
│   - turbo build                    │
│   - pm2 reload (zero-downtime)     │
└────────────────────────────────────┘
```

## First-time setup VPS

Asumsi: Ubuntu 22.04+, sudo access.

### 1. Install Node + pnpm + PM2

```bash
# Node 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# pnpm via corepack (bundled di Node 20+)
sudo corepack enable
sudo corepack prepare pnpm@9.7.0 --activate

# PM2 global
sudo npm install -g pm2

# Verify
node --version    # v20.x
pnpm --version    # 9.7.0
pm2 --version
```

### 2. PostgreSQL setup

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER ecc_user WITH PASSWORD '<strong-password>';"
sudo -u postgres psql -c "CREATE DATABASE ecc_platform OWNER ecc_user;"
```

### 3. Setup deploy user + SSH key

```bash
# Buat user `deploy`
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy  # opsional kalau perlu apt install via deploy

# SSH key setup (generate di local machine kamu, bukan VPS)
ssh-keygen -t ed25519 -f ~/.ssh/ecc-deploy -N ""
# → menghasilkan ~/.ssh/ecc-deploy (private) + ecc-deploy.pub (public)

# Authorize public key di VPS
sudo mkdir -p /home/deploy/.ssh
echo "<paste public key content>" | sudo tee /home/deploy/.ssh/authorized_keys
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh

# Test dari local: ssh -i ~/.ssh/ecc-deploy deploy@<vps-host>
```

### 4. Clone repo + setup .env

```bash
sudo mkdir -p /var/www
sudo chown deploy:deploy /var/www
sudo -u deploy bash <<'EOF'
cd /var/www
git clone https://github.com/<org>/ecc-core-platform.git
cd ecc-core-platform
cp .env.example .env
# Edit .env — isi DATABASE_URL, JWT_SECRET, FONNTE_TOKEN, dll
nano .env
EOF
```

`.env` minimal yang wajib di-set:

```bash
NODE_ENV=production
DATABASE_URL=postgresql://ecc_user:<pwd>@localhost:5432/ecc_platform
JWT_SECRET=<32+ char random>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
FONNTE_TOKEN=<from fonnte.com dashboard>
PORT=4100
HOST=0.0.0.0
UPLOADS_DIR=/var/www/ecc-core-platform/uploads
CORE_API_URL=http://localhost:4100
PORTAL_URL=http://localhost:3100
CORS_ALLOWED_ORIGINS=https://ecc.id,https://portal.ecc.id
# Optional tuning
AUDIT_LOG_RETENTION_DAYS=365
REMINDER_SEND_HOUR_START=7
REMINDER_SEND_HOUR_END=10
LIVENESS_NONCE_SECRET=<another 32+ char random>
```

### 5. First deploy (manual)

```bash
sudo -u deploy bash
cd /var/www/ecc-core-platform
./scripts/deploy.sh
# Pertama kali akan: install, generate, migrate, build, pm2 start

# Auto-start saat VPS reboot
pm2 startup    # follow instructions yg di-print
pm2 save
```

### 6. Nginx reverse proxy (opsional tapi recommended)

```nginx
# /etc/nginx/sites-available/ecc
server {
  listen 443 ssl http2;
  server_name ecc.id;

  ssl_certificate /etc/letsencrypt/live/ecc.id/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/ecc.id/privkey.pem;

  # Portal
  location / {
    proxy_pass http://localhost:3100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 443 ssl http2;
  server_name api.ecc.id;

  ssl_certificate /etc/letsencrypt/live/api.ecc.id/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.ecc.id/privkey.pem;

  # Core API
  location / {
    proxy_pass http://localhost:4100;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 20M;  # untuk upload PDF/image
  }

  # Static uploads — bypass Express, serve via Nginx (lebih cepat)
  location /uploads/ {
    alias /var/www/ecc-core-platform/uploads/;
    expires 7d;
    add_header Cache-Control "public, immutable";
  }
}
```

Enable + reload:
```bash
sudo ln -s /etc/nginx/sites-available/ecc /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## GitHub secrets

Di repo GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Secret name | Value | Contoh |
|---|---|---|
| `VPS_HOST` | IP atau hostname VPS | `1.2.3.4` atau `ecc.id` |
| `VPS_USER` | SSH user | `deploy` |
| `VPS_SSH_KEY` | Private key full content | Paste isi `~/.ssh/ecc-deploy` (mulai `-----BEGIN OPENSSH...` sampai `-----END OPENSSH...`) |
| `VPS_PORT` | SSH port (optional) | `22` |
| `DEPLOY_PATH` | Path di VPS | `/var/www/ecc-core-platform` |

**Test secrets**: trigger manual run via Actions tab → CI workflow → Run workflow.

## Branch protection

Recommended di repo settings → Branches → Add rule untuk `main`:

- ✅ Require status checks to pass before merging
  - Status check: `Validate (lint, type-check, build)`
- ✅ Require branches to be up to date
- ✅ Require linear history (opsional)

Setelah aktif, PR ke main hanya bisa merge kalau CI pass.

## Troubleshooting

### Deploy gagal di `pnpm install --frozen-lockfile`

`pnpm-lock.yaml` di-update di local tapi belum di-commit. Solusi: commit lockfile, push.

### Deploy gagal di `prisma migrate deploy`

Migration baru ada issue. Check log via GitHub Actions logs atau di VPS:
```bash
sudo -u deploy bash
cd /var/www/ecc-core-platform
pnpm --filter @ecc/database db:migrate:deploy
```

### Service tidak restart setelah deploy

```bash
pm2 status                    # cek state
pm2 logs ecc-core-api         # cek log
pm2 reload ecc-core-api       # force reload
```

### Permission denied di /var/www/ecc-core-platform/uploads

```bash
sudo chown -R deploy:deploy /var/www/ecc-core-platform/uploads
```

### Rollback ke commit sebelumnya

```bash
ssh deploy@<vps-host>
cd /var/www/ecc-core-platform
git log --oneline -10
git reset --hard <commit-sha>
./scripts/deploy.sh
```

**Catatan migration rollback**: Prisma tidak ada "down" — kalau migration sudah jalan dan butuh rollback, harus manual SQL atau restore DB backup. Untuk safety, backup DB sebelum migration besar.

## Monitoring

```bash
pm2 monit                     # real-time CPU/RAM
pm2 status                    # quick health
sudo journalctl -u nginx -f   # nginx log
```

Scheduled-jobs log via pino di stdout — `pm2 logs ecc-core-api | grep "Scheduled jobs"`.
