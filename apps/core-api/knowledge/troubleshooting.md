---
id: troubleshooting
title: Troubleshooting Lapangan — Gejala, Penyebab, Solusi & Cara Diagnosis
tags: masalah, error, gagal, tidak bisa, tidak muncul, ditolak, kenapa, bantuan, lapangan, hari h, darurat, troubleshoot, diagnosis, macet, lambat, notifikasi tidak masuk, scan gagal
summary: Indeks cepat masalah yang sering terjadi di lapangan (login, scan, reservasi, event, pelayanan, homecell, group, notifikasi) + langkah diagnosis umum yang dipakai Elsa.
---

# Troubleshooting Lapangan

## Cara kerja diagnosis (urutan baku)
1. **Pahami kasusnya**: siapa (nama / kode jemaat / no HP), di mana (cabang, ibadah/event, tanggal & jam), lewat apa (app versi berapa / Portal / CKids web), dan **pesan error persis**.
2. **Cocokkan dengan aturan** di panduan topik terkait.
3. **Cek data** (hanya baca) untuk memastikan penyebab: jadwal, status, hak akses, dan riwayat orang tsb.
4. **Jawab**: penyebab paling mungkin + langkah perbaikan konkret (menu Portal / langkah di app) + siapa yang bisa melakukannya.
5. Bila data tidak cukup atau butuh perubahan sistem → sarankan hubungi tim IT (tombol *contact_admin*).

## Indeks gejala → penyebab → solusi
| Gejala | Penyebab umum | Solusi | Panduan |
|---|---|---|---|
| OTP WhatsApp tidak masuk | Nomor/kode negara salah, belum terdaftar, gateway WA gangguan, jeda 60 detik | Masuk dengan email; kode masuk sementara dari Portal; cek Server Health | akun-login |
| "Nomor sudah dipakai jemaat lain" / "tercatat sebagai data tamu" | Akun ganda / data tamu | Portal → Jemaat → Cek Duplikat; satukan data | akun-login |
| Mode Scanner tidak muncul | Bukan petugas scan untuk ibadah/event itu | Beri "Bisa Scan" pada petugas di ibadah/event itu | checkin-scan, peran-akses |
| Scan ditolak "Check-in dibuka 30 menit sebelum…" | Terlalu awal | Tunggu jam buka; cek zona waktu cabang | checkin-scan |
| Scan ditolak "Check-in reservasi sudah ditutup…" | Lewat 30 menit setelah mulai | Pakai walk-in (sampai akhir hari) | checkin-scan |
| "Hari ini tidak ada jadwal ibadah…" | Pola jadwal tidak cocok / salah pilih ibadah | Cek tipe jadwal, hari, minggu ke-, tanggal mulai | ibadah-reservasi |
| "Ibadah … hari ini dibatalkan" | Tanggal ditiadakan | Buka Kembali di Portal bila keliru | ibadah-reservasi |
| Self check-in ditolak lokasi | Izin lokasi mati / di luar radius | Nyalakan lokasi; atau scan oleh petugas; cek radius di Portal | checkin-scan |
| Anak ditolak di CKids | Usia >13 tahun / tanggal lahir salah | Perbaiki tanggal lahir bila salah; arahkan ke ibadah umum | ckids |
| Tiket ibadah hilang/batal | Batal otomatis NO_SHOW atau tanggal ditiadakan | Petugas tetap bisa check-in bila hadir | ibadah-reservasi |
| Tidak bisa daftar event | Sudah mulai, kuota penuh, belum publish, sudah daftar sesi lain | Walk-in di lokasi / admin Portal / batalkan sesi lama | event |
| Tidak bisa batal event | Sudah hadir / sudah bayar / event sudah mulai | Admin event membatalkan di Portal | event |
| Bukti transfer belum diverifikasi | Menunggu admin | Portal → event → Pembayaran → Setujui / Tolak (alasan) | event |
| "Anda tidak berwenang mencatat kehadiran di event ini" | Bukan volunteer scan event | Beri akses scan di Pelayanan & volunteer event | event |
| Tombol Gabung pelayanan tidak ada | Pendaftaran cabang belum dibuka / sudah anggota / menunggu | Buka pendaftaran cabang | pelayanan |
| Koordinator tidak bisa approve / atur jadwal | Belum punya Otoritas approval cabang itu | Portal → pelayanan → perisai → centang cabang | pelayanan |
| Petugas tidak muncul di jadwal tanggal tertentu | Ada susunan khusus tanggal yang menggantikan susunan tetap | Ubah susunan tanggal itu atau "Kembalikan ke susunan tetap" | pelayanan |
| Pilihan tugas petugas tidak muncul | Kategori & tugas belum diisi / app <2.5.0 | Isi di Portal → detail pelayanan; update app | pelayanan |
| Menu Kelola homecell tidak muncul | Bukan PIC/asisten/pastor zona homecell itu | Tetapkan PIC/asisten | homecell-zona |
| Materi homecell tidak terlihat | Belum publish / di luar masa berlaku / cabang salah / app <2.5.0 | Cek di Portal → Homecell Material | homecell-zona |
| Non-anggota melihat anggota group | Server/app lama atau cache | Deploy terbaru, tarik untuk muat ulang | group |
| Parent group tidak ada di pilihan | Dulu dropdown dibatasi 100 | Ketik nama di kotak cari | group |
| Notifikasi WA tidak terkirim | Jenis notif nonaktif / saluran / gateway / jemaat mematikan WA | WhatsApp Notif Config, Server Health | doa-konten-notifikasi |
| Menu Portal tidak terlihat / "tidak punya akses" | Role Access belum memberi menu/level | Developer Tools → Role Access | peran-akses |
| Fitur tidak ada di HP jemaat | Versi app lama | Cek pembaruan; lihat perbedaan versi | versi-app |
| Data di app tidak terbaru | Cache | Tarik layar ke bawah; keluar-masuk app | versi-app |
| Alamat jemaat tidak muncul di peta | Alamat tidak dikenali / terlalu umum | Map View → Lihat daftar → perbaiki alamat | jemaat-keluarga |

## Prinsip menjawab
- Gunakan **jam & tanggal zona cabang**.
- Bedakan **app** vs **Portal** (Portal biasanya untuk admin & koreksi; banyak pengelolaan harian ada di app).
- Bila aturan memblokir dengan sengaja (mis. batas usia CKids, batas batal event), jelaskan alasannya dan jalur resminya (admin), jangan menyarankan cara memotong aturan.
- Jangan mengarang nama menu, angka, atau status — cek panduan & data.
