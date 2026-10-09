# Nginx Config — planning.eccchurch.global

Reverse proxy ke PM2 process `ecc-planning` di port 3300. SSL via Let's Encrypt
(SAN pakai `--expand` di certificate `eccchurch.global` existing, bukan cert
baru — lebih mudah renew).

## Nginx server block

File: `/etc/nginx/sites-available/planning.eccchurch.global`

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name planning.eccchurch.global;

    # Let's Encrypt renewal — serve challenge via webroot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect HTTP → HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name planning.eccchurch.global;

    # Pakai cert yang sama dengan eccchurch.global (SAN).
    ssl_certificate /etc/letsencrypt/live/eccchurch.global/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/eccchurch.global/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Max upload (walaupun planning app jarang upload, biar konsisten dgn portal)
    client_max_body_size 20M;

    # Proxy ke Next.js production server
    location / {
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }

    # Access + error logs terpisah per app untuk gampang debug
    access_log /var/log/nginx/planning.eccchurch.global.access.log;
    error_log /var/log/nginx/planning.eccchurch.global.error.log;
}
```

## Setup commands di VPS

```bash
# 1. SSH ke VPS
ssh deploy@187.77.118.85

# 2. Tulis config file
sudo nano /etc/nginx/sites-available/planning.eccchurch.global
# → paste isi di atas

# 3. Enable site
sudo ln -sf /etc/nginx/sites-available/planning.eccchurch.global \
  /etc/nginx/sites-enabled/planning.eccchurch.global

# 4. Test config (jangan apply kalau test fail!)
sudo nginx -t

# 5. Add subdomain ke cert via certbot --expand
# Daftar hostname yang sudah ada di cert eccchurch.global existing:
#   eccchurch.global, portal.eccchurch.global, api.eccchurch.global,
#   ckids.eccchurch.global, planning.eccchurch.global (BARU)
sudo certbot --nginx -d eccchurch.global -d portal.eccchurch.global \
  -d api.eccchurch.global -d ckids.eccchurch.global \
  -d planning.eccchurch.global --expand

# 6. Reload nginx
sudo systemctl reload nginx

# 7. Verify
curl -I https://planning.eccchurch.global
# Harus return 200 (atau 302 redirect ke /dashboard) dgn SSL valid
```

## DNS record

Tambah A record di Namecheap DNS:

```
Type:  A
Host:  planning
Value: 187.77.118.85
TTL:   Automatic
```

Verify propagation:
```bash
dig planning.eccchurch.global +short
# Harus return: 187.77.118.85
```

## Deploy flow planning app

Setelah DNS + Nginx + cert ready:

```bash
# Di VPS:
cd /var/www/ecc-core-platform
git pull

# Install dependencies (apps/planning akan masuk workspace)
pnpm install

# Apply migration DB
pnpm --filter @ecc/database db:migrate:deploy

# Build shared-types + planning app
pnpm --filter @ecc/shared-types build
pnpm --filter @ecc/planning build

# Start via PM2 (first time)
pm2 start ecosystem.config.cjs --only ecc-planning
# atau reload semua kalau mau refresh env:
pm2 reload ecosystem.config.cjs --update-env

# Save process list
pm2 save

# Verify
pm2 status
# Harus ada baris: ecc-planning   online
curl -I https://planning.eccchurch.global
```

## Env vars tambahan

Pastikan di `.env` VPS ada:

```
NEXT_PUBLIC_CORE_API_URL=https://api.eccchurch.global
NEXT_PUBLIC_PORTAL_URL=https://portal.eccchurch.global
NEXT_PUBLIC_PLANNING_URL=https://planning.eccchurch.global

# Tambah planning subdomain ke CORS whitelist core-api
CORS_ALLOWED_ORIGINS=https://portal.eccchurch.global,https://planning.eccchurch.global,https://eccchurch.global
```

Kalau belum ada, tambahkan sebelum reload PM2. Core-api perlu di-restart juga
setelah ubah `CORS_ALLOWED_ORIGINS`:

```bash
pm2 restart ecc-core-api --update-env
```
