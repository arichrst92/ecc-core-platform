---
id: checkin-scan
title: Check-in, Mode Scanner, Walk-in, Checkout & Jemput Anak
tags: check-in, checkin, scan, scanner, usher, petugas scan, walk-in, terlambat, self check-in, geser check-in, qr, kode jemaat, checkout, pickup, jemput, jendela, ditutup, CHECKIN_CLOSED, radius, lokasi, batalkan check-in
summary: Aturan jam check-in (petugas ±30 menit dari mulai, self check-in bawaan 15 menit sebelum mulai s.d. 30 menit setelah SELESAI — bisa diatur per ibadah/event), walk-in sampai akhir hari, self check-in & radius lokasi, Mode Scanner di app, checkout/pickup, serta arti pesan error scan.
---

# Check-in, Mode Scanner, Walk-in, Checkout & Jemput Anak

## Ringkasan aturan jam (berlaku app, Portal, CKids web)
Semua jam memakai **jam dinding zona waktu cabang** (bukan jam HP petugas). Tanggal ibadah = **tanggal server** di zona cabang.

| Jenis | Dibuka | Ditutup |
|---|---|---|
| Check-in **reservasi / peserta terdaftar** (scan petugas) | 30 menit sebelum jam mulai | 30 menit setelah jam mulai |
| **Self check-in** jemaat dari HP | **15 menit** sebelum jam mulai (bawaan; bisa diatur per ibadah/event) | **30 menit setelah jam selesai** (bawaan; bisa diatur N menit setelah mulai/selesai) |
| **Walk-in** (tanpa reservasi / tamu baru) | 30 menit sebelum jam mulai | akhir hari ibadah/event (masih bisa dicatat walau terlambat) |
| Checkout & jemput anak (pickup) | tidak dibatasi jendela | — |

- Ibadah/event **tanpa jam mulai** → check-in terbuka sepanjang hari itu.
- **Jendela per ibadah / event (2026-11)**: Portal → Ibadah (form) / Event (form → *Batas Pendaftaran Online* & *Jam self check-in*) bisa mengatur: (1) **batas reservasi / pendaftaran online** = N menit sebelum mulai (negatif = sesudah mulai; kosong = saat mulai), (2) **self check-in dibuka** N menit sebelum mulai (kosong = 15), (3) **self check-in ditutup** N menit setelah **mulai** atau **selesai** (kosong = 30 menit setelah selesai). Kosong = aturan bawaan di tabel atas. Pesan penolakan menyebut angka sebenarnya, mis. "Self check-in ditutup 20 menit setelah ibadah dimulai." / "Reservasi sudah ditutup (batasnya 2 jam sebelum ibadah dimulai)…".
  - **App 2.5.1**: hitung mundur, teks "Dibuka pukul … (N menit sebelum mulai)", jam tiket, kartu Beranda & batas batal check-in mengikuti pengaturan.
  - **App 2.5.0 ke bawah**: tetap menampilkan jam bawaan (15 menit sebelum mulai s.d. 30 menit setelah selesai). Bila pengaturan lebih sempit, tombol bisa tampil tetapi server menolak dengan pesan di atas; bila lebih lebar, app lama baru membuka tombol pada jam bawaan (minta update app atau scan usher).
  - Scan petugas **tidak** berubah (tetap ±30 menit dari mulai). Pembatalan reservasi/pendaftaran oleh jemaat tetap sampai jam mulai (atau batas pendaftaran bila diatur sesudah mulai). Batal otomatis (NO_SHOW) = saat self check-in ditutup, paling cepat saat acara selesai.
- **Event beberapa hari** → scan petugas: jendela berlaku tiap hari pada jam mulai event. **Self check-in**: satu jendela dari 15 menit sebelum mulai di hari pertama s.d. 30 menit setelah jam selesai di hari terakhir (kehadiran tetap tercatat sekali).
- **Terlambat** (lewat 30 menit setelah mulai, di hari yang sama): scan petugas tetap diterima tetapi dicatat sebagai **walk-in** (metode WALK_IN). App menampilkan keterangan walk-in.
- **Admin** (Role Access menu Kehadiran/Ibadah tulis; pengelola event = Role Access Event tulis; Fulltimer lewat Portal) **boleh di luar jendela** — untuk koreksi lewat Portal.
- Tiket ibadah tetap tampil aktif sampai self check-in ditutup (bawaan 30 menit setelah ibadah selesai; hanya tampilan). Setelah itu reservasi yang tidak dipakai **dibatalkan otomatis (NO_SHOW)**. Petugas/admin tetap bisa check-in tiket yang sudah dibatalkan bila jemaat ternyata hadir.

## Siapa yang boleh scan
- **Petugas scan ibadah**: petugas pelayanan di ibadah itu dengan tanda **"Bisa Scan" / canScanAttendance** (diatur di Portal → detail ibadah → Pelayanan → petugas, atau koordinator di app → Ministry → Atur jadwal → chip scan). Berlaku permisif: cukup ada di salah satu baris petugas link itu dengan tanda scan.
- **Petugas scan event**: petugas pelayanan event dengan tanda scan (Portal → detail event → Pelayanan & volunteer → "Beri akses scan").
- **Event — pendaftaran sudah batal tapi orangnya datang** (dibatal sendiri, oleh admin, atau otomatis karena formulir belum diisi): scan menampilkan **"Konflik — Konfirmasi Perlu"** dengan alasannya → tekan **Tetap check-in** untuk mengaktifkan lagi pendaftarannya sebagai **Hadir** (tercatat walk-in). Tetap ditolak bila ia terdaftar di sesi lain dalam grup sesi yang sama.
- **Event tidak wajib daftar** (Portal → form event → Kehadiran → *Wajib daftar sebelum hadir* dimatikan; hanya event tidak berbayar): jemaat yang belum terdaftar langsung tercatat **Hadir (walk-in)** saat discan atau self check-in.
- **Petugas CKids**: Akses CKids "Scanner Ibadah" (atau Gift Stall) — khusus ibadah anak.
- **Admin**: Role Access menu "Kehadiran"/"Ibadah" level tulis (Portal).
- **Fulltimer lewat Portal** (2026-11): boleh check-in ibadah & event (scan kamera/USB, ketik kode, walk-in, lihat statistik) **tanpa** ditunjuk sebagai petugas scan pelayanan, kapan saja (seperti admin). Hanya di Portal — di app Els tetap harus petugas scan. Halaman Portal-nya tetap butuh Role Access menu Ibadah/Kehadiran/Event (baca) supaya bisa dibuka.
- **Pengelola event** (Role Access Event tulis): boleh check-in event lewat Portal tanpa ditunjuk petugas scan.
- Jemaat biasa **tidak** boleh scan. Menu **Mode Scanner** di app hanya muncul bila jemaat ditugaskan sebagai scanner.

## Mode Scanner di app (usher/petugas)
1. Profil → **Mode Scanner** (atau ikon scan di Beranda) → pilih ibadah/event yang aktif.
2. Pilih mode **Check-in / Checkout / Pickup** (checkout hanya untuk ibadah "Wajib Checkout"; pickup hanya ibadah anak).
3. Arahkan kamera ke QR kartu jemaat atau tiket. Kamera punya jeda ±3 detik antar scan supaya tidak dobel.
4. QR tidak terbaca → **Input Manual**: ketik 8 karakter kode jemaat.
5. **Walk-in / tamu baru**: catat nama, no HP, kategori (New Comer/Visitor) → langsung tercatat hadir. Tombol walk-in muncul setelah info ibadah termuat.
6. **Info petugas** (app 2.5.1) di bawah judul layar scan — **terlipat satu baris** (status scan + 2 angka; mode Jemput: jam ibadah), ketuk untuk membuka: jam "Waktu <kota>" & lokasi, status jendela scan (kuning belum dibuka / hijau dibuka s.d. jam X / ungu lewat → yang sudah reservasi dicatat terlambat, tamu walk-in), dan ringkasan hadir · belum hadir · walk-in · terlambat · self check-in · discan saya (ibadah anak: dijemput; wajib checkout: check-out).
7. **Daftar hadir**: ketuk angka di kanan atas atau salah satu ringkasan → tab **Discan petugas** / **Semua hadir** / **Belum hadir** (sudah reservasi/daftar tapi belum check-in; event berbayar menampilkan Lunas / Menunggu verifikasi / Belum bayar). Tiap orang: jam check-in, kode, petugas yang scan, tamu + nama pengundang, umur & status jemput (ibadah anak). Bisa cari nama/kode. Di app 2.5.0 belum ada — lihat di Portal → Kehadiran.
- Pilihan mode Check-in/Checkout/Pickup hanya tampil bila ibadah punya lebih dari satu mode (ibadah umum tanpa checkout langsung Check-in).
- Bila orang **sudah check-in sebelumnya**, app menampilkan "sudah tercatat" (bukan error) — tidak dicatat dobel.
- Scan peserta event yang tidak terdaftar di sesi itu tetapi terdaftar di **sesi lain** (grup sesi) → pesan menyebut sesi lain tempat ia terdaftar.

## Self check-in (jemaat dari HP)
- Dari tiket (geser untuk check-in) atau Detail Ibadah → Self Check-in → konfirmasi "saya di lokasi" → pilih siapa saja yang hadir (diri, keluarga, tamu).
- Jendela bawaan: **15 menit sebelum mulai** s.d. **30 menit setelah selesai** (jemaat sering baru sempat check-in setelah ibadah); bisa diatur per ibadah/event (lihat atas). App menampilkan hitung mundur "Dibuka pukul HH.MM (15 menit sebelum mulai)" dan, setelah ibadah selesai, "berakhir dalam mm:ss". Petugas tetap bisa scan sejak 30 menit sebelum mulai.
- **Radius lokasi** diatur per ibadah/event di Portal: pilihan 50, 100, 200, 300, 500, 1000, 2000, 5000 m, atau "di mana saja" (tidak dicek). Titik lokasi = titik ibadah/event; bila kosong pakai titik cabang. Bila venue tidak punya titik sama sekali, lokasi tidak dicek.
- Penolakan lokasi: **LOCATION_REQUIRED** (izin lokasi HP mati / GPS belum dapat posisi) atau **TOO_FAR** (di luar radius; jarak ditampilkan).
- **Ibadah anak tidak bisa self check-in** — check-in dilakukan di meja CKids.
- Salah check-in (mis. ikut men-check-in keluarga yang tidak hadir) → buka tiket berstatus Hadir → **Batalkan check-in** (selama jendela masih dibuka). Status kembali Terdaftar.

## Ibadah anak (CKids)
- **Self check-in anak oleh orang tua / wali (2026-11)**: bila ibadah anak mengizinkan (Portal → Ibadah → *Orang tua boleh self check-in anak*, bawaan aktif), orang tua / wali bisa check-in anaknya dari app — jam & radius sama dengan self check-in ibadah (15 menit sebelum mulai s.d. 30 menit setelah selesai). Hanya anak ≤ 13 tahun (atau tanggungan tanpa tanggal lahir) yang dia wali-i; orang dewasa / bukan wali ditolak. **Kode jemput dibuat otomatis** & dikirim ke wali (notifikasi). Point CKids tetap diberikan petugas. App 2.5.0: lewat tombol Self check-in di detail ibadah / Beranda (tiket masih menulis "check-in di meja CKids"); 2.5.1: tombol geser di tiket anak.
- Hanya untuk anak **usia 13 tahun ke bawah** (dihitung dari tanggal lahir). Lebih tua → ditolak: "{nama} berusia N tahun — ibadah anak hanya untuk usia 13 tahun ke bawah."
- Check-in anak menghasilkan **kode jemput 6 digit** (tampil di tiket anak di app orang tua + notifikasi).
- **Ibadah anak tidak menerima tamu walk-in** lewat form tamu → gunakan meja CKids.
- Pickup: scan QR anak / input kode jemput → tercatat dijemput; orang tua mendapat notifikasi.

## Checkout
- Hanya untuk ibadah dengan **Wajib Checkout** (requiresCheckout). Jemaat harus sudah check-in dulu.

## Arti pesan error scan & solusinya
| Pesan | Arti | Yang dilakukan |
|---|---|---|
| "Check-in dibuka 30 menit sebelum ibadah dimulai (mulai pukul HH:MM)." | Terlalu awal | Tunggu jam buka. Cek zona waktu cabang bila jam terasa salah. |
| "Check-in reservasi sudah ditutup — hanya sampai 30 menit setelah ibadah dimulai… Gunakan walk-in…" | Lewat jendela reservasi | Pakai walk-in (masih bisa sampai akhir hari), atau admin koreksi di Portal. |
| "Hari ini tidak ada jadwal ibadah …" | Ibadah tidak terjadwal hari ini (pola mingguan/bulanan/tanggal mulai) | Cek jadwal ibadah di Portal (tipe jadwal, hari, minggu ke-, tanggal mulai). |
| "Ibadah … hari ini dibatalkan." | Occurrence ditiadakan | Portal → Ibadah → detail → Tanggal Ditiadakan → Buka Kembali bila keliru. |
| "Event sudah selesai — check-in ditutup." | Lewat tanggal terakhir event | Koreksi oleh admin event di Portal. |
| "Tiket ini untuk tanggal X, bukan ibadah hari ini." | Tiket tanggal lain | Minta jemaat buka tiket yang benar atau pakai walk-in. |
| "Fitur ini hanya untuk petugas scan / admin kehadiran." | Akun bukan petugas scan | Beri tanda "Bisa Scan" di petugas ibadah itu, atau akses menu Kehadiran. |
| "Anda tidak berwenang mencatat kehadiran di event ini." | Bukan petugas scan event | Portal → event → Pelayanan → petugas → Beri akses scan. |
| "Fitur ini hanya untuk petugas CKids." | Endpoint CKids tanpa akses | Atur Akses CKids. |
| "Jemaat "X" sudah nonaktif — tidak bisa check-in." | Akun jemaat nonaktif | Aktifkan di Portal → detail jemaat bila memang aktif. |
| "Kode jemaat "X" tidak ditemukan" | Salah ketik / kartu lama | Cek 8 karakter; cari jemaat di Portal. |
| "Event ini tidak mencatat kehadiran." | Event tidak "Butuh Kehadiran" | Aktifkan "Butuh Kehadiran" di form event bila perlu absensi. |
| "Jemaat belum check-in — tidak bisa checkout/pickup" | Urutan salah | Check-in dulu. |
| "Ibadah ini tidak require checkout" | Checkout tidak dipakai | Tidak perlu checkout. |
| "Ibadah anak tidak menerima tamu walk-in — gunakan meja CKids." | Form tamu di ibadah anak | Daftarkan lewat CKids. |
| Berlaku LATE / walkIn di hasil scan | Datang terlambat | Normal — yang sudah reservasi dicatat **terlambat** (LATE, kolom "Scan terlambat" di laporan); tamu tanpa reservasi = walk-in. |

## Langkah diagnosis (untuk Elsa)
1. Tanyakan: ibadah/event apa, tanggal & jam kejadian, siapa yang scan (nama petugas), nama/kode jemaat, pesan error persis.
2. Cek jadwal: entity `ibadah` (jamMulai, tipeJadwal, hari, mingguKe, tanggalMulai, cabang.timezone) atau `event` (tanggalMulai/Selesai, jamMulai, butuhKehadiran, isActive).
3. Cek hak scan petugas: `ibadah_pelayanan_petugas` / `event_pelayanan_petugas` dengan canScanAttendance untuk jemaat petugas.
4. Cek reservasi jemaat: `reservasi` (status, tanggalIbadah, checkinMethod, cancelReason=NO_SHOW).
5. Bandingkan waktu kejadian dengan jendela (±30 menit dari mulai, zona cabang).

## Metode check-in & tanggal scanner (2026-11)
- **SCAN** = discan petugas tepat waktu · **LATE** = sudah reservasi/terdaftar tapi discan lewat 30 menit setelah mulai · **WALK_IN** = tamu atau datang tanpa reservasi · **SELF** = self check-in · **MANUAL** = diubah admin. Data sebelum 2026-11-22: yang terlambat masih tercatat WALK_IN.
- Angka & daftar hadir di layar scan memakai **tanggal hari ini zona cabang** (sama dengan tanggal yang dicatat saat scan), bukan tanggal HP.
- Statistik & daftar hadir scanner hanya bisa dibuka petugas scan ibadah/event itu atau admin kehadiran / pengelola event.
- Daftar hadir event kini juga menampilkan petugas yang scan (data sejak 2026-11-22).
