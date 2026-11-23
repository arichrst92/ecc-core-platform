---
id: ckids
title: CKids — Ibadah Anak, Kode Jemput, Point & Hadiah
tags: ckids, anak, ibadah anak, sekolah minggu, kode jemput, pickup code, jemput anak, meja ckids, stall, gift stall, point, poin, hadiah, katalog hadiah, redeem, tukar hadiah, adjust point, usia 13, ckids web, akses ckids
summary: Alur check-in anak di meja CKids, kode jemput 6 digit, batas usia 13 tahun, point & tukar hadiah, CKids web dan akses petugas CKids.
---

# CKids

## Tempat
- **CKids web**: ckids.eccchurch.global — untuk petugas meja/stall: scanner QR, verifikasi kode jemput, katalog hadiah, adjust point, laporan hari ini. Login sama dengan Portal (WhatsApp/Email).
- Portal: **CKids → Katalog Hadiah, Gift Stall**, **Akses CKids** (`/dashboard/ckids-access`), **Data Anak**.
- App (orang tua): tab **CKids** (muncul bila punya anak ≤13 tahun di Keluarga Saya), kode jemput di tab **Reservasi** & notifikasi.

## Aturan
- Ibadah anak = ibadah dengan flag **Ibadah Anak**. Hanya untuk anak **usia 13 tahun ke bawah** (dari tanggal lahir). Lebih tua → ditolak saat check-in.
- Anak tidak membuat akun sendiri (di bawah 13 tahun) — orang tua menambahkannya lewat **Keluarga** (tanggal lahir wajib agar CKids muncul).
- **Tidak ada self check-in** untuk ibadah anak; check-in dilakukan di meja CKids.
  - App: setelah ibadah anak dimulai, detail ibadah menulis "Reservasi ditutup karena ibadah sudah dimulai — check-in anak langsung di meja CKids." Di **daftar ibadah** app ≤ 2.5.0 sempat menulis "…gunakan self check-in di app" (salah) — sejak 22 Nov 2026 server tidak lagi mengirim batas reservasi untuk ibadah anak yang sudah mulai, jadi pesan itu tidak muncul; 2.5.1 memakai pesan meja CKids.
- Ibadah anak **tidak menerima tamu walk-in** lewat form tamu biasa.

## Alur hari H
1. Orang tua reservasi ibadah anak seperti biasa (anak dari Keluarga Saya) — opsional.
2. Di meja CKids petugas scan QR anak → check-in → sistem membuat **kode jemput 6 digit**; orang tua menerima notifikasi (CKIDS_CHECKIN) berisi kode, dan kode tampil di tiket anak.
3. Saat menjemput: tunjukkan kode → petugas input kode / scan QR anak → **Pickup** tercatat; orang tua menerima notifikasi CKIDS_PICKUP (termasuk peringatan bila bukan mereka yang menjemput).
- Ibadah dengan **Wajib Checkout** dapat memakai checkout.

## Point & hadiah
- Kehadiran ibadah anak memberi **point** otomatis (POINT_EARNED); admin bisa **adjust** manual (POINT_ADJUSTED). Point hanya untuk ibadah anak.
- Tab CKids di app: pilih anak & cabang → **Point Balance** + tab **Katalog Hadiah | Riwayat Tukar** (2.5.1; dulu memanjang ke bawah). Cabang bawaan = **cabang aktif** di app (2.5.1), lalu cabang dengan point terbanyak; riwayat mengikuti cabang terpilih. Tukar di stall dengan **Tunjukkan QR ke Stall** → GIFT_REDEEMED (notifikasi berisi sisa point).
- "Point sudah pernah di-award" → point kehadiran itu sudah diberikan.

## Akses petugas
- Portal → **Akses CKids**: beri jemaat akses "Scanner Ibadah" dan/atau "Gift Stall". Tanpa akses → "Fitur ini hanya untuk petugas CKids."
- Tanpa jalan pintas Fulltimer (2026-11): katalog hadiah di Portal mengikuti Role Access menu **Hadiah**; petugas mengikuti Akses CKids.

## Kasus umum
- **"Tab CKids tidak muncul"** → anak belum ada di Keluarga Saya atau tanggal lahir kosong / usia >13.
- **"Point / hadiah cabang lain yang tampil"** → 2.5.1 mengikuti cabang aktif (pilih cabang di atas); 2.5.0 memakai cabang dengan point terbanyak.
- **"Kode jemput tidak ada"** → anak belum di-check-in; setelah check-in kode muncul di tiket anak (tab Reservasi) dan notifikasi.
- **"Anak 14 tahun ditolak"** → sesuai aturan; arahkan ke ibadah umum/pemuda.
- **"Jemaat belum check-in — tidak bisa pickup"** → check-in dulu.

## Diagnosis (untuk Elsa)
`reservasi` ibadah anak (pickupCode, pickedUpAt, joinedAt) → `jemaat` (tanggalLahir) → `jemaat_point_balance` / `point_transaction` → `hadiah_katalog` / `hadiah_redeem`.
