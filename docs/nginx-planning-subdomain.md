# Nginx Config — Planning Backlog di `/planning` path

Planning Backlog **tidak pakai subdomain**. Di-serve di
`https://portal.eccchurch.global/planning` via nginx reverse proxy ke PM2
process `ecc-planning` (port 3300).

Keuntungan same-origin dengan portal:

- **localStorage auto-shared** — login portal sekali, planning langsung bisa
  diakses tanpa SSO handoff.
- **Tidak perlu DNS record / cert SAN tambahan** — reuse `portal.eccchurch.global`.
- **CORS tidak perlu diubah** — API call dari planning ke `api.eccchurch.global`
  pakai origin yang sama (`portal.eccchurch.global`).

## Patch nginx server block `portal.eccchurch.global`

File: `/etc/nginx/sites-available/portal.eccchurch.global`

Tambah **location block `/planning`** di dalam server block HTTPS existing:

```nginx
server {
    listen 443 ssl http2;
    server_name portal.eccchurch.global;

    # ... (ssl_certificate, headers, dll — sudah ada) ...

    # Planning Backlog — reverse proxy ke apps/planning (PM2 ecc-planning).
    # Next.js basePath='/planning' udah include prefix, jadi proxy tanpa strip.
    location /planning {
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

    # Catch-all portal (sudah ada)
    location / {
        proxy_pass http://127.0.0.1:3100;
        # ... (header set sama seperti di atas) ...
    }
}
```

**PENTING**: location `/planning` HARUS **sebelum** location `/` di config file,
karena nginx match by longest prefix tapi urutan juga penting untuk clarity.

## Apply di VPS

```bash
ssh deploy@187.77.118.85

# Edit server block portal
sudo nano /etc/nginx/sites-available/portal.eccchurch.global
# → tambah location /planning block di atas location /

# Test config
sudo nginx -t

# Reload (zero-downtime)
sudo systemctl reload nginx

# Verify
curl -I https://portal.eccchurch.global/planning
# Harus return 200 (atau 307 redirect ke /planning/dashboard)
```

## Tidak ada DNS record / cert baru

- DNS: tidak perlu A record baru (reuse `portal.eccchurch.global`)
- SSL cert: tidak perlu `certbot --expand` (reuse cert existing)

## Deploy flow planning app di VPS

```bash
cd /var/www/ecc-core-platform
git pull
pnpm install

# Apply migration DB
pnpm --filter @ecc/database db:migrate:deploy
pnpm --filter @ecc/database db:generate

# Build shared-types bersih (hindari tsc buildinfo corrupt)
cd packages/shared-types && rm -rf dist tsconfig.tsbuildinfo && tsc && cd ../..

# Build apps
pnpm --filter @ecc/core-api build
pnpm --filter @ecc/portal build
pnpm --filter @ecc/planning build

# Start/reload PM2
pm2 reload ecosystem.config.cjs --update-env

# Verify
pm2 status
# Harus ada: ecc-core-api, ecc-portal, ecc-landing, ecc-planning
```

## Env vars

Pastikan di `.env` VPS ada (tidak ada env baru untuk planning subdomain lagi):

```
NEXT_PUBLIC_CORE_API_URL=https://api.eccchurch.global
# NEXT_PUBLIC_PLANNING_URL + NEXT_PUBLIC_OPERATIONS_URL udah TIDAK diperlukan
# karena planning diakses via path /planning di domain portal.
```

CORS_ALLOWED_ORIGINS **tidak perlu diubah** — planning app pakai origin yang sama
dengan portal (`portal.eccchurch.global`), bukan subdomain terpisah.

## User flow

1. User login portal https://portal.eccchurch.global/login
2. Click menu **Planning Backlog** di sidebar → new tab buka
   https://portal.eccchurch.global/planning
3. Planning app baca localStorage key `ecc-auth` (dibikin portal saat login) →
   authed, dashboard muncul langsung.
4. Kalau user bukan IT Minister Team: API return 403 → auto redirect ke
   `/planning/no-access` dengan pesan jelas.
