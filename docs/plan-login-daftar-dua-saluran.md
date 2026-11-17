# Rencana Implementasi — Login & Daftar Dua Saluran (WhatsApp / Email)

Status: rencana. Fase 0 sudah di-deploy; Fase 1–3 belum dikerjakan. Disusun 17 Nov 2026.
Tujuan: jemaat tidak pernah buntu saat salah satu penyedia (WhatsApp / email) gangguan,
tanpa menyimpan kontak yang belum terbukti milik jemaat.

---

## 1. Keputusan yang sudah disepakati

| Topik | Keputusan |
|---|---|
| Daftar | Pilih **Daftar dengan WhatsApp** (OTP WhatsApp) atau **Daftar dengan email** (OTP email 6 digit). |
| Daftar dengan nomor HP | Kode **harus** lewat WhatsApp. Kode lewat email tidak boleh menggantikan OTP WhatsApp untuk daftar. |
| Login app (HP) | OTP WhatsApp, atau **magic link** email. |
| Login web (Els App web) | OTP WhatsApp, atau **OTP email 6 digit** (magic link tidak dipakai di web). |
| Pesan spam | Semua layar yang mengirim ke email menampilkan kotak "cek folder Spam / Promosi". |
| Melengkapi kontak | Di Profil: tambah/ubah nomor WhatsApp (OTP WhatsApp) dan email (OTP email). Hint bila salah satu kosong. |
| Onboarding tambah nomor HP | Tidak wajib lagi — diganti hint. |
| Data wali / admin | Nomor & email yang diisi orang tua (untuk tanggungan) atau admin Portal tidak perlu OTP; ditandai "diinput wali/admin". |
| Versi app lama | Tetap berfungsi seperti sekarang. Fitur baru hanya di app versi baru. |
| Kode admin cabang | Jalan terakhir saat semua saluran gangguan. |
| Verifikasi terbalik | **Tidak** dipakai. |
| StarSender | **Dihapus** (Fase 0). Gateway: Resmi.ID (OTP) → Fonnte. |
| Notifikasi | Saluran per jenis notifikasi bisa diatur di Portal: In-app / WhatsApp / Email / Off. |

---

## 1a. Data produksi (17 Nov 2026)

| | Jumlah |
|---|---|
| Anggota aktif | 7.255 |
| Hanya WhatsApp (tanpa email) | 2.044 |
| Dewasa tanpa nomor HP | 2.557 — 2.171 punya email & belum pernah login, 342 tanpa email & belum pernah login, **44 aktif via magic link** |
| Tanpa kontak sama sekali | 495 — 153 punya wali, 309 dewasa & 33 anak tanpa wali (data impor, belum pernah login) |
| Email ganda (beda huruf besar/kecil) | 3 |

Kesimpulan: kelompok paling rentan saat WhatsApp gangguan = 2.044 jemaat hanya-WhatsApp.
Risiko terbesar berikutnya = akun ganda dari ± 2.500 data impor tanpa nomor HP (lihat 3.9).

## 2. Fase 0 — Hapus StarSender (sudah di-deploy 17 Nov 2026)

- `packages/auth/src/whatsapp.ts`: provider StarSender & urutan provider dihapus. OTP: Resmi.ID → Fonnte. Notifikasi: Fonnte.
- `wa-runtime`, `wa-config`, `wa-dispatch`, `server-health`, Announcement: referensi StarSender dihapus.
- Portal → WhatsApp Config → Gateway & OTP: baris StarSender & pilihan urutan dihapus.
- Migrasi `20261204090000_remove_starsender`: drop `wa_starsender_enabled`, `wa_starsender_usage`, `wa_provider_order`; Announcement `wa_provider='starsender'` → `auto`.
- `.env` VPS: `STARSENDER_DEVICE_KEY` dan `WA_PROVIDER_ORDER` boleh dihapus (tidak dibaca lagi).

---

## 3. Fase 1 — Server & Portal (tanpa update app)

Semua perubahan **bersifat tambahan** (endpoint/parameter baru, kolom baru). Perilaku lama tetap jalan
untuk app versi lama. Perilaku baru yang mengubah alur lama diatur saklar Portal.

### 3.1 Deteksi WhatsApp gagal diam-diam
- **Lapis 1 — status device Fonnte berkala.** Cek `getFonnteDevice()` tiap 2 menit (cache di memori).
  Device `disconnect` → Fonnte dilewati untuk OTP (OTP langsung jatuh ke cadangan email/admin) dan
  ditandai merah di Portal. Notifikasi non-OTP tetap dicoba (masuk antrean wa-dispatch).
- **Lapis 2 — tingkat pemakaian OTP.** Kolom baru `otp_verification.provider` (resmi | fonnte | email).
  Bila ≥ N OTP berturut-turut dari satu provider tidak dipakai dalam 5 menit (N default 8, bisa diatur),
  provider ditandai **"diduga gagal"** selama 15 menit: dilewati untuk OTP, OTP berikutnya ikut ke email.
  Pulih otomatis saat ada OTP dari provider itu yang dipakai.
- Portal Gateway & OTP: tampilkan status device + "OTP terkirim/terpakai 1 jam terakhir" per provider,
  dan banner peringatan bila provider diduga gagal.
- Notifikasi ke admin (email ke IT Minister) saat provider berubah jadi diduga gagal / pulih.
- Setelah 3.1 jalan, mode OTP email bisa dikembalikan ke **fallback** (tidak perlu "always").

### 3.2 Infrastruktur OTP email
- `otp_verification`: `no_hp` jadi nullable, tambah `email` (VARCHAR 255, nullable) + indeks `(email, purpose)`.
  Constraint: salah satu `no_hp` / `email` wajib terisi.
- Enum `otp_purpose` tambah: `ENROLLMENT_EMAIL`, `LOGIN_EMAIL` (web), `ADD_EMAIL`, `ADD_NOHP`, `CLAIM_RECORD`, `ADMIN_CODE`.
  (Migrasi `ADD VALUE` di file terpisah, seperti migrasi Announcement.)
- Endpoint baru:
  - `POST /auth/email-otp/request` { email, purpose: ENROLLMENT_EMAIL | LOGIN_EMAIL }
  - `POST /auth/email-otp/verify` { email, kode, purpose } → LOGIN_EMAIL: sesi; ENROLLMENT_EMAIL: penanda 60 menit.
  - `POST /admin/me/email/request-otp` & `/verify` (tambah/ubah email).
  - `POST /admin/me/phone/request-otp` sudah ada — dipakai juga untuk **menambah** nomor (bukan hanya ubah).
- Masa berlaku OTP email **10 menit** (WhatsApp tetap 5 menit). Batas: 5 permintaan / 15 menit per email.
- Template email OTP: kode besar, masa berlaku, dan baris "Bila email ini masuk Spam, tandai *Bukan spam*".

### 3.3 Daftar dengan email
- `/auth/register` menerima `{ email, otpChannel: 'email' }` tanpa `noHp`. Syarat: OTP `ENROLLMENT_EMAIL`
  untuk email itu terverifikasi ≤ 60 menit. Email belum dipakai anggota lain.
- Blokir domain email sekali pakai (daftar statis di shared-types).
- Akun baru: `email_verified_at = now()`, `no_hp = NULL`, `onboarded_at = now()`.

### 3.4 Perbaikan pendaftaran (berlaku untuk semua versi app)
- Jendela isi data setelah OTP: **15 → 60 menit**.
- Seluruh pembuatan akun (jemaat, user, role, homecell, consent) dalam **satu transaksi**.
- Bila `/register` dipanggil ulang untuk nomor/email yang OTP-nya terverifikasi ≤ 60 menit dan akunnya
  baru saja dibuat dari pendaftaran itu → kembalikan sesi login (bukan "sudah terdaftar").
- Saklar Portal **"OTP daftar lewat email (app versi lama)"** — default **nyala** saat rilis.
  Nyala: perilaku sekarang (ENROLLMENT dengan nomor HP boleh dapat salinan email bila WA gagal).
  Mati: ENROLLMENT dengan nomor HP hanya WhatsApp. Dimatikan setelah app baru tersedia.

### 3.5 Email: rapikan & tandai verifikasi
- Semua skema email di shared-types: `.trim().toLowerCase()`. Pencarian email (magic link, OTP, konflik)
  tidak peka huruf besar/kecil.
- Migrasi data: `UPDATE jemaat SET email = lower(trim(email))` — **didahului query cek ganda**
  (`GROUP BY lower(trim(email)) HAVING count(*) > 1`). Bila ada ganda, dirapikan manual lewat
  konsolidasi jemaat sebelum migrasi dijalankan.
- Kolom baru `jemaat.email_verified_at`, `jemaat.no_hp_source`, `jemaat.email_source`
  (`SELF_VERIFIED | GUARDIAN | ADMIN | LEGACY`).
  - Backfill: email yang pernah dipakai login magic link (`magic_link_token.used_at` tidak null) → terverifikasi.
  - Nomor HP yang ada → `LEGACY` (dianggap terverifikasi). Email lain → `LEGACY` belum terverifikasi.
- `PATCH /admin/me` dari app lama yang mengubah email: tetap diterima, `email_verified_at = NULL`.
- Edit tanggungan oleh wali → `GUARDIAN`; edit di Portal → `ADMIN`.

### 3.6 Magic link lebih jujur
- Bila email terdaftar dan pengiriman **gagal** (server tahu): balas error
  `EMAIL_UNAVAILABLE` "Layanan email sedang gangguan. Coba masuk dengan OTP WhatsApp."
  Email tidak terdaftar tetap dijawab umum (tidak membocorkan data).
- Pencarian email tidak peka huruf besar/kecil (3.5).

### 3.7 Kode masuk dari admin cabang
- Portal → detail jemaat → tombol **"Buat kode masuk sementara"**: 6 digit, berlaku 10 menit, sekali pakai.
  Hanya role dengan akses menu jemaat di cabang itu. Tercatat di audit log (siapa, untuk siapa, kapan).
- Disimpan di `otp_verification` (purpose `ADMIN_CODE`, `created_by_user_id`).
- Dipakai di layar OTP yang sama: `/auth/otp/verify` (nomor HP) dan `/auth/email-otp/verify` (email)
  menerima kode admin untuk akun itu. App lama pun bisa memakainya lewat kolom OTP biasa
  (cukup admin membuat kode lalu jemaat menekan "Kirim OTP" — lihat catatan 3.7a).
- 3.7a: agar app lama bisa memakai kode admin tanpa OTP baru terkirim, `/auth/otp/request` tidak
  menimpa kode admin yang masih aktif (kode admin dicek lebih dulu saat verifikasi).

### 3.8 Pengaman kontak
- Server menolak menghapus kontak terakhir (nomor & email kosong bersamaan) untuk akun dewasa.
- Tambah nomor yang ternyata milik **data tamu** → riwayat tamu digabung ke akun (pakai
  `lib/jemaat-consolidation`). Milik **anggota lain** → Conflict "sudah dipakai akun lain, hubungi admin cabang".
- `/auth/otp/request` LOGIN untuk nomor tak terdaftar: pesan ditambah
  "Daftar dengan email? Pilih *Masuk dengan email*."

### 3.9 Deteksi data lama saat daftar (cegah akun ganda)

Latar (data produksi 17 Nov 2026): ± 2.500 data jemaat dewasa hasil impor belum punya nomor HP
dan belum pernah login (2.171 punya email, 342 tanpa email sama sekali). Saat orangnya daftar sendiri
lewat WhatsApp, server hanya mencocokkan nomor HP → akun baru terbuat, riwayat data lama tertinggal.

- Endpoint baru `POST /auth/register/match` (dipanggil app setelah OTP terverifikasi + data diri diisi,
  sebelum `/auth/register`). Mencari kandidat di cabang yang dipilih:
  `is_active`, bukan tamu, `no_hp IS NULL` (daftar WA) atau `email IS NULL` (daftar email),
  belum punya akun yang pernah login, **tanggal lahir sama** dan **nama mirip**
  (normalisasi huruf kecil, tanpa gelar/tanda baca; trigram similarity ≥ 0,6 — `pg_trgm`).
  Bila tanggal lahir tidak diisi pendaftar → tidak dicari (terlalu banyak salah cocok).
- Respons hanya berisi data tersamarkan: inisial nama (`Ke**** N********`), cabang,
  ada/tidaknya email (`k*****@gmail.com`). Maks 1 kandidat (yang paling mirip); >1 kandidat setara → dianggap tidak ada.
- Alur:
  - **Kandidat punya email** → app menawarkan "Ya, ini saya": server kirim OTP (purpose `CLAIM_RECORD`)
    ke email data lama. Kode benar → nomor HP / email pendaftar **disambungkan ke data lama**
    (`/auth/register` dengan `claimJemaatId` + bukti OTP), data diri yang kosong dilengkapi, sesi login diberikan.
    Tidak ada akun baru.
  - **Kandidat tanpa email** → pendaftaran tetap jalan (akun baru) dan dicatat sebagai
    **kandidat ganda** (tabel `duplicate_candidate`: jemaat baru, jemaat lama, skor, status) untuk ditinjau
    admin di Portal → Konsolidasi Jemaat (gabung / abaikan).
  - **"Bukan saya"** → pendaftaran jalan seperti biasa; tidak dicatat.
- Tidak pernah menyambung otomatis tanpa bukti (kode email atau keputusan admin).
- Batas: 5 pencarian per jam per nomor/email pendaftar (cegah orang mengintip data lewat coba-coba nama).
- Audit log untuk setiap klaim berhasil (`kind: 'claim-record'`).
- App versi lama tidak memanggil `/register/match` → perilaku lama (akun baru); tetap tercatat kandidat
  ganda lewat pengecekan yang sama di `/auth/register` (tanpa menghalangi pendaftaran).

### 3.10 Lain-lain server
- Terima & catat header `X-App-Version` (log + statistik versi di Portal). Belum dipakai untuk logika.
- Laporan error app: kenali pengguna lewat `jemaatId`, bukan nomor HP.
- Cek sinkronisasi ShiftSoft: pencocokan memakai email juga, supaya akun tanpa nomor HP tidak terbuat ganda.

---

## 4. Fase 2 — App (build baru, tanpa modul native baru)

### 4.1 Daftar
- Layar pilih saluran: **Daftar dengan WhatsApp** / **Daftar dengan email**.
- Email: input email → OTP email (kotak cek spam, masa berlaku 10 menit) → data diri → selesai.
- Saluran gangguan (`WHATSAPP_UNAVAILABLE` / `EMAIL_UNAVAILABLE`) → saran pindah saluran.
- Setelah data diri diisi: panggil `/auth/register/match` (3.9). Bila ada kandidat → layar
  *"Kami menemukan data atas nama Ke\*\*\*\* N\*\*\*\*\*\*\*\* di ECC [cabang]. Apakah ini Anda?"*
  → "Ya, ini saya" (OTP ke email data lama, tersamarkan, dengan hint cek spam) / "Bukan saya".
  Kandidat tanpa email → info singkat "Admin cabang akan menyatukan data lama Anda".
- Tanggal lahir di form daftar: dianjurkan diisi (dipakai untuk menemukan data lama).
- Perbaikan bug: timer 60 menit tidak memunculkan alert berulang; setelah waktu habis
  `reset()` + `router.dismissTo('/(auth)/signup')` (tumpukan layar bersih).

### 4.2 Login
- App HP: OTP WhatsApp / magic link (kotak "cek folder Spam" ditonjolkan).
- Web: OTP WhatsApp / **OTP email** (aktifkan lagi login email di web, `IS_WEB`).
- Layar OTP: tautan **"Dapat kode dari admin cabang?"** (penjelasan singkat, kolom kode yang sama).
- Banner OTP-ke-email ditambah pesan cek spam.

### 4.3 Profil & Beranda
- Bagian **Kontak**: Nomor WhatsApp & Email, masing-masing Tambah/Ubah lewat OTP saluran itu,
  label "Terverifikasi" / "Belum terverifikasi" / "Diinput wali/admin".
- Hint bila salah satu kosong: *"Email / nomor WhatsApp Anda masih kosong. Lengkapi agar tetap bisa
  masuk saat penyedia layanan gangguan."* Versi ringkas di Beranda, bisa ditutup.
- Onboarding: langkah tambah nomor HP jadi opsional (bisa dilewati).

### 4.4 Perbaikan kecil
- Ministry → "Chat koordinator": sembunyikan bila koordinator tanpa nomor.
- Daftar event → baris "Saya": tampilkan email bila nomor kosong.
- Kirim header `X-App-Version` di semua request.
- i18n ID/EN untuk semua teks baru.

---

## 5. Fase 3 — Saluran notifikasi per jenis (Portal)

- Satu pintu pengiriman `notify(type, jemaatId, vars)` menggantikan pemanggilan terpisah
  `createNotification` + `sendWaIfEnabled` (± 40 titik kode).
- Tabel `notification_channel_config` (perluasan `wa_notification_config`): per jenis →
  `in_app`, `whatsapp`, `email` (boolean, semua mati = Off), `wa_fallback_email`
  ("WhatsApp, atau email bila tidak punya nomor"), template WA, judul + isi email.
- Portal: halaman "Saluran Notifikasi" — tabel jenis × saluran (centang), pratinjau template.
- Preferensi pribadi jemaat (pengingat / ucapan / info aktivitas) berlaku untuk WhatsApp & email.
- Email notifikasi dikirim lewat antrean bertahap (seperti Announcement) supaya kuota aman.
- Jenis yang tercakup: pengingat ibadah & event H-1, check-in event, doa, keluarga, group,
  ministry, homecell, pindah cabang, ulang tahun, dan lain-lain yang ada di `wa_notification_config`.

---

## 6. Migrasi database (urutan)

1. `20261204090000_remove_starsender` (Fase 0).
2. `…_otp_email_purpose` — `ALTER TYPE otp_purpose ADD VALUE …` (file sendiri).
3. `…_otp_email` — `otp_verification`: `no_hp` nullable, `email`, `provider`, `created_by_user_id`, indeks.
4. `…_contact_verification` — `jemaat.email_verified_at`, `no_hp_source`, `email_source` + backfill.
5. `…_email_lowercase` — setelah cek ganda bersih.
6. `…_app_config_auth_flags` — saklar Portal (3.4, 3.1 ambang).
7. `…_duplicate_candidate` — `CREATE EXTENSION IF NOT EXISTS pg_trgm`, indeks trigram nama jemaat,
   tabel `duplicate_candidate` (3.9).
8. (Fase 3) `…_notification_channel_config`.

Semua tambahan / pengisian data. Tidak ada kolom yang masih dibaca kode lama yang dihapus.

---

## 7. Saklar Portal baru (Gateway & OTP)

| Saklar | Default saat rilis | Kapan diubah |
|---|---|---|
| OTP daftar lewat email (app versi lama) | Nyala | Matikan setelah app baru tersedia di store |
| Daftar dengan email | Nyala (hanya berpengaruh di app baru) | Matikan sementara bila email bermasalah |
| Ambang "diduga gagal" (N OTP tak terpakai) | 8 | Sesuaikan setelah melihat data |
| OTP salinan email | Always (kondisi sekarang) | Kembalikan ke Fallback setelah 3.1 jalan |

Saklar lama "Lewati verifikasi nomor HP saat onboarding" dihapus setelah app baru dipakai mayoritas.

---

## 8. Urutan rilis

1. **Deploy Fase 0** (API + Portal + migrasi). Hapus `STARSENDER_DEVICE_KEY` & `WA_PROVIDER_ORDER` dari `.env` VPS.
2. **Deploy Fase 1** (API + Portal + migrasi). App lama tidak terpengaruh; saklar 3.4 tetap nyala.
3. **Build & submit Fase 2** ke Apple / Google. Selama review, API Fase 1 sudah siap melayani.
4. Setelah app baru tersedia: matikan saklar "OTP daftar lewat email (app versi lama)".
5. ± 2–4 minggu kemudian: naikkan versi minimum app (paksa update).
6. **Fase 3** dikerjakan terpisah (tidak menghalangi rilis Fase 1–2).

Rollback: tiap fase bisa di-revert per commit; migrasi bersifat tambahan sehingga kode lama tetap jalan
dengan skema baru (kecuali Fase 0 yang menghapus kolom StarSender — kode lama hanya kehilangan saklar itu,
`loadWaRuntime` sudah tahan gagal).

---

## 9. Rencana uji

- **OTP WhatsApp:** Resmi.ID gagal → Fonnte; Fonnte device putus → dilewati → email/admin.
  Simulasi "diduga gagal" (OTP tidak dipakai N kali) → provider dilewati → pulih.
- **OTP email:** daftar, login web, tambah/ubah email; masa berlaku 10 menit; batas kirim; email sekali pakai ditolak.
- **Magic link:** iPhone, iPad, Android, web (link dibuka di perangkat lain); huruf besar/kecil email;
  email gagal kirim → pesan gangguan.
- **Daftar:** jendela 60 menit; panggilan ulang setelah sukses → sesi; transaksi gagal di tengah → tidak ada data sisa.
- **Kode admin:** dibuat di Portal → dipakai di app baru & app lama → sekali pakai → audit tercatat.
- **Data lama:** nama mirip + tanggal lahir sama → kandidat muncul (tersamarkan); klaim lewat OTP email
  → nomor tersambung ke data lama, tidak ada akun baru; kandidat tanpa email → tercatat di Portal;
  dua kandidat setara → tidak ditampilkan; batas pencarian; app lama → tetap tercatat kandidat ganda.
- **Kontak:** tambah nomor milik tamu → riwayat tergabung; milik anggota lain → ditolak; hapus kontak terakhir → ditolak.
- **App lama:** daftar, login, ubah email, ubah nomor tetap berjalan dengan API baru.
- **Notifikasi tanpa nomor:** pengingat, Announcement, doa, keluarga → dilewati (Fase 1) / ke email (Fase 3).
- **Uji beban:** tanpa membuat data produksi (pakai lingkungan uji).

---

## 10. Prasyarat dari tim (sebelum Fase 1 dirilis)

1. **SendGrid:** pastikan paket & kuota cukup untuk OTP + magic link (+ notifikasi email di Fase 3),
   atau siapkan penyedia email cadangan.
2. **DNS domain pengirim:** SPF, DKIM, DMARC benar (cek di SendGrid → Sender Authentication).
3. **Angka dampak** (query di VPS): jumlah anggota, dewasa tanpa nomor HP, tanpa email, hanya WhatsApp.
4. **Cek ganda email** (query di 3.5) sebelum migrasi huruf kecil. Hasil 17 Nov 2026: 3 email ganda
   (2 tampak orang yang sama → konsolidasi; 1 dipakai dua orang berbeda → salah satu diganti/dikosongkan).

---

## 11. Risiko

| Risiko | Mitigasi |
|---|---|
| Kuota email habis saat WhatsApp gangguan | Paket SendGrid memadai / penyedia cadangan; pantau kuota di Portal. |
| OTP email masuk Spam | SPF/DKIM/DMARC; pesan cek spam di app & email. |
| Akun ganda (daftar email lalu WhatsApp) | Konflik saat tambah nomor → konsolidasi di Portal. |
| Magic link bermasalah di perangkat tertentu | Uji lintas perangkat; web memakai OTP email; kode admin sebagai jalan terakhir. |
| Penyalahgunaan kode admin | Hanya role berwenang per cabang, 10 menit, sekali pakai, audit. |
| Saklar app lama lupa dimatikan | Masuk checklist rilis langkah 4. |
| Salah cocok data lama (orang lain bernama mirip) | Wajib tanggal lahir sama + cabang sama; klaim butuh kode ke email data lama; tanpa email → keputusan admin. |
| Mengintip data lewat pencarian nama | Respons tersamarkan, maks 1 kandidat, batas 5 pencarian/jam. |
