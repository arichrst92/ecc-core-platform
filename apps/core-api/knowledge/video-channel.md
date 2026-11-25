---
id: video-channel
title: Media & Video Channel — Video YouTube di Els App dan website
tags: media, video, video channel, youtube, khotbah video, tonton, kategori video, video unggulan, ecc worship, worship
summary: Menu Media di Beranda app (ECC Worship + Video Channel), cara menonton video, halaman website /video, serta pengelolaan video & kategori di Portal (Broadcast → Video Channel).
---

# Media & Video Channel

## Di app
- **App 2.5.1**: tile **Media** di Beranda (menggantikan tile Worship). Isinya dua tab:
  - **ECC Worship** — sama persis dengan sebelumnya (album, single, disukai, unduhan, cari, putar/acak).
  - **Video Channel** — video unggulan, pilihan kategori, cari judul, daftar video terbaru. Ketuk video untuk menonton **langsung di dalam app** (bisa layar penuh), lihat deskripsi, bagikan, atau **Buka di YouTube**, plus video lain dari kategori yang sama.
- Tab yang belum berisi disembunyikan; tile Media tampil bila Worship atau Video Channel berisi.
- Lagu ECC Worship yang sedang diputar otomatis dijeda saat video dibuka.
- **App 2.5.0** masih menampilkan tile **Worship** (tanpa Video Channel) — perlu update ke 2.5.1 untuk menonton video di app. Video tetap bisa ditonton di website.

## Di website
`eccchurch.global/video` (menu **Video**): unggulan, kategori, cari, klik untuk memutar. Isinya sama dengan app.

## Portal (admin)
**Broadcast → Video Channel** (`/dashboard/video-channel`), hak akses lewat **Role Access** menu *Video Channel* (baca = lihat, tulis = tambah/ubah, hapus = hapus).
- Video berlaku untuk **semua cabang** (universal, seperti ECC Worship).
- **Tambah video**: tempel link YouTube → judul & thumbnail terisi otomatis (judul bisa diubah). Pilih **satu kategori** (atau tanpa kategori), deskripsi, **Terbitkan**, **Unggulan** (tampil di atas), dan **Jadwal tayang** (opsional, WIB — video baru tampil setelah waktu itu; juga menentukan urutan terbaru).
- Hanya **video YouTube biasa**: link Shorts, siaran live, dan playlist ditolak dengan pesan. Satu video hanya boleh ditambahkan sekali.
- Tab **Kategori**: tambah, ubah nama, atur urutan (panah naik/turun), aktif/nonaktif. Kategori nonaktif beserta videonya tidak ditampilkan. Menghapus kategori membuat videonya menjadi tanpa kategori.
- Status video: **Tayang**, **Terjadwal**, **Draft**.

## Troubleshooting
- Judul tidak terisi otomatis → video privat atau tidak boleh disematkan; isi judul manual dan pastikan video publik/unlisted dengan izin sematan aktif.
- Video tidak muncul di app/website → cek status Terbit, jadwal tayang, dan kategori aktif. Website memperbarui daftar setiap ±5 menit.
- Video tidak bisa diputar di app → pemilik video menonaktifkan sematan; gunakan **Buka di YouTube**.
