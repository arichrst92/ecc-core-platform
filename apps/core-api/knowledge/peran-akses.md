---
id: peran-akses
title: Siapa Bisa Apa — Peran, Akses Menu & Kenapa Menu Tidak Muncul
tags: akses, hak akses, role access, menu tidak muncul, tidak punya akses, forbidden, fulltimer, admin, petugas scan, usher, koordinator, otoritas, pic, asisten, pastor zona, zone leader, petugas doa, petugas ckids, it minister, canAccessPortal, read write delete
summary: Peta peran di app & Portal (Fulltimer, Role Access, petugas scan, koordinator pelayanan, PIC/asisten/pastor, petugas doa, CKids) dan cara memberi akses saat menu tidak muncul.
---

# Siapa Bisa Apa

## Portal
- **Fulltimer** (role Fulltimer) otomatis bisa masuk Portal dan memakai Elsa.
- Role lain butuh **Role Access** (Developer Tools → Role Access): *Can Access Portal* + centang menu dengan level **Read / Write / Delete**. Sub role mewarisi role induk kecuali di-override.
- Sidebar/dock hanya menampilkan menu yang diizinkan. Aksi tanpa level cukup → "tidak punya akses".
- Contoh kebutuhan akses: ubah jemaat = Jemaat **Write**; hapus jemaat = **Delete**; kelola peserta/pembayaran event = Event **Write**; scan/koreksi kehadiran = Kehadiran atau Ibadah **Write**; proses Spiritual Journey = **Write**; lihat pin jemaat di Map View = menu Jemaat.

## Peran di app (muncul otomatis bila ditugaskan)
| Peran | Ditetapkan di | Yang muncul / bisa dilakukan |
|---|---|---|
| Petugas scan ibadah | Petugas ibadah dengan **Bisa Scan** (Portal detail ibadah, atau koordinator di app) | **Mode Scanner** untuk ibadah itu |
| Petugas scan event | Volunteer event dengan **akses scan** | Mode Scanner untuk event itu |
| Petugas CKids | Portal → **Akses CKids** (Scanner Ibadah / Gift Stall) | Scan ibadah anak, pickup, stall hadiah, CKids web |
| Koordinator pelayanan | Portal → pelayanan → anggota → **Otoritas approval** per cabang | Permintaan bergabung, Pendaftaran, **Atur jadwal**, Chat koordinator |
| PIC homecell | Portal → Homecell (PIC) | Kelola homecell, **memproses permintaan bergabung** (satu-satunya di app), laporan, potensial member, asisten |
| Asisten homecell | PIC → titik tiga → Jadikan asisten | Jadwal, absen, tamu, pengumuman, voting, lampiran |
| PIC zona / Zone Leader | Portal → Zona (PIC) | Semua homecell di zona, ubah info zona, laporan zona |
| Pastor zona | Portal → Zona (Pastor) | Sama dengan PIC zona di homecell zonanya, laporan zona |
| PIC group | Portal/app group | Proses permintaan bergabung, tambah/keluarkan anggota |
| Petugas doa | Portal → Prayer Request → Konfigurasi Petugas | Tab **Ditugaskan ke Saya** di Doa |
| Pemilik/partner usaha | Usaha Saya | Kelola usaha & katalog |
| Anggota IT Minister | Portal → Team IT Minister | Ticketing Tools |

## Menu tidak muncul — cek berurutan
1. Apakah orangnya memang ditugaskan (tabel di atas)? Cek data dengan Elsa (mis. `ibadah_pelayanan_petugas` canScanAttendance, `pelayanan_approver`, `homecell.picJemaatId`).
2. Penugasan untuk **ibadah/cabang/tanggal yang benar**? (hak scan per ibadah; otoritas per cabang; susunan khusus tanggal vs tetap).
3. App sudah versi terbaru & data dimuat ulang (tarik layar ke bawah, atau keluar-masuk app).
4. Untuk Portal: role punya *Can Access Portal* & menu yang dibutuhkan.

## Diagnosis (untuk Elsa)
`jemaat_role` (+ `role`) untuk role/Fulltimer; `pelayanan_approver`; `ibadah_pelayanan_petugas` / `event_pelayanan_petugas`; `homecell` (picJemaatId) / `homecell_area` / `homecell_area_pastor`; `prayer_petugas_role` / `prayer_petugas_pelayanan`. Pengaturan Role Access & Akses CKids tidak tersedia di Elsa — arahkan ke menu Portal.
