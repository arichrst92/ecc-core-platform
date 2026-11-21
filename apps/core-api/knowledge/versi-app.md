---
id: versi-app
title: Versi Els App, Perbedaan 2.4.9 vs 2.5.0, Update Paksa & Mode Perawatan
tags: versi, update, pembaruan, 2.4.9, 2.5.0, app lama, cek pembaruan, force update, min supported, app store, play store, review, maintenance mode, mode perawatan, web app, elsapp, perbedaan versi, rilis
summary: Status rilis Els App (2.4.9 & 2.5.0), fitur yang beda antar versi, aturan server yang sudah berlaku di app lama, cara memaksa update, dan mode perawatan.
---

# Versi Els App

## Status rilis (per 19 November 2026 — perbarui tiap rilis)
- **2.4.9**: sudah rilis di Google Play; App Store masih dalam review.
- **2.5.0**: rilis berikutnya (belum di toko). Isi utama: Homecell Material, scan petugas lebih jelas, kategori tamu lebih sederhana, privasi anggota group, tampilan pop-up & gambar share lebih rapi, **Kategori → Tugas petugas pelayanan**.
- Els App juga tersedia sebagai **web** (elsapp.eccchurch.global). iPhone: persembahan dibuka lewat browser sesuai kebijakan App Store.
- Cek versi di app: Profil → Pengaturan → **Cek pembaruan**.

## Yang baru di 2.5.0 (dibanding 2.4.9)
- **Homecell Material**: pemimpin (Pastor zona, Zone Leader, PIC, Asisten) mengunduh materi dari Portal; baris "Materi minggu ini" di kartu homecell & "Materi homecell" di kartu zona.
- **Scan petugas**: tamu ditandai kotak ungu *Tamu · Visitor/New Comer* + nama pengundang (5 detik); status "baru" vs "sudah sebelumnya" akurat; badge **Walk-in** hanya untuk yang tanpa reservasi atau terlambat (ibadah & event); tidak macet saat sinyal buruk; tombol Paksa mengikuti mode aktif; jeda kode yang sama 3 detik; tombol + Tamu menunggu data ibadah (ibadah anak tidak menerima tamu).
- **Event**: tombol sukarela nonaktif dengan label *Pendaftaran ditutup / Kuota penuh* (yang sudah terdaftar tetap bisa Beri lagi); pop-up *Pendaftaran gagal* + alasan per orang; notifikasi bukti ditolak & batal oleh admin punya ikon khusus dan membuka detail event.
- **Tamu**: kategori hanya **Visitor (bawaan) & New Comer** (pilihan "Belum ditentukan" dihapus).
- **Group**: non-anggota melihat ikon gembok + "Daftar anggota hanya terlihat oleh anggota group".
- **Tampilan**: pop-up tidak tertutup status bar/garis home; gambar share 1080×1080 memuat foto hero dengan sudut tegak.
- **Pelayanan**: pilih Kategori → Tugas untuk tiap petugas; "Tugas Anda" di Jadwal Pelayanan Saya & Beranda.

## Menunggu build berikutnya (setelah 2.5.0)
- Gambar share: foto tampil utuh mengikuti rasio (tidak terpotong).
- Absen homecell: tombol Scan & Absen Checklist tersembunyi sampai pertemuan dimulai (+ keterangan jam buka).
- Pesan notifikasi (toast) tampil di dalam jendela yang sedang terbuka (mis. error saat scan absen homecell).

## Aturan server yang sudah berlaku untuk 2.4.9 (tanpa menunggu 2.5.0)
- Grup sesi event (satu sesi per jemaat), daftar event urut terdekat.
- Check-in petugas ±30 menit dari jam mulai; self check-in 15 menit sebelum mulai s.d. 30 menit setelah selesai; jam server zona cabang; terlambat → walk-in.
- Ibadah anak menolak usia >13 tahun (bila tanggal lahir terisi).
- Aturan batal pendaftaran event (sudah bayar / menunggu verifikasi / sudah mulai → lewat admin).
- Notifikasi bukti ditolak & batal oleh admin (ikon umum di 2.4.9).
- Salah sesi saat scan → "terdaftar di sesi lain: …".
- Tamu lama tampil sebagai Visitor; "Belum ditentukan" di 2.4.9 disimpan sebagai Visitor.
- Non-anggota group tidak menerima daftar anggota (2.4.9 menampilkan "Belum ada anggota terdaftar").
- Endpoint scan & reservasi hanya untuk petugas scan / CKids / admin Kehadiran.
- Notifikasi Homecell Material diterima, layar materinya baru di 2.5.0.
- Tugas petugas: app lama tidak menampilkan/mengirim tugas; tugas yang sudah ada tetap aman.
- Absen homecell hanya saat pertemuan dimulai atau setelahnya (21 Nov 2026) — app lama ditolak dengan pesan (tidak terlihat di layar scanner, lihat homecell-zona).

## Update paksa & versi minimum
- Portal → App Settings → **App Versions**: per platform isi Latest Version, **Min Supported**, release notes, link toko; *Langsung publish* menonaktifkan versi lama.
- Pengguna di bawah Min Supported mendapat **pop-up update paksa** (tidak bisa ditutup). Naikkan hanya bila ada perubahan yang tidak kompatibel.
- Link App Store jangan memakai /id/ (terkunci region): apps.apple.com/app/els-global-app/id6743088520.

## Mode perawatan
- Portal → App Settings → **Maintenance Mode**: menampilkan layar perawatan di app saat aktif.

## Kasus umum
- **"Fitur X tidak ada di HP saya"** → cek versi app pengguna; banyak fitur 2.5.0 belum tersedia di 2.4.9.
- **"Data tidak terbaru"** → tarik layar ke bawah untuk memuat ulang; perbarui app.
