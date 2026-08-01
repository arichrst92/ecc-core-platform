# @ecc/ckids — CKids Gift Stall Admin Web App

Standalone Next.js web app untuk admin ECC Children's Ministry — POS untuk redeem hadiah dari point balance anak. Deploy di subdomain `ckids.eccchurch.global` (terpisah dari portal admin utama).

## Purpose

Modul 28 dari ECC Platform. Complements:
- **Modul 27** (Kids Ibadah + Kode Jemput) — auto-generate pickup code saat check-in kids ibadah
- Portal admin (`portal.eccchurch.global/dashboard/hadiah`) — CRUD katalog hadiah master data
- Mobile app (jemaat side) — display point balance + QR anak

CKids app focus: **stall operations** — admin duduk di stall, scan QR anak, kurangi point, kasih hadiah. Fast POS-style flow.

## Pages

| Route | Purpose |
|---|---|
| `/login` | OTP login (reuse `/auth/otp/*` endpoints). Fulltimer-only. |
| `/` | Katalog hadiah grid untuk cabang aktif. Click → modal Redeem / Add Stock. |
| `/history` | Redeem history 200 terakhir, filter tanggal. |
| `/report` | Report hari ini — summary + top hadiah + list transaksi (auto-refresh 30s). |

Cabang selector persist di localStorage (key `ecc-ckids-cabang`). Auth persist di key `ecc-ckids-auth` — terpisah dari portal.

## Dev

```bash
pnpm --filter @ecc/ckids dev
# http://localhost:3300
```

Butuh core-api running di `http://localhost:4100`. Env var `NEXT_PUBLIC_CORE_API_URL` bisa override.

## Build

```bash
pnpm --filter @ecc/ckids build
pnpm --filter @ecc/ckids start
```

## Deploy production

See `docs/ckids-deploy-guide.md` di root repo untuk step-by-step (Nginx + PM2 + SSL).
