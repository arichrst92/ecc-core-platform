---
id: akun-login
title: Akun & Login — OTP WhatsApp, Email, Kode Masuk Sementara, Daftar, Ganti Nomor, Hapus Akun
tags: login, masuk, otp, whatsapp, kode, email, magic link, kode masuk sementara, tidak bisa login, otp tidak masuk, daftar akun, registrasi, usia, 13 tahun, 17 tahun, izin orang tua, nomor sudah dipakai, data tamu, data lama, klaim, ganti nomor hp, ganti email, verifikasi kontak, hapus akun, nonaktif, logout, sesi, portal login, mode tamu, pindah cabang
summary: Cara masuk app & Portal (OTP WA, email, kode sementara dari admin), pendaftaran akun & aturan usia, konflik nomor/email/data tamu, ganti nomor, pindah cabang, hapus akun, dan logout semua sesi.
---

# Akun & Login

## Masuk ke app
- **OTP WhatsApp**: pilih kode negara + nomor HP → Kirim OTP → masukkan 6 digit → masuk. Kirim ulang setelah hitungan mundur (jeda ±60 detik; terlalu cepat → "Mohon tunggu N detik sebelum meminta kode baru.").
- **Masuk dengan Email**: link/kode login dikirim ke email yang terdaftar di akun.
- **Mode Tamu**: menjelajah tanpa akun (renungan, berita, event, Alkitab, cari homecell). Tab bawah terbatas.
- Nomor HP disimpan format internasional (+62…, +65…); pengguna boleh mengetik 08…, 62…, +62….

## Masuk ke Portal & CKids web
- Tab **WhatsApp | Email** → kode 6 digit. Kode email berlaku **10 menit** (cek Spam/Promosi).
- WhatsApp gangguan → server otomatis mengirim kode ke email (bila ada) dan halaman login memberi tahu; bila tetap gagal muncul tombol "Masuk dengan email".
- **Kode masuk sementara** (jalan terakhir): admin cabang membuka Portal → detail jemaat → tombol *Kode masuk sementara* → 6 digit, **berlaku 10 menit, sekali pakai**, tercatat di Audit Log. Jemaat mengetiknya di kolom kode yang sama.
- Akses Portal hanya untuk role dengan *Can Access Portal* (Fulltimer otomatis). Menu yang terlihat mengikuti **Role Access**.

## OTP tidak masuk — urutan cek
1. WhatsApp aktif & ada internet; nomor benar beserta kode negara.
2. Nomor di Portal (detail jemaat) benar. "Nomor HP belum terdaftar sebagai jemaat" → belum ada akun dengan nomor itu (mungkin daftar pakai email → *Masuk dengan email*).
3. Gateway WhatsApp: Portal → Developer Tools → **Server Health** / **WhatsApp Notif Config → Gateway & OTP** (statistik OTP).
4. Pakai email, atau beri **kode masuk sementara**.

## Daftar akun baru (app)
- Daftar dengan **WhatsApp atau email** (2.4.9), centang persetujuan S&K/Privasi, pilih kelompok usia, isi **3 data wajib**: Nama Lengkap, Jenis Kelamin, Cabang; jawab *Jemaat tetap* atau *New Comer*. Akun langsung aktif.
- **Usia**: di bawah 13 tahun **tidak boleh** punya akun ("…usia Anda di bawah 13 tahun… didaftarkan orang tua/wali melalui menu Keluarga"). 13–17 tahun harus memilih "13–17 tahun dengan izin orang tua".
- Role otomatis saat onboarding diatur di Portal → **Onboarding Config** (Jemaat Tetap / New Comer). New Comer otomatis dipindah ke Jemaat Tetap setelah N kali hadir (bila diatur).
- Data lama (mis. hasil impor Shiftsoft) bisa **diklaim** saat daftar dengan WhatsApp, memakai kode verifikasi ("Klaim data lama hanya untuk pendaftaran dengan WhatsApp.", "Kode verifikasi data lama wajib diisi.", "Data lama sudah memakai nomor HP lain. Hubungi admin cabang.").

## Konflik nomor / email
| Pesan | Arti / tindakan |
|---|---|
| "Nomor HP sudah terdaftar — gunakan login OTP." | Akun sudah ada → masuk saja. |
| "Email sudah terdaftar — gunakan "Masuk dengan email"…" | Akun sudah ada dengan email itu. |
| "Nomor HP sudah dipakai jemaat lain. Hubungi admin gereja kalau ini nomor Anda." | Nomor milik akun lain → admin cek duplikat (Portal → Jemaat → Cek Duplikat). |
| "Nomor ini tercatat sebagai data tamu. Hubungi admin cabang untuk menyatukan data tamu…" | Nomor pernah dicatat sebagai tamu → admin menyatukan data. |
| "Nomor HP sudah terdaftar sebagai jemaat — hubungkan lewat Tambah Keluarga → cari…" | Saat mendaftarkan keluarga baru dengan nomor yang sudah punya akun → pakai Cari jemaat. |
| "Gunakan alamat email pribadi (bukan email sementara)." | Email disposable ditolak. |
| "Email adalah satu-satunya cara Anda masuk. Tambahkan nomor WhatsApp dulu sebelum menghapus email." | Jangan hapus satu-satunya kontak login. |

## Ganti nomor HP / email
- App: Profil → Edit Profil → **Ganti** nomor HP (verifikasi OTP ke nomor baru) / email (verifikasi). Label kontak: Terverifikasi / Belum terverifikasi / Diinput wali / Diinput admin.
- Tidak bisa masuk sama sekali → admin cabang ubah nomor di Portal (detail jemaat, butuh akses menu Jemaat tulis), lalu jemaat login dengan nomor baru.

## Pindah cabang
- Jemaat mengajukan pindah cabang dari app → admin meninjau (BRANCH_CHANGE_APPROVED/REJECTED). Hanya satu permohonan PENDING ("Sudah ada permohonan pindah cabang yang masih PENDING.").

## Hapus akun & logout
- App: Pengaturan → **Hapus akun** (verifikasi OTP) → akun nonaktif, tidak bisa login; data historis (kehadiran, event) tetap untuk catatan gereja. Reaktivasi: admin aktifkan di detail jemaat. Permintaan hapus permanen: privacy@eccchurch.global.
- "Akun Anda sudah dinonaktifkan." → akun nonaktif; admin bisa mengaktifkan.
- Portal: Profil & Keamanan → **Sign Out** (perangkat ini) atau **Logout dari Semua Sesi** (semua perangkat; pakai bila HP hilang).
- "Refresh token sudah diperbarui di tab lain." → sesi diperbarui di tab lain; muat ulang halaman.

## Diagnosis (untuk Elsa)
Cari `jemaat` dengan filter noHp (format apa pun) / email / nama → cek isActive, cabang, isTamu; `branch_change_request` untuk pindah cabang; `onboarding_role_rule` untuk role otomatis. Isi kode OTP & token tidak bisa dibaca.
