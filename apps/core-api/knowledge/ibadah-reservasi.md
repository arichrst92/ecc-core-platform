---
id: ibadah-reservasi
title: Ibadah — Jadwal, Reservasi, Tiket, Tiadakan Tanggal & Ulasan
tags: ibadah, jadwal, reservasi, tiket, kursi, okupansi, kapasitas, batal reservasi, tiadakan, dibatalkan, occurrence, mingguan, dua mingguan, bulanan, zona waktu, timezone, urutan, rating, ulasan, review, online, kehadiran, laporan ibadah, no show
summary: Cara ibadah dijadwalkan (mingguan/dua mingguan/bulanan, zona waktu cabang), reservasi untuk diri/keluarga/tamu, aturan batal, batal otomatis no-show, meniadakan tanggal, urutan & rating, laporan.
---

# Ibadah — Jadwal, Reservasi, Tiket, Tiadakan Tanggal & Ulasan

## Tempat
- Portal: **Service → Ibadah** (`/dashboard/ibadah`, tampilan List/Kalender), **Kategori Ibadah**, **Kehadiran** (`/dashboard/kehadiran`), **Laporan Ibadah**.
- App: Akses Cepat → **Ibadah** (jadwal 30 hari ke depan), detail ibadah → Reservasi / Self Check-in; tiket di tab **Reservasi**.

## Jadwal
- Tipe jadwal: **Mingguan**, **Dua Mingguan** (mengikuti Tanggal Mulai), **Bulanan** (pilih minggu ke-1 s.d. ke-4 + hari), atau sekali.
- Jam ibadah = **jam di zona waktu cabang**; app menampilkan zona (WIB/WITA/…).
- Ibadah yang sudah lewat jam selesainya otomatis diburamkan & pindah ke bawah di app.
- **Urutan tampil** di app mengikuti urutan di daftar Ibadah Portal (geser urutan).
- **Online**: centang Online + link stream → label "Online" di app.
- Flag khusus: **Ibadah Anak** (CKids, kode jemput) dan **Wajib Checkout**.
- **Rating** (Ya/Tidak) per ibadah — bila Tidak, kartu ulasan di tiket hilang.

## Reservasi
1. Detail Ibadah → **Reservasi** → pilih tanggal → pilih siapa yang ikut (saya, keluarga, tamu saya).
2. Setiap orang mendapat tiketnya sendiri (QR). Okupansi kursi tampil di kartu & detail ibadah (bila kapasitas kursi diisi di Portal):
   - **App 2.5.0 ke bawah**: selalu "N hadir dari X kursi" — N = yang SUDAH check-in saja (reservasi belum dihitung), jadi sebelum ibadah bisa tertulis 0.
   - **Website eccchurch.global** (Beranda & Ibadah): "N/X reservasi" lalu "N/X hadir" dengan aturan yang sama.
   - **Web & app 2.5.1**: sebelum self check-in dibuka (15 menit sebelum mulai) → "N reservasi dari X kursi" (reservasi aktif, termasuk yang sudah hadir); sesudahnya → "N hadir dari X kursi". Bisa > 100% (check-in tidak dibatasi kursi).
- "Jemaat ini sudah reservasi untuk ibadah & tanggal yang sama" → sudah punya tiket.
- **Pembatalan reservasi** bisa sampai **jam mulai** ibadah ("Reservasi tidak bisa dibatalkan karena ibadah sudah dimulai."). Hanya reservasi berstatus Terdaftar yang bisa dibatalkan; yang sudah hadir tidak bisa dibatalkan.
- Status reservasi: **RESERVE** (terdaftar) → **JOIN** (hadir) atau **CANCEL** (batal; cancelReason NO_SHOW bila otomatis).

## Batal otomatis (no-show)
- Reservasi yang tidak dipakai dibatalkan otomatis **30 menit setelah ibadah selesai** (status CANCEL, alasan NO_SHOW). Sebelum itu jemaat masih bisa self check-in dalam jendela.
- Petugas/admin tetap bisa check-in tiket yang terlanjur batal bila jemaat ternyata hadir.

## Meniadakan satu tanggal (ibadah ditiadakan)
1. Portal → Ibadah → **Kalender** → klik tanggal → **Tiadakan** → alasan (opsional).
2. Semua reservasi tanggal itu otomatis dibatalkan. Scan di tanggal itu ditolak "Ibadah … hari ini dibatalkan."
3. Membuka kembali: detail ibadah → **Tanggal Ditiadakan** → **Buka Kembali**. Reservasi yang terlanjur batal **tidak** pulih otomatis.

## Petugas ibadah
- Detail ibadah → **Pelayanan yang Melayani** → tambah pelayanan → **Tambah Petugas**: mode **Default (tiap minggu)** atau **Khusus tanggal** (override hanya tanggal itu; susunan khusus menggantikan default untuk tanggal tsb, bukan menambah).
- Tanda **Bisa Scan** = boleh scan check-in ibadah itu.
- Petugas harus anggota aktif pelayanan tsb. Detail ada di panduan *pelayanan*.

## Ulasan
- Kartu "Bagaimana ibadah hari ini?" muncul di tiket yang hadir (bila rating aktif): bintang 1–5, komentar, opsi anonim. Bisa diubah sampai 14 hari setelah acara.
- Nama pengirim ulasan anonim tidak bisa dibaca Elsa.

## Laporan
- **Laporan Ibadah**: kehadiran, tamu per kategori (New Comer/Visitor), ulasan — unduh PDF/Excel.

## Kasus umum
- **Jam ibadah di app tidak sesuai** → cek zona waktu cabang di Portal → Cabang Gereja.
- **Ibadah tidak muncul di app** → cek isActive, tipe jadwal/hari/tanggal mulai, dan apakah tanggal itu ditiadakan.
- **Tiket hilang/terbatalkan sendiri** → kemungkinan NO_SHOW otomatis atau tanggal ditiadakan; cek `reservasi.cancelReason`.
- **Tidak bisa reservasi untuk keluarga** → anggota harus ada di Keluarga Saya; tamu harus ada di Tamu Saya.

## Diagnosis (untuk Elsa)
`ibadah` (jadwal, cabang.timezone, isActive) → `ibadah_occurrence_status` (tanggal ditiadakan) → `reservasi` (filter ibadahId + tanggalIbadah + jemaatId; status, cancelReason, checkinMethod) → `service_review`.

## Label jam "Waktu <kota>" (2026-11)
- Jam ibadah/event ditulis dengan label kota cabang, mis. ECC Bali → **Waktu Bali** (dulu "Waktu Makassar" dari zona Asia/Makassar).
- Kota diambil dari kolom **Kota (label jam)** di Portal → Cabang; bila kosong, dari nama cabang tanpa "ECC". Cabang yang namanya bukan kota (mis. "ECC Kelapa Gading") → isi kolom Kota.
- App ≤ 2.5.0 masih menulis nama kota zona waktu sampai jemaat update; Portal, pengingat & pesan server sudah memakai kota cabang.
