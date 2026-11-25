---
id: konseling
title: Konseling — Permintaan konseling jemaat & konselor
tags: konseling, konselor, curhat, pendampingan, masalah, pergumulan, jadwal konseling, ajukan konseling, kontak konselor, preferensi gender, sesama jenis, tugaskan konselor, pengaturan konselor
summary: Mengajukan konseling dari app (Profil → Konseling), persetujuan berbagi kontak, alur status, tugas konselor di app, serta antrian & pengaturan konselor di Portal (People → Konseling).
---

# Konseling

## Tempat & akses
- App **2.5.1**: **Profil → Pertumbuhan Rohani → Konseling**. App 2.5.0 belum punya menu ini — jemaat perlu update app.
- Portal: **People → Konseling** (`/dashboard/konseling`). Hak akses lewat **Role Access** menu *Konseling* (baca = lihat antrian & isi, tulis = tugaskan konselor, batalkan, ubah pengaturan).
- Isi konseling **rahasia**: hanya dapat dibaca **konselor yang ditugaskan** dan **admin menu Konseling**. Elsa tidak boleh menampilkan isi konseling siapa pun.

## Mengajukan (jemaat)
1. Isi **Pokok masalah** (min 10 karakter) dan **Harapan dari konseling** (min 5 karakter).
2. **Usulan jadwal** (opsional): satu tanggal + jam, plus **catatan jadwal** (mis. "hanya bisa malam"). Jadwal final ditentukan konselor.
3. **Preferensi konselor**: *Bebas* atau *Sesama jenis kelamin*.
4. Tekan **Lanjut** → popup **Bagikan kontak ke konselor?** menampilkan nomor HP / email profil. Harus **Setuju & Kirim**; tanpa nomor HP maupun email permintaan tidak bisa dikirim (lengkapi profil dulu).
- Maksimal **3 permintaan berjalan** sekaligus.
- Jemaat bisa **membatalkan** selama status belum Selesai/Dibatalkan; konselor diberi tahu.

## Status
Menunggu konselor → Konselor ditugaskan → Terjadwal → Selesai (atau Dibatalkan oleh jemaat/admin).

## Konselor
- Konselor = jemaat aktif yang menjadi **anggota aktif pelayanan** (dan **peran**, bila dipilih) yang diatur di Portal → Konseling → **Pengaturan konselor**. Tidak ada jalan pintas Fulltimer.
- Di app konselor muncul tab **Ditugaskan ke Saya** (Aktif / Riwayat). Detail berisi nama, jenis kelamin, usia, cabang jemaat, tombol **WhatsApp / Telepon / Email**, dan:
  - **Tetapkan jadwal** (tanggal + jam + catatan, mis. tempat/link) → jemaat mendapat notifikasi. Bisa **Ubah jadwal**.
  - **Tandai selesai** → jemaat diberi tahu.
  - **Kembalikan ke admin** → permintaan kembali "Menunggu konselor", jemaat diberi tahu konselor sedang diganti.

## Portal (admin)
- Tab **Permintaan**: filter Aktif / Menunggu konselor / Ditugaskan / Terjadwal / Selesai / Dibatalkan / Semua, cari nama. Klik baris → detail.
- **Tugaskan konselor**: daftar konselor diurutkan **satu cabang** dulu lalu **beban aktif** paling sedikit. Bila jemaat memilih *sesama jenis*, hanya konselor berjenis kelamin sama yang tampil (bisa dibuka semua dengan centang). Mengganti konselor mengosongkan jadwal; konselor lama, konselor baru, dan jemaat diberi tahu.
- **Batalkan permintaan** dengan alasan (dikirim ke jemaat).
- Tab **Pengaturan konselor**: tambah pelayanan (+ peran opsional) sumber konselor, lalu **Simpan**. Bila belum diatur, antrian menampilkan peringatan.

## Notifikasi
`KONSELING_ASSIGNED` (konselor), `KONSELING_SCHEDULED` & `KONSELING_UPDATED` (jemaat) — saluran **Rohani**. App 2.5.0 menampilkan notifikasi ini tanpa membuka halaman.

## Troubleshooting
- "Menu ini hanya untuk konselor" → jemaat bukan anggota aktif pelayanan/peran yang diatur.
- Tab Ditugaskan tidak muncul → cek keanggotaan pelayanan konselor dan app sudah 2.5.1.
- Tidak ada konselor di pilihan → pengaturan konselor kosong, atau preferensi sesama jenis tanpa konselor yang cocok (centang "Tampilkan semua jenis kelamin").
