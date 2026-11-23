---
id: versi-app
title: Versi Els App, Perbedaan 2.5.0 vs 2.5.1, Update Paksa & Mode Perawatan
tags: versi, update, pembaruan, 2.4.9, 2.5.0, 2.5.1, app lama, cek pembaruan, force update, min supported, app store, play store, review, maintenance mode, mode perawatan, web app, elsapp, perbedaan versi, rilis
summary: Status rilis Els App (2.5.0 & 2.5.1), fitur yang beda antar versi, aturan server yang sudah berlaku di app lama, cara memaksa update, dan mode perawatan.
---

# Versi Els App

## Status rilis (per 23 November 2026 — perbarui tiap rilis)
- **2.5.0**: versi di App Store & Google Play.
- **2.5.1**: rilis berikutnya (disiapkan; belum di toko). Berisi semua tampilan app 21–23 Nov 2026.
- Els App juga tersedia sebagai **web** (elsapp.eccchurch.global) — isi 2.5.1 tersedia setelah deploy web. iPhone: persembahan dibuka lewat browser sesuai kebijakan App Store.
- Cek versi di app: Profil → Pengaturan → **Cek pembaruan**.

## Yang baru di 2.5.1 (dibanding 2.5.0)
- **Mode Scanner petugas**: tombol tidak bertumpuk (pilihan mode disembunyikan bila hanya Check-in); angka hadir/total + ikon daftar → **Daftar Hadir** (tab Discan petugas · Semua hadir · Belum hadir: jam, kode, petugas yang scan, tamu + pengundang, Terlambat, Tamu walk-in / Walk-in, umur & status jemput anak, status bayar event); **panel info** terlipat (jam "Waktu <kota>", lokasi, status jendela scan, ringkasan hadir · belum hadir · walk-in · terlambat · self check-in · discan saya); tanggal = hari ini zona cabang.
- **Label jam "Waktu <kota cabang>"** (ECC Bali → Waktu Bali, bukan Makassar). Event semua cabang = Waktu Jakarta.
- **Event & tiket**: okupansi "reservasi/terdaftar" sebelum check-in dibuka, "hadir" sesudahnya; tulisan kuota di atas bar. Event **sukarela**: kartu Beranda berisi ringkasan + status saya (sudah memberi + nominal / menunggu / Beri Sukarela), tanpa hitung mundur, tanpa "Sampai bertemu di acara"; event **tanpa kehadiran**: Tiket Saya & QR disembunyikan; nominal tiket = nominal yang diberikan (+ "menunggu verifikasi"); jam/lokasi kosong disembunyikan; tombol batal mengikuti izin server.
- **Beranda & kalender**: renungan hanya **hari ini** (tidak ada → section disembunyikan); **ulang tahun sendiri** tampil di kalender.
- **CKids**: katalog & riwayat dalam **tab**; poin, katalog & riwayat mengikuti **cabang aktif**.
- **Homecell**: tombol absen tampil saat pertemuan dimulai; tombol kelola mengikuti izin server; PIC & asisten melihat ajakan **ECC Worship karaoke**.
- **Group**: membuat group = **pengajuan** ("Ajukan Group" → "Pengajuan terkirim", label/banner "Menunggu persetujuan"); tombol kelola mengikuti `canManage` (bukan status Fulltimer).
- **Doa & resolusi**: doa terjawab & resolusi tercapai bisa **dibagikan sebagai gambar** + ayat & tautannya; ajakan "Ingin memberikan sesuatu yang berarti untuk Tuhan…" → halaman Beri; resolusi bisa ditautkan **ayat pegangan** (pilih versi → cari ayat); tautan ayat di daftar & detail resolusi membuka Alkitab di ayat & versi itu (ayat disorot); resolusi tercapai di daftar juga menampilkan ajakan Beri.
- **Alkitab & Catatan**: ajakan mendengarkan ECC Worship.
- **Renungan & News**: tampilan isi mendukung daftar bernomor, coret & link (sama dengan Announcement).
- **Daftar & onboarding**: halaman awal bisa digulir; layar "Pendaftaran berhasil" tampil dengan kode jemaat; semua kesalahan isian terlihat; pindah ke email dari layar kode WA; tombol pintas Daftar/Masuk; pilihan Jemaat Tetap / New Comer saat onboarding; konfirmasi tombol kembali Android.
- **Tampilan**: **popup Els App** (ikon, judul, pesan, tombol bergradasi) menggantikan popup sistem; **pemilih tanggal Android** kolom Tanggal · Bulan · Tahun (tahun selalu bisa diganti); toast tampil di atas pop-up; gambar share utuh.
- **Profil → User Manual** (PDF sesuai bahasa).
- **Tulisan & angka aturan dari server**: label app bisa diperbaiki lewat Portal → Diagnostics → **Tulisan di App** tanpa build baru (hanya 2.5.1 ke atas).

## Aturan server yang sudah berlaku untuk 2.5.0 (tanpa menunggu 2.5.1)
- Self check-in 15 menit sebelum mulai s.d. 30 menit setelah selesai (sama dengan teks di 2.5.0).
- Angka hadir header scanner ibadah kembali benar ("/33" diperbaiki di server).
- Website: okupansi reservasi → hadir & label Sukarela.
- Event sukarela: kartu tanpa hitung mundur; batal pendaftaran yang sudah bayar ditolak dengan pesan; nominal tiket = nominal yang diberikan.
- Ibadah anak yang sudah mulai: pesan "gunakan self check-in" tidak muncul.
- Absen homecell sebelum pertemuan dimulai ditolak dengan pesan.
- Pengingat push memakai "Waktu <kota cabang>" (layar app 2.5.0 masih "Waktu Makassar" untuk Bali).
- Tanpa jalan pintas Fulltimer: tombol kelola group/homecell masih tampil di 2.5.0, server menolak dengan pesan bila tanpa Role Access.
- Scan terlambat (sudah reservasi, discan > 30 menit setelah mulai) dicatat terpisah dari walk-in di laporan Portal.
- Pengumuman hanya untuk jemaat yang sudah aktif di Els App.
- Pengajuan group: group dari 2.5.0 juga menunggu persetujuan admin; app 2.5.0 masih menulis "berhasil dibuat" tanpa label, orang lain belum bisa bergabung (ditolak dengan pesan).
- Renungan/News: Portal hanya menyediakan format yang bisa ditampilkan 2.5.0 (tebal, miring, judul, daftar, kutipan).

## Ringkas: yang baru di 2.5.0 (dibanding 2.4.9)
- Homecell Material; tugas petugas pelayanan (Kategori → Tugas); scan petugas menandai tamu + pengundang & walk-in akurat; tombol sukarela menyesuaikan saat tutup/penuh; kategori tamu Visitor/New Comer; daftar anggota group hanya untuk anggota; pop-up & gambar share lebih rapi; perbaikan tanggal lahir.

## Update paksa & versi minimum
- Portal → App Settings → **App Versions**: per platform isi Latest Version, **Min Supported**, release notes, link toko; *Langsung publish* menonaktifkan versi lama.
- Pengguna di bawah Min Supported mendapat **pop-up update paksa** (tidak bisa ditutup). Naikkan hanya bila ada perubahan yang tidak kompatibel.
- Link App Store jangan memakai /id/ (terkunci region): apps.apple.com/app/els-global-app/id6743088520.

## Mode perawatan
- Portal → App Settings → **Maintenance Mode**: menampilkan layar perawatan di app saat aktif.

## Kasus umum
- **"Fitur X tidak ada di HP saya"** → cek versi app pengguna; fitur 2.5.1 (scanner daftar hadir, bagikan doa/resolusi, popup baru, dll.) belum ada di 2.5.0.
- **"Label app salah / perlu diganti"** → Portal → Diagnostics → Tulisan di App (berlaku untuk 2.5.1 ke atas); app 2.5.0 perlu update.
- **"Data tidak terbaru"** → tarik layar ke bawah untuk memuat ulang; perbarui app.
