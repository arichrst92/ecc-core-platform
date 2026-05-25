# Landing Site (eccchurch.global) — Deploy Guide

Company profile website di apex domain `eccchurch.global` (+ redirect `www.eccchurch.global`).

**Stack:** Next.js 14 static (no API call), port 3200, PM2 process `ecc-landing`, ~80MB RAM.

**Path:** `apps/landing/` (new app di monorepo).

---

## 1. DNS — Namecheap

Login Namecheap → Domain List → `eccchurch.global` → Advanced DNS.

Pastikan ada 2 record:

| Type  | Host | Value           | TTL |
|-------|------|-----------------|-----|
| A     | @    | 187.77.118.85   | Automatic atau 60s |
| CNAME | www  | eccchurch.global. | Automatic |

`@` adalah apex (eccchurch.global root). `www` CNAME ke apex supaya `www.eccchurch.global` resolve juga.

Verify propagasi:
```bash
dig +short eccchurch.global         # → 187.77.118.85
dig +short www.eccchurch.global     # → 187.77.118.85 (via CNAME chain)
```

---

## 2. Backend deploy ke VPS (Skenario 4-baru — new app + Nginx)

### 2.1 Push code dari Mac

```bash
cd /Users/idea/Projects/ecc-core-platform
unset NODE_ENV
pnpm install               # auto-link apps/landing workspace
pnpm build 2>&1 | tail -20 # verify build sukses
```

```bash
git add apps/landing/ ecosystem.config.cjs docs/landing-site-deploy.md
git commit -m "feat(landing): company profile website apex domain

Next.js 14 app baru di apps/landing/, port 3200.
- 4 pages: home, about, cabang, contact
- Tailwind dengan brand colors konsisten portal
- Static content, no API call (zero dynamic dependency)
- PM2 process baru ecc-landing, ~80MB RAM
- Nginx serve di apex eccchurch.global + redirect www"

git push origin main
```

### 2.2 Di VPS — install + build + register PM2

```bash
ssh deploy@187.77.118.85   # atau Browser Terminal Hostinger
cd /var/www/ecc-core-platform

git pull origin main

unset NODE_ENV
pnpm install               # install deps apps/landing baru

export NODE_ENV=production
pnpm build 2>&1 | tail -25
ls apps/landing/.next/BUILD_ID    # verify build artifact ada
```

```bash
# Start PM2 process baru — ecc-landing belum ada di dump sebelumnya
pm2 start ecosystem.config.cjs --only ecc-landing
pm2 save

# Verify running
pm2 list
sleep 3
pm2 logs ecc-landing --lines 10 --nostream

# Test internal
curl -I http://localhost:3200/
# Expected: HTTP/1.1 200 OK + Server: next.js
```

---

## 3. Nginx config — Apex domain + www redirect

### 3.1 Create config

```bash
sudo tee /etc/nginx/sites-available/eccchurch.global > /dev/null <<'EOF'
# Redirect www → apex (eccchurch.global)
server {
  listen 80;
  listen [::]:80;
  server_name www.eccchurch.global;
  return 301 http://eccchurch.global$request_uri;
}

# Main server — apex domain
server {
  listen 80;
  listen [::]:80;
  server_name eccchurch.global;

  # Body size kecil — landing tidak ada upload
  client_max_body_size 2M;

  # Next.js static landing site
  location / {
    proxy_pass http://localhost:3200;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 30s;

    # Cache static Next.js assets aggressive (immutable by hash)
    location ~ ^/_next/static/ {
      proxy_pass http://localhost:3200;
      proxy_set_header Host $host;
      expires 1y;
      add_header Cache-Control "public, immutable";
    }
  }
}
EOF
```

### 3.2 Enable + test + reload

```bash
sudo ln -sf /etc/nginx/sites-available/eccchurch.global /etc/nginx/sites-enabled/
sudo nginx -t
# Expected: "syntax is ok" + "test is successful"

sudo systemctl reload nginx
```

### 3.3 Test HTTP

```bash
# Dari VPS sendiri
curl -I http://eccchurch.global/
# Expected: HTTP/1.1 200 OK (via Nginx → Next.js)

curl -I http://www.eccchurch.global/
# Expected: HTTP/1.1 301 Moved Permanently → Location: http://eccchurch.global/
```

Kalau dari Mac/HP belum bisa, tunggu DNS propagasi (5-30 menit).

---

## 4. SSL — Let's Encrypt via Certbot

```bash
sudo certbot --nginx \
  -d eccchurch.global \
  -d www.eccchurch.global \
  --non-interactive --agree-tos \
  --email arichrst@ide.asia \
  --redirect
```

Certbot akan:
- Generate cert untuk 2 domain (apex + www)
- Modify Nginx config — tambah listen 443 SSL block
- Auto-redirect HTTP → HTTPS
- Setup auto-renewal (systemd timer existing sudah aktif dari deploy sebelumnya)

Verify HTTPS:
```bash
curl -I https://eccchurch.global/
# Expected: HTTP/2 200

curl -I https://www.eccchurch.global/
# Expected: HTTP/2 301 → https://eccchurch.global/
```

Di browser: buka https://eccchurch.global → harusnya muncul landing page.

---

## 5. Setup PM2 startup (kalau VPS reboot, auto-start)

PM2 startup sudah ke-setup dari deploy sebelumnya (`pm2-deploy.service`). Tinggal save current process list:

```bash
pm2 save
sudo systemctl restart pm2-deploy   # verify resurrect works
pm2 list                            # confirm ecc-landing tetap online
```

---

## 6. Post-deploy verify

| Check | Expected |
|---|---|
| `curl -I https://eccchurch.global/` | HTTP/2 200 |
| `curl -I https://www.eccchurch.global/` | HTTP/2 301 → https://eccchurch.global/ |
| `https://portal.eccchurch.global` (browser) | Portal admin login page (existing, no change) |
| `https://api.eccchurch.global/health` | JSON {"status":"ok"} (existing, no change) |
| `https://eccchurch.global` (browser) | Landing page hero "Selamat datang di ECC Church" |
| Browser navigate /about, /cabang, /contact | Semua page render |
| Mobile responsive — buka di HP | Layout adapt, hamburger menu work |

---

## 7. Update content selanjutnya

Content static di:
- `apps/landing/src/app/page.tsx` — home (hero, visi misi, layanan, CTA)
- `apps/landing/src/app/about/page.tsx` — story, visi misi detail, values
- `apps/landing/src/app/cabang/page.tsx` — list cabang (currently 1 entry placeholder, tambah saat go-live)
- `apps/landing/src/app/contact/page.tsx` — email + social media links

Workflow:
1. Edit file di Mac
2. `pnpm --filter @ecc/landing build` test
3. Commit + push
4. Di VPS: `git pull && pnpm --filter @ecc/landing build && pm2 reload ecc-landing`

---

## 8. Future enhancements (optional)

- **Dynamic cabang list** — fetch dari API `/auth/cabang` di server component (revalidate 1h)
- **Latest news section** — fetch dari `/public/news?limit=3`
- **Sitemap.xml** — Next.js metadata API
- **OG image** — auto-generate per page untuk social share preview
- **Analytics** — Plausible/Umami self-hosted (no Google for privacy)
- **Contact form** — submit ke API endpoint baru `POST /public/contact-message`

---

## 9. Rollback (kalau ada issue)

```bash
# Disable landing site sementara
sudo rm /etc/nginx/sites-enabled/eccchurch.global
sudo systemctl reload nginx

# Stop PM2 process
pm2 stop ecc-landing
pm2 delete ecc-landing
pm2 save
```

Portal + API tidak ke-affect (different subdomain, beda PM2 process).
