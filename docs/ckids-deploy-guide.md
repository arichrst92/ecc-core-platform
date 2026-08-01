# Deploy Guide — CKids Gift Stall (`ckids.eccchurch.global`)

**Status:** Modul 28 pending deploy. Runbook standalone — bisa jalan setelah Modul 26+27 sudah live.

CKids app adalah **Next.js standalone** di `apps/ckids/` (port 3300). Deploy pattern sama dgn portal + landing, cuma butuh:
1. DNS record baru untuk subdomain
2. Nginx site config
3. Certbot SSL cert
4. PM2 process baru
5. Migration + Prisma generate (bareng deploy Modul 28 backend)

---

## 1. DNS setup

Di Hostinger DNS panel untuk `eccchurch.global`, tambah A record:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `ckids` | `187.77.118.85` | 3600 |

Verify propagation (dari Mac):
```bash
dig ckids.eccchurch.global +short
# Expect: 187.77.118.85
```

Propagation biasanya 5-30 menit.

---

## 2. Deploy di VPS

```bash
ssh deploy@187.77.118.85
cd /var/www/ecc-core-platform

# 2.1 Backup DB (WAJIB)
DBNAME="ecc_platform"
BACKUP="/var/backups/ecc/pre-modul28-$(date +%Y%m%d-%H%M%S).sql.gz"
sudo -u postgres pg_dump "$DBNAME" | gzip > "$BACKUP"
ls -lh "$BACKUP"

# 2.2 Pull + install
git pull origin main
pnpm install --frozen-lockfile

# 2.3 Migration Prisma (3 baru: 20260801000000, 20260801100000, 20260801200000)
cd packages/database
npx dotenv-cli -e ../../.env -- npx prisma migrate deploy
npx dotenv-cli -e ../../.env -- npx prisma generate
cd ../..

# 2.4 Build all
pnpm build

# 2.5 Symlink env untuk ckids (mirror pattern portal)
ln -sf /var/www/ecc-core-platform/.env /var/www/ecc-core-platform/apps/ckids/.env
```

---

## 3. Setup PM2 process untuk ckids

```bash
cd /var/www/ecc-core-platform/apps/ckids

# Start manually first time
pm2 start "npm start" --name ecc-ckids --cwd /var/www/ecc-core-platform/apps/ckids

# Verify running
pm2 list
# Expect: ecc-ckids online di port 3300

# Test local (bypass Nginx)
curl -sI http://localhost:3300 | head -3
# Expect: HTTP/1.1 307 (redirect ke /login) atau 200

# Save PM2 config supaya auto-restart on reboot
pm2 save
```

---

## 4. Nginx site config

```bash
sudo nano /etc/nginx/sites-available/ckids.eccchurch.global
```

Paste config berikut (mirror portal + landing pattern):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ckids.eccchurch.global;

    # Certbot challenge (untuk SSL)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect ke HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ckids.eccchurch.global;

    # SSL certs (dari Certbot — jalankan sertifikasi dulu di step 5)
    ssl_certificate /etc/letsencrypt/live/ckids.eccchurch.global/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ckids.eccchurch.global/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Body size — kalau ada upload foto hadiah lewat proxy
    client_max_body_size 10M;

    location / {
        # PENTING: pakai 127.0.0.1 (IPv4), bukan localhost (IPv6 fail)
        proxy_pass http://127.0.0.1:3300;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site + test config:

```bash
sudo ln -s /etc/nginx/sites-available/ckids.eccchurch.global /etc/nginx/sites-enabled/
sudo nginx -t
```

⚠️ **JANGAN reload Nginx dulu** — SSL cert belum ada, akan fail. Skip ke step 5 dulu.

---

## 5. SSL Certificate (Certbot)

```bash
# Install Certbot kalau belum (biasanya sudah dari deploy sebelumnya)
sudo apt install -y certbot python3-certbot-nginx

# Issue cert untuk subdomain baru
sudo certbot certonly --nginx -d ckids.eccchurch.global --email admin@eccchurch.global --agree-tos --no-eff-email

# Certbot akan otomatis modify Nginx config kalau pakai --nginx mode. Kalau
# sudah edit manual di step 4, gunakan --webroot instead:
# sudo certbot certonly --webroot -w /var/www/certbot -d ckids.eccchurch.global
```

Kalau sukses, cert saved di `/etc/letsencrypt/live/ckids.eccchurch.global/`.

---

## 6. Reload Nginx + verify

```bash
sudo nginx -t   # verify config valid dengan SSL cert
sudo systemctl reload nginx

# Test dari luar
curl -sI https://ckids.eccchurch.global | head -3
# Expect: HTTP/2 200 atau 307 (redirect ke /login)
```

Browser test: buka `https://ckids.eccchurch.global` → redirect ke login page.

---

## 7. First login (setup admin)

Admin harus punya role Fulltimer supaya login CKids sukses (guard di client).

Test flow:
1. `https://ckids.eccchurch.global` → login page
2. Input nomor WA Fulltimer → tap Kirim OTP
3. Input kode OTP dari WA
4. Login sukses → redirect ke `/` (Gift Stall home)
5. Header: pilih cabang → grid katalog hadiah tampil
6. Klik salah satu hadiah → modal 2 tab (Redeem / Add Stock) buka

---

## 8. Post-deploy checklist

- [ ] `https://ckids.eccchurch.global` → 200 OK
- [ ] Login OTP Fulltimer → sukses
- [ ] Cabang selector → save di localStorage, persist reload
- [ ] Katalog empty (belum ada hadiah) → tambah dulu di `portal.eccchurch.global/dashboard/hadiah`
- [ ] Test redeem flow lengkap (scan kode jemaat → confirm → cek balance decrement)
- [ ] Test add stock flow
- [ ] `/history` → tampil transaksi (0 kalau baru)
- [ ] `/report` → summary hari ini

---

## Rollback

Kalau ada masalah, hentikan Nginx site + PM2:

```bash
# Disable Nginx site (portal + api tetap jalan)
sudo rm /etc/nginx/sites-enabled/ckids.eccchurch.global
sudo systemctl reload nginx

# Stop PM2 process
pm2 delete ecc-ckids
pm2 save
```

Migration rollback: restore DB dari backup (`gunzip -c $BACKUP | sudo -u postgres psql ecc_platform`). Tapi karena schema Modul 28 100% additive, biasanya cukup rollback code aja tanpa DB rollback.

---

## Update deploy (future)

Setelah initial deploy, update workflow standard:

```bash
cd /var/www/ecc-core-platform
git pull
pnpm install --frozen-lockfile
cd packages/database && npx dotenv-cli -e ../../.env -- npx prisma migrate deploy && npx dotenv-cli -e ../../.env -- npx prisma generate && cd ../..
pnpm build
pm2 restart ecc-core-api ecc-portal ecc-ckids --update-env
```

---

*Doc versi: 1.0 — 2026-08-01. Modul 28 CKids Gift Stall.*
