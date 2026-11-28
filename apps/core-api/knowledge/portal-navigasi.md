---
id: portal-navigasi
title: Peta Menu Portal & Layar App (alamat halaman)
tags: menu, portal, navigasi, dock, sidebar, halaman, url, alamat, dimana, letak, badge, akses cepat, quick access, tab bawah, profil, beranda
summary: Daftar menu Portal beserta alamat halamannya (untuk tombol navigasi) dan letak fitur di app (Beranda, Akses Cepat, Profil, tab bawah).
---

# Peta Menu Portal & Layar App

## Portal (dock bawah → grup → menu)
| Grup | Menu | Alamat |
|---|---|---|
| — | Dashboard (Elsa) | /dashboard |
| — | Map View | /dashboard/map |
| — | User Guide | /dashboard/user-guide |
| Gereja | Gereja (Sinode), Cabang Gereja | /dashboard/sinode, /dashboard/cabang |
| Service | Ibadah | /dashboard/ibadah (detail /dashboard/ibadah/<id>) |
| Service | Kategori Ibadah | /dashboard/kategori-ibadah |
| Service | Pelayanan (+ Kategori & tugas di detail) | /dashboard/pelayanan (detail /dashboard/pelayanan/<id>) |
| Service | Role Pelayanan | /dashboard/pelayanan-role |
| Service | Permintaan Volunteer | /dashboard/pelayanan/join-requests |
| Service | Kehadiran | /dashboard/kehadiran |
| Service | Laporan Ibadah | /dashboard/laporan-ibadah |
| People | Jemaat (Cek Duplikat, Import) | /dashboard/jemaat, /dashboard/jemaat/duplicates, /dashboard/jemaat/import |
| People | Role Jemaat, Relasi Jemaat | /dashboard/role, /dashboard/tipe-relasi |
| People | Kritik & Saran | /dashboard/feedback |
| People | Tamu | /dashboard/tamu |
| People | Prayer Request | /dashboard/prayer-request |
| People | Bible 365 | /dashboard/bible365 |
| Community | Zona | /dashboard/homecell-area |
| Community | Homecell | /dashboard/homecell |
| Community | Homecell Material | /dashboard/homecell-material |
| Community | Group | /dashboard/group |
| Community | Pengajuan Group (group baru dari app menunggu persetujuan) | /dashboard/group?pengajuan=1 |
| Movement | Event (detail: peserta, pembayaran, pelayanan & volunteer) | /dashboard/event (detail /dashboard/event/<id>) |
| Movement | Laporan Event | /dashboard/laporan-event |
| Movement | Visit | /dashboard/visit |
| Movement | Spiritual Journey | /dashboard/spiritual-journey |
| Movement | Local Market | /dashboard/local-business |
| Broadcast | News, Renungan, ECC Worship, Announcement | /dashboard/news, /dashboard/renungan, /dashboard/worship, /dashboard/announcement |
| CKids | Katalog Hadiah, Data Anak, Akses CKids | /dashboard/hadiah, /dashboard/data-anak, /dashboard/ckids-access |
| Website | Konten Website | /dashboard/website |
| App Settings | Legal Docs, App Versions, Maintenance Mode, Onboarding Config | /dashboard/legal, /dashboard/app-version, /dashboard/maintenance-mode, /dashboard/onboarding-config |
| Developer Tools | Role Access, Audit Log, Server Health, Message Provider, Maintenance, Analitik App, Diagnostics (tab **Tulisan di App** = ubah label Els App 2.5.1+ tanpa build), Shiftsoft Sync | /dashboard/role-access, /dashboard/audit-log, /dashboard/server-health, /dashboard/wa-config, /dashboard/maintenance, /dashboard/analitik, /dashboard/diagnostics, /dashboard/shiftsoft-sync |
| — | Profil & Keamanan | /dashboard/profile |

- **Badge merah** di dock = request menunggu tindakan (Spiritual Journey, Tamu tanpa petugas follow-up, Prayer Request baru, Permintaan Volunteer, Kritik & Saran baru, kandidat akun ganda, bukti transfer event, permintaan bergabung group, **pengajuan group baru**, homecell dengan lokasi bermasalah). Diperbarui tiap 60 detik.
- Klik nama di tabel = halaman detail; ikon pensil = ubah cepat.
- **Audit Log** = sumber kebenaran "siapa mengubah apa, kapan" (filter aksi, resource, tanggal).
- **CKids web**: https://ckids.eccchurch.global

## App (Els App)
- **Tab bawah (2.4.9)**: Beranda · Resolusi · Reservasi · CKids (bila punya anak ≤13) · Profil. Event dibuka dari Beranda / Akses Cepat. Mode tamu: tab terbatas.
- **Ikon kanan atas Beranda**: Mode Scanner (petugas), Kartu QR, Notifikasi.
- **Mode Scanner 2.5.1**: angka hadir/total di kanan atas → Daftar Hadir (Discan petugas · Semua hadir · Belum hadir); panel info terlipat di bawah judul (ketuk untuk membuka).
- **Akses Cepat (16)**: Ibadah, Event, Beri, Berita, Renungan, Alkitab, Doa, Worship, Keluarga, Tamu, Group, Homecell, Ministry, Zona, Visit, Local Market.
- **Profil**: Edit Profil, **User Manual** (2.5.1, PDF sesuai bahasa), Spiritual Journey, Group Saya, Cari Group, Reservasi Ibadah, Tamu Saya, Catatan saya, Prayer Request Saya, Pelayanan (Jadwal Pelayanan Saya), Mode Scanner, Usaha Saya, Kirim Kritik & Saran, Pengaturan (Privasi, Bahasa, Tampilan, Cek pembaruan, Keluar, Hapus akun), ikon target = Resolusi Tahunan.
- **Beranda**: cabang aktif (ketuk untuk cabang lain), kartu Homecell Anda / carousel homecell & zona yang dipimpin, Ibadah Hari Ini, renungan, 6 event mendatang, berita, kalender ulang tahun (mengikuti privasi; 2.5.1 termasuk ulang tahun sendiri). Renungan di 2.5.1 hanya renungan hari ini.
- Tarik layar ke bawah untuk memuat ulang data.

## Analitik — jam ramai (2026-11)
- Tab **Halaman** (default periode **Hari Ini**): kolom **Sering dibuka** (di sebelah Durasi) = jam (WIB) halaman itu paling sering dibuka + porsinya.
- Kartu **Jam ramai (prime hour)**: batang halaman dibuka per jam 00–23 (jam puncak & 3 jam teratas disorot), garis rata-rata pengguna aktif per jam, sorotan jam tersibuk / jendela 3 jam teramai / hari teramai / jam tersepi (05–24), porsi Dini hari · Pagi · Siang · Sore · Malam, dan peta panas hari × jam. Klik satu baris halaman → jendela detail: angka halaman (dibuka, pengunjung, durasi, kembali 7/30 hari, aktif sekarang), ringkasan kalimat **Kapan halaman ini ramai?** (rentang jam ramai & porsinya, puncak, hari teramai & porsi hari Minggu, dibanding jam puncak seluruh app, jam tersepi) + saran jam kirim pengumuman, grafik jam ramai halaman itu, per hari dalam seminggu, platform (Android/iOS/Web) & top 3 jam, lalu pengunjung harian & retensi kohort.
- Data per jam dicatat server saat menerima telemetri (tiap ±30 detik), jadi berlaku untuk semua versi app tanpa update — tetapi baru terkumpul sejak pembaruan ini (data sebelumnya hanya per hari). Disimpan sama lamanya dengan data kunjungan harian.
