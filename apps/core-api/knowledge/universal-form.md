---
id: universal-form
title: Universal Form — Formulir di News, Event & Announcement
tags: universal form, formulir, form, survei, kuesioner, isian, field, autofill, anonim, tanda tangan, tanda tangan digital, upload file, lampiran, batas pengisian, hitung mundur, perlu diperbaiki, ditolak, batal otomatis, pendaftaran dibatalkan, hasil form, ekspor form, data peserta
summary: Membuat formulir di Portal (Broadcast → Universal Form), menyematkan di News/Event/Announcement, jenis field & validasi, autofill, anonim, tanda tangan, batas pengisian & pembatalan otomatis, hasil & tindakan admin, serta tampilan di app.
---

# Universal Form

## Tempat & akses
- Portal: **Broadcast → Universal Form** (`/dashboard/universal-form`). Hak akses lewat **Role Access** menu *Universal Form* (baca = lihat hasil & unduh lampiran, tulis = buat/ubah form & tindakan admin, hapus = hapus form tanpa respons).
- Form **disematkan** dari halaman buat/ubah/detail **News, Event, Announcement** (bagian *Formulir*). Yang punya akses tulis menu konten tsb boleh mengatur sematan.
- App: kartu formulir di bawah isi konten (**app 2.5.1**). App 2.5.0: Announcement menampilkan tombol "Isi formulir" ke **Els App web**; News & Event belum menampilkan form (event dengan form ditahan sampai 2.5.1 rilis dengan force update).

## Siapa yang mengisi
- **News / Announcement**: siapa saja yang bisa membuka kontennya (Announcement = penerimanya).
- **Event**: hanya **peserta terdaftar**; event **wajib bayar** → hanya yang **lunas**. Diisi **per peserta** (saya, keluarga, tamu yang saya daftarkan) — autofill memakai data masing-masing peserta.
- Wajib login. **Anonim** = identitas disembunyikan di hasil (sistem tetap mencegah isi berulang). Form anonim tidak boleh memakai autofill & tanda tangan.

## Jenis field
Teks pendek, teks panjang, rich text (tebal, miring, daftar, link — tanpa gambar), upload file (**banyak file**: jumlah maks 1–10, jenis gambar/PDF/Word/Excel/PowerPoint/teks, ukuran per file maks 20 MB), email, link, nomor HP, tanggal, rentang tanggal, tanggal + jam, dropdown, pilihan ganda, centang, angka, ya/tidak, **tanda tangan digital**, dan **Informasi** (judul bagian / teks / info biru / penting kuning — bukan isian, `{nama_peserta}` & `{event}` diganti otomatis).
- Validasi: wajib, panjang min/maks, angka min/maks/bulat, tanggal min/maks/tidak lewat/tidak di masa depan, rentang maks N hari, domain email/link, jumlah pilihan min/maks, jenis & ukuran file. Dicek di app **dan** server.
- **Autofill** (hanya Teks pendek): nama, kode, no HP, email, tanggal lahir, usia, jenis kelamin, cabang, homecell, zona, alamat, pekerjaan, status nikah. Terkunci di app; nilainya diambil ulang di server saat kirim.
- Field yang sudah punya jawaban tidak bisa dihapus (otomatis **disembunyikan**) dan jenisnya tidak bisa diubah.

## Tanda tangan digital
Digambar dengan jari di app, disimpan sebagai gambar + bukti (penanda tangan = akun pengisi, waktu, perangkat, IP, **hash isi jawaban**). Jawaban diubah → wajib tanda tangan ulang. Ini tanda tangan elektronik **tidak tersertifikasi** (UU ITE / PP 71/2019) — cukup untuk izin orang tua, persetujuan, pernyataan data benar.

## Batas pengisian & pembatalan otomatis
- Batas = **Batas pengisian** di sematan (per konten), bila kosong = tanggal tutup form. App menampilkan **hitung mundur DD:jj:mm:dd**.
- Pengingat **H-3, H-1, 3 jam** sebelum batas (notifikasi app + WhatsApp berisi link Els App web) bagi peserta event yang belum mengisi; pengingat perbaikan ≤ 12 jam sebelum batas perbaikan. Template WhatsApp: Portal → Notifikasi WhatsApp → *Pengingat isi formulir*.
- **Batal otomatis** (opsi per sematan event): saat batas lewat, pendaftaran peserta yang **belum mengisi** atau **belum melengkapi perbaikan** dibatalkan, kuota kembali, notifikasi berisi alasan. **Event wajib bayar tidak dibatalkan otomatis** → ditandai **Perlu tindak lanjut** di Hasil.

## Hasil & tindakan admin
- Tab **Hasil**: ringkasan per channel (News/Event/Announcement mana), saringan channel/status/cabang, pencarian, detail jawaban + lampiran + tanda tangan, daftar **peserta belum isi**, ekspor CSV / PDF.
- Tindakan per respons: **Minta perbaiki** (alasan + batas, bawaan 48 jam, tidak melewati batas pengisian), **Tolak** (alasan), **Batalkan pendaftaran** (event; butuh akses tulis Event; yang sudah lunas → urus pengembalian dana), **Pulihkan**. Jemaat mendapat notifikasi.

## Data & retensi
File lampiran & tanda tangan disimpan privat (bukan publik), dihapus otomatis **1 tahun setelah form ditutup**; unggahan yang tidak pernah dikirim dihapus setelah 3 hari. Akun dihapus → jawaban & file miliknya ikut dihapus.
