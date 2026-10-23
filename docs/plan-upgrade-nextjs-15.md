# Rencana Upgrade Next.js 14 → 15 (Portal, Landing, CKids, Planning)

Status: **direncanakan — eksekusi setelah serah terima 24 November 2026.**
Disusun: 23 Oktober 2026.

## Latar belakang
- Semua app web memakai Next.js **14.2.35**. Next 14 tidak lagi menerima patch keamanan
  (perbaikan Oktober 2026 hanya untuk 15.5.28 dan 16.4.1).
- Mitigasi sementara sudah di production (23 Okt 2026): sharp 0.35.5 (CVE-2026-96889),
  `images.remotePatterns` hanya `*.eccchurch.global`, upload menolak SVG, Node.js 22.23.4.
- Target: **Next 15.5.28 (Maintenance LTS) + React 19**. Next 16 ditunda (perubahan lebih besar:
  Turbopack default, `middleware` → `proxy`).

## Peta perubahan per app

| App | Temuan | Yang diubah | Risiko | Estimasi |
|---|---|---|---|---|
| Planning | 9 file, 7 client, tanpa params prop | Naikkan versi, cek build | Rendah | 0,25 hari |
| CKids | 8 file, client, tanpa params prop | Naikkan versi; cek `react-easy-crop`, `html5-qrcode` | Rendah | 0,25 hari + uji HP |
| Portal | 62 file (58 client); 17 halaman `useParams` (tidak berubah); tanpa cookies/headers/metadata/middleware | Naikkan versi; cek `react-globe.gl` + `three`, `react-hook-form`, `react-hot-toast`, `@tanstack/react-virtual` | Rendah–sedang (banyak halaman diuji) | 0,5 hari + 1 hari uji |
| Landing | 27 file server; 8 halaman `params` + `generateMetadata`; `cookies()` di `event/[slug]/pembayaran/page.tsx` dan `api/web-action/[...path]/route.ts`; middleware | `await params`, `await cookies()`, params route handler; cek middleware; fetch sudah eksplisit (`revalidate: 600`, `no-store`) → aman | Sedang (alur pembayaran publik) | 0,5–1 hari + uji |

Total: **2–3 hari pengerjaan + 1–2 hari pengujian.**

## Urutan & langkah
Urutan: **Planning → CKids → Portal → Landing**, deploy & uji per app (rollback cukup 1 app).

Per app:
1. Branch `upgrade/next15-<app>`.
2. `pnpm --filter @ecc/<app> add next@15.5.28 react@19 react-dom@19` + `@types/react@19 @types/react-dom@19` + `eslint-config-next@15.5.28`.
3. `npx @next/codemod@latest upgrade` (async request APIs), lalu cek manual hasilnya.
4. Naikkan library yang belum mendukung React 19.
5. `pnpm --filter @ecc/<app> build` + type-check → tanpa error.
6. Uji lokal (daftar di bawah) → merge → deploy app itu saja → uji production.
7. Pastikan `sharp` tetap ≥ 0.35.5 (`pnpm why sharp`).

## Daftar uji
- **Planning:** login, dashboard, backlog, kanban, sprints, my-items.
- **CKids:** login, scanner ibadah (QR, input manual), check-in/checkout/pickup & kode jemput, tambah tamu, poin, gift stall (redeem, stok, edit hadiah), history, report.
- **Portal:** login, dashboard (globe), ibadah & kalender, reservasi/kehadiran, event (peserta, verifikasi bukti, donasi, walk-in), jemaat & keluarga, tamu (tambah ibadah/event), konsolidasi, ECC Worship (crop cover, uji putar, sinkron Elsa), prayer request, laporan & export PDF/CSV, role access, server health, app versions.
- **Landing:** beranda, event & berita (OG preview di WhatsApp), halaman pembayaran event sukarela sampai upload bukti, donasi berulang, persembahan per cabang, Universal Links (AASA/assetlinks), worship share page, mode coming-soon.

## Rollback
Revert commit upgrade app terkait → `pnpm install --frozen-lockfile` → build → `pm2 restart ecc-<app> --update-env`.
