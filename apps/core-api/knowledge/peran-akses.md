---
id: peran-akses
title: Siapa Bisa Apa — Peran, Akses Menu & Kenapa Menu Tidak Muncul
tags: akses, hak akses, role access, menu tidak muncul, tidak punya akses, forbidden, fulltimer, admin, petugas scan, usher, koordinator, otoritas, pic, asisten, pastor zona, zone leader, petugas doa, petugas ckids, it minister, canAccessPortal, read write delete
summary: Peta peran di app & Portal (Fulltimer, Role Access, petugas scan, koordinator pelayanan, PIC/asisten/pastor, petugas doa, CKids) dan cara memberi akses saat menu tidak muncul.
---

# Siapa Bisa Apa

## Portal
- Masuk Portal & menu ditentukan **Role Access** (Developer Tools → Role Access): *Can Access Portal* + centang menu dengan level **Read / Write / Delete**. Berlaku **juga untuk Fulltimer** (tidak ada jalan pintas). Level paling spesifik yang sudah diatur (Status → Sub role → Role) berlaku utuh; level tanpa pengaturan ikut level di atasnya.
- Sidebar/dock hanya menampilkan menu yang diizinkan. Aksi tanpa level cukup → "tidak punya akses".
- Contoh kebutuhan akses: ubah jemaat = Jemaat **Write**; hapus jemaat = **Delete**; kelola peserta event = Event **Write**; scan/koreksi kehadiran = Kehadiran atau Ibadah **Write**; kelola tahap Spiritual Journey = **Write**; lihat pin jemaat di Map View = menu Jemaat.

### Approval (antrian persetujuan) di Portal
Read = melihat antrian, **Write = menyetujui/menolak**.
| Approval | Menu Role Access |
|---|---|
| Permintaan bergabung pelayanan (Permintaan Volunteer & tab Pendaftaran) | **Permintaan Volunteer** — Write = proses semua pelayanan & cabang. Tanpa itu, hanya pelayanan/cabang dari *Otoritas approval* |
| Request tahap Spiritual Journey dari app | **Request Spiritual Journey** (terpisah dari menu Spiritual Journey) |
| Bukti transfer / status bayar event | **Verifikasi Pembayaran Event** (di halaman Event; butuh juga Event Read untuk membuka halaman) |
| Permintaan bergabung group | **Group** Write (selain PIC group) |
| Pengajuan group baru dari app (Community → Pengajuan Group) | **Group** Write — group dari app menunggu persetujuan; dibuat admin Group di Portal langsung aktif |
| Prayer Request (tugaskan petugas, tandai didoakan) | **Prayer Request** Write |
| Kritik & Saran (balas) · Tamu (petugas follow-up) · Cek Duplikat jemaat | Kritik & Saran · Tamu · Jemaat Write |
- **Pengaman darurat**: jemaat di `ROLE_ACCESS_ADMIN_JEMAAT_IDS` (.env server) selalu bisa membuka Portal & menu Role Access, supaya akses tidak terkunci bila salah atur.
- Tanpa jalan pintas Fulltimer juga berlaku untuk: kelola group & homecell (Role Access Group / Homecell, atau PIC/asisten), katalog hadiah (menu Hadiah), dan mencari jemaat untuk check-in (admin kehadiran).
- Jadwal pelayanan di Portal untuk semua cabang = **Pelayanan** Write (selain koordinator yang punya otoritas).

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
