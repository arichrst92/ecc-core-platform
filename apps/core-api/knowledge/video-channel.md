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
  - **Video Channel** — tab dipilih lewat tombol ECC Worship | Video Channel di atas. Isinya: **video unggulan** besar (geser, tombol **Tonton sekarang**), chip kategori, rak **Terbaru** dan satu rak per kategori (**Lihat semua** → halaman kategori dengan saringan Terbaru / Terlama / tahun). Ikon **cari** di header membuka layar **Cari video** (riwayat pencarian tersimpan di HP, kata yang cocok disorot). Ketuk video untuk menonton **langsung di dalam app** (bisa layar penuh); di bawah pemutar ada tombol **Bagikan**, **Salin tautan**, **YouTube**, deskripsi (**Selengkapnya**), dan **Berikutnya di {kategori}**.
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
- Status video: **Tayang**, **Terjadwal**, **Draft**. Filter sumber: *Sinkron YouTube* / *Ditambah manual*.

## Sinkron otomatis dari channel YouTube ECC
Tab **Sinkron YouTube** di Portal → Video Channel. Sumber: **@ECCChurchChannel** dan **@ECCWorship**.
- **Muat playlist** menampilkan semua playlist kedua channel (+ "Semua unggahan" per channel untuk video di luar playlist). Playlist baru selalu **nonaktif** sampai dicentang.
- Centang playlist yang mau diimpor dan pilih **kategorinya** (atau "Kategori baru: nama playlist"; mencentang tanpa kategori otomatis membuat kategori bernama playlist). Mengganti kategori playlist ikut memindahkan video yang sudah diimpor dari playlist itu.
- **Urutan playlist = prioritas**: video yang ada di beberapa playlist masuk kategori playlist paling atas.
- Sinkron berjalan **otomatis tiap 6 jam**, atau tekan **Sinkronkan sekarang**. Video baru langsung **Tayang**, tanggal tayang = tanggal unggah/siaran di YouTube.
- Dilewati: **Shorts** (video tegak, ≤ 60 detik, atau playlist "Shorts"), siaran yang sedang/akan live, video privat, video yang tidak boleh disematkan. Rekaman live yang sudah selesai ikut diimpor.
- Judul, deskripsi, kategori, unggulan, atau Draft yang diubah admin **tidak ditimpa** sinkron.
- Video yang dihapus/diprivat di YouTube otomatis disembunyikan (label "Tidak tersedia di YouTube") dan tampil lagi bila tersedia kembali.
- **Hapus** video hasil sinkron = tidak diimpor ulang (daftar "video yang dihapus" bisa dipulihkan dengan **Impor lagi**). Untuk sekadar menyembunyikan, ubah ke Draft.
- Butuh **YOUTUBE_API_KEY** di server; tanpa itu Portal menampilkan peringatan dan sinkron tidak berjalan.

## Troubleshooting
- Sinkron gagal "Kuota harian YouTube API habis" → otomatis dicoba lagi pada jadwal berikutnya.
- Video baru belum muncul → cek playlist sudah dicentang, tunggu sinkron berikutnya (≤ 6 jam) atau tekan Sinkronkan sekarang; Shorts memang dilewati.
- Judul tidak terisi otomatis → video privat atau tidak boleh disematkan; isi judul manual dan pastikan video publik/unlisted dengan izin sematan aktif.
- Video tidak muncul di app/website → cek status Terbit, jadwal tayang, dan kategori aktif. Website memperbarui daftar setiap ±5 menit.
- Video tidak bisa diputar di app → pemilik video menonaktifkan sematan; gunakan **Buka di YouTube**.
