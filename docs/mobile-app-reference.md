# ECC Mobile App — Product & Engineering Reference

> Dokumen ini bukan API doc — itu di `docs/mobile-api-guide.md`. Ini adalah **referensi produk, domain, UX, dan engineering decision** untuk vendor mobile app yang akan membangun aplikasi konsumen di atas ECC Core Platform.

## Table of Contents

1. [Tentang ECC Platform](#1-tentang-ecc-platform)
2. [Domain Glossary (Indonesian Church Terms)](#2-domain-glossary)
3. [User Roles & Personas](#3-user-roles--personas)
4. [Core Features Mobile App](#4-core-features-mobile-app)
5. [User Flows](#5-user-flows)
6. [Screen Inventory & Wireframe Hints](#6-screen-inventory--wireframe-hints)
7. [Business Rules & Edge Cases](#7-business-rules--edge-cases)
8. [RBAC di Mobile](#8-rbac-di-mobile)
9. [QR Code & Scanner Strategy](#9-qr-code--scanner-strategy)
10. [Offline-First Considerations](#10-offline-first-considerations)
11. [Notifications](#11-notifications-strategy)
12. [Design System Reference](#12-design-system-reference)
13. [Internationalization](#13-internationalization)
14. [Privacy, Data, & Security](#14-privacy-data--security)
15. [Performance Budgets](#15-performance-budgets)
16. [Testing Scenarios](#16-testing-scenarios)
17. [Release Strategy](#17-release-strategy)

---

## 1. Tentang ECC Platform

**ECC** adalah jaringan gereja dengan struktur hierarkis multi-tier. Platform digital-nya melayani manajemen jemaat, ibadah, event komunitas, dan engagement member secara end-to-end.

**Stakeholder utama:**

- **Jemaat reguler** — anggota gereja yang datang ibadah, ikut event, berhomecell, dan memberi persembahan.
- **Volunteer / Pengurus** — jemaat yang melayani di tim ministry (Worship, Multimedia, Usher, Penggembalaan, dll). Beberapa volunteer ditugaskan sebagai scanner kehadiran.
- **Fulltimer** — hamba Tuhan dan staf admin gereja. Akses portal web penuh; mobile app jarang dipakai (mereka pakai laptop).
- **Konsumer eksternal** — sistem integrasi (mobile attendance terminal di lokasi, BI tools, dll) yang akses via API key.

**Mobile app target audience** adalah **jemaat reguler + volunteer** — mereka yang aktif di kegiatan gereja dan butuh akses cepat dari HP.

### Arsitektur multi-tier

```
Sinode (organisasi induk)
  └── Cabang Gereja (city/regional)
        └── Jemaat (member individu)
              └── Roles, Pelayanan, Homecell membership
```

Satu sinode bisa punya banyak cabang. Satu jemaat terdaftar di **satu cabang home** (kategori "Cabang Home"), tapi bisa hadir di cabang lain (mis. saat dinas keluar kota). Mobile app harus tunjukkan jemaat:

- "Profil saya di cabang X (home)"
- "Ibadah / event yang available di cabang manapun"

---

## 2. Domain Glossary

Istilah Indonesia khas konteks gereja Pentecostal/Charismatic Indonesia:

| Istilah | Arti / Definisi |
|---|---|
| **Sinode** | Organisasi induk lintas cabang. Mengelola standar doktrin, training, dll. |
| **Cabang Gereja** | Lokasi gereja fisik (mis. ECC Jakarta, ECC Bandung). Punya jemaat sendiri. |
| **Jemaat** | Anggota gereja individu. Tidak harus rajin hadir, status keanggotaan ada di field `isActive` + role. |
| **Kategori Ibadah** | Klasifikasi ibadah: Ibadah Umum, Ibadah Doa, Ibadah Pemuda, Ibadah Anak (Sekolah Minggu), Komsel, Persekutuan Kategorial. |
| **Ibadah** | Acara ibadah rutin atau sekali pakai. Punya `tipeJadwal`: WEEKLY (tiap minggu), BIWEEKLY (tiap 2 minggu), MONTHLY, atau ONCE. |
| **Occurrence** | Satu instance dari ibadah recurring. Mis. Ibadah Minggu Pagi punya occurrence setiap Minggu. Satu occurrence bisa di-cancel (mis. minggu Natal). |
| **Pelayanan** | Tim ministry operasional: Multimedia, Worship, Usher, Children Ministry, Teens Ministry, Prayer, Hospitality, Penggembalaan. |
| **Pelayanan Role** | Peran spesifik dalam tim ministry: Leader (10), Co-Leader (5), Member (0), Trainee (-5). Level untuk hierarki + display warna. |
| **Petugas** | Jemaat yang ditugaskan melayani di ibadah/event specific dengan role tertentu. |
| **Volunteer** | Sinonim petugas di konteks Event. |
| **Authorized Scanner** | Volunteer yang ditandai `canScanAttendance=true`, berwenang scan QR untuk check-in jemaat. |
| **Reservasi** | Booking jemaat untuk hadir di ibadah pada tanggal tertentu. Status: RESERVE → JOIN (hadir) → CANCEL. |
| **Walk-in attendance** | Jemaat datang tanpa reservasi → di-scan QR-nya → sistem auto-create reservasi dengan status JOIN. |
| **Homecell** | Cellgroup / small group meeting (4-15 orang) untuk discipleship + persekutuan. Dilakukan di rumah-rumah anggota, biasanya mingguan. |
| **Homecell Area** | Zona/kelompok homecell. Satu cabang punya banyak area, satu area punya banyak homecell. |
| **PIC (Person In Charge)** | Pemimpin yang bertanggung jawab. PIC Homecell Area = Zone Leader. PIC Homecell = Homecell Leader. |
| **Role / SubRole / Status** | Klasifikasi keanggotaan jemaat. Role: Jemaat / Fulltimer. SubRole + Status untuk hierarki internal. |
| **Renungan** | Devotional/inspirational content harian (biasanya berdasarkan ayat Alkitab). |
| **News** | Pengumuman, berita gereja, jadwal acara. |
| **Event / Movement** | Aktivitas berbatas waktu di luar ibadah rutin — Retreat, KKR, Puasa 21 Hari, Penggalangan Dana Pembangunan, dll. |
| **Persembahan** | Donasi / sumbangan jemaat. Cabang punya rekening bank multi-purpose: Persembahan Umum, Pembangunan, Diakonia, Misi, dll. |
| **Kartu QR Jemaat** | QR code statis berisi 8-char kode unik milik tiap jemaat. Satu kartu untuk seluruh hidup keanggotaan — scan di ibadah maupun event. |
| **OTP** | One-Time Password 6 digit yang dikirim via WhatsApp untuk login. |
| **Face Login** | Login shortcut dengan face recognition (128-dim descriptor di-store di server, matched at login). |
| **Fulltimer** | Staf gereja penuh waktu (Pastor, Admin, dll). Punya akses portal web. |

---

## 3. User Roles & Personas

### Persona A: Anggota Reguler ("Citra", 28 tahun)

**Demografi**: Jemaat tetap di ECC Jakarta. Pekerja kantoran, ke gereja Minggu pagi + ikut homecell Rabu malam.

**Kebutuhan mobile**:
- Cek jadwal ibadah minggu ini
- Reservasi tempat duduk (kalau gereja pakai sistem booking)
- Lihat renungan harian + scrolling timeline news
- Akses kartu QR untuk scan saat masuk gereja
- Daftar event seperti retreat / KKR + bayar via QRIS
- Lihat info homecell-nya + roster pertemuan minggu depan
- Cek riwayat kehadiran (Streak / "kamu hadir 4 minggu berturut-turut")

**Frekuensi**: 3-5x seminggu (terutama Sabtu malam untuk cek besok pagi ibadah, Senin pagi untuk renungan, Rabu untuk homecell info).

**Tech literacy**: Medium. Familiar dengan Gojek/Grab interactions tapi tidak hacker.

### Persona B: Volunteer Scanner ("Andi", 35 tahun)

**Demografi**: Bagian dari tim Usher di ECC Jakarta. Datang lebih awal tiap Minggu untuk handle kehadiran.

**Kebutuhan mobile**:
- Quick auth ke mode scanner (mungkin pakai face login untuk speed)
- Camera scanner mode dengan QR detection cepat
- Indikator visual (sound + green flash) saat scan success
- Bisa scan ratusan jemaat dalam 30 menit pre-ibadah
- Sees stats: "523 jemaat sudah check-in"
- Handle exception: kartu rusak → manual input kode
- Walk-in: scan jemaat yang tidak reservasi → auto-register

**Frekuensi**: 1x per minggu (Sabtu/Minggu pagi), tapi intensif (1-2 jam).

**Tech literacy**: Medium-low. Butuh UI yang sangat clear, button besar, error message dalam bahasa Indonesia.

### Persona C: PIC Homecell ("Maria", 42 tahun)

**Demografi**: Homecell Leader di Jakarta Pusat. Lead sekitar 8 jemaat.

**Kebutuhan mobile**:
- Lihat list anggota homecell-nya
- Tambah anggota baru (kalau ada jemaat yang gabung)
- Kontak cepat ke anggota (tap nomor → WhatsApp)
- Set jadwal pertemuan ad-hoc (di luar API existing — bisa diakomodasi di v2)
- Cek apakah anggota juga hadir di ibadah Minggu (untuk follow-up)

**Frekuensi**: 1-2x seminggu.

### Persona D: Fulltimer / Admin ("Pastor Daniel", 50 tahun)

**Demografi**: Lead Pastor. Punya akses portal web.

**Kebutuhan mobile**:
- Mostly read-only. Pakai portal web untuk admin work.
- Mobile app: cek stats cepat (kehadiran ibadah tadi pagi, peserta event terbaru, dll).
- Push notification penting (rate of attendance turun, event deadline, dll) — future.

**Frekuensi mobile**: 1-2x sehari sambil baca-baca.

---

## 4. Core Features Mobile App

Prioritized:

### MVP (v1.0) — wajib

| Feature | Endpoint API | Status |
|---|---|---|
| Login OTP WhatsApp | `/auth/otp/request` + `/auth/otp/verify` | ✅ Ready |
| Token refresh otomatis | `/auth/refresh` | ✅ Ready |
| Profile sendiri (read + edit limited) | `/admin/jemaat/:id` (sendiri) | ✅ Ready |
| Kartu QR Jemaat | dari `user.menuAccess` → render QR client-side | ✅ Ready |
| Calendar ibadah | `/admin/ibadah/calendar` | ✅ Ready |
| Detail ibadah | `/admin/ibadah/:id` | ✅ Ready |
| Reservasi tempat di ibadah | `/admin/reservasi` (existing) | ✅ Ready |
| News list + detail | `/admin/news` | ✅ Ready |
| Renungan list + detail | `/admin/renungan` | ✅ Ready |
| Info cabang + rekening persembahan + QRIS | `/admin/cabang/:id` + `/admin/cabang/:id/rekening` | ✅ Ready |
| Event list + detail | `/admin/event` | ✅ Ready |
| Daftar event + upload bukti transfer | `/admin/event/:id/peserta` + `/bukti` | ✅ Ready |

### V1.1 — fitur volunteer

| Feature | API |
|---|---|
| Mode Scanner (camera) untuk check-in ibadah | `POST /admin/ibadah/:id/checkin` |
| Mode Scanner untuk check-in event | `POST /admin/event/:id/checkin` |
| Riwayat scan dalam sesi | local state |
| Override flow (force=true) | parameter di endpoint |

### V1.2 — engagement features

| Feature | API status |
|---|---|
| Push notification (reminder ibadah, event deadline) | ⚠ Backend belum ada notif service |
| Streak attendance / leaderboard | Hitung dari Reservasi.status=JOIN |
| Komentar di renungan (engagement) | ⚠ Belum ada model di backend |
| Sharing renungan ke WhatsApp / social | Native share intent |
| Homecell roster + attendance per pertemuan | ⚠ Backend belum ada HomecellAttendance model |

### V2+ — advanced

- Self-onboarding (jemaat baru register sendiri dari mobile)
- Pelayanan schedule (volunteer lihat tugas-tugas mereka)
- Donation history (lihat riwayat persembahan jemaat sendiri) — kalau gereja track per jemaat
- AI prayer assistant integration
- Audio sermon library

---

## 5. User Flows

### Flow 5.1: First-Time Login

```
[Splash]
   ↓
[Onboarding 3 slides] (skip-able)
   ↓
[Welcome screen with logo]
   ↓ "Login dengan No HP"
[Input no HP]
   ↓ submit → POST /auth/otp/request
[OTP screen 6 input boxes]
   ↓ submit → POST /auth/otp/verify
[Success → save tokens + cache user]
   ↓
[Home screen / Dashboard]
```

**Edge cases:**
- No HP belum terdaftar → "Hubungi pengurus cabang untuk register" + tombol contact admin.
- OTP salah 3x → cooldown 5 menit (BE enforces).
- WhatsApp tidak nyala / tidak terima OTP → "Kirim ulang OTP" button (cooldown).
- Network error → retry button, jangan lose state input.

### Flow 5.2: Check-in di Ibadah Minggu Pagi (User View)

```
[Pre-Sunday] — user dapat reminder push notif (future)
   ↓
[Sunday morning, di lokasi gereja]
[User buka app → home shows "Hari ini ada Ibadah Minggu Pagi 08:00"]
   ↓ tap kartu ibadah
[Detail Ibadah]
   ↓ tap "QR Saya"
[QR Code full screen — tampilkan kode jemaat dalam besar]
   ↓ (volunteer scan QR di pintu masuk)
[QR otomatis di-blur/hide setelah 30 detik untuk privasi]
```

User tidak perlu action manual setelah scan — backend update status reservasi (atau auto-create walk-in).

### Flow 5.3: Volunteer Scan Kehadiran

```
[Volunteer login at /scanner mode]
   ↓
[Scanner screen — camera live preview]
   ↓ (auto-detect QR dari camera)
[QR detected → POST /admin/ibadah/{id}/checkin {kode}]
   ↓
[Result overlay] — show jemaat name + photo
   ✓ "Citra Dewi — berhasil check-in"
   ↓ (auto-dismiss after 1.5s, kembali ke scanner)
[Counter di top: "523 sudah check-in"]
```

**Edge cases & UX feedback:**

| Server response | UI feedback |
|---|---|
| 200 success new check-in | Green flash + "Berhasil" + ding sound |
| 200 already checked-in (idempotent) | Blue flash + "Sudah check-in 10 menit lalu" + soft tone |
| 200 walk-in (auto-create reservasi) | Yellow flash + "Walk-in — berhasil" |
| 403 not authorized scanner | Red error + "Anda tidak berwenang scan event ini" + return ke home |
| 404 kode tidak ditemukan | Red flash + "Kode tidak dikenali — coba lagi" |
| 409 paid event not yet paid | Yellow modal + "Belum bayar — Override?" → force=true |
| Camera permission denied | Show settings link |
| Camera focus tidak fokus | Hint "Dekatkan QR ke kamera" |

### Flow 5.4: Daftar Event Berbayar (Retreat)

```
[Home / Events tab]
   ↓
[List event card] — hero image + judul + tanggal + badge "Berbayar Rp 750.000"
   ↓ tap
[Event Detail]
   - Hero image full
   - Judul + ringkasan
   - Tanggal range + lokasi
   - Deskripsi (markdown rendered)
   - Quota indicator: "32/50 sudah daftar"
   - Tombol "Daftar" (sticky bottom)
   ↓
[Daftar form]
   - Catatan custom (mis. "Ukuran kaos L")
   - Konfirmasi
   ↓ POST /admin/event/:id/peserta
[Daftar berhasil — show info bank transfer + QRIS]
   - "Transfer Rp 750.000 ke:"
     BCA 1234567890 a.n. Yayasan ECC
     atau scan QRIS [show image]
   - "Upload bukti transfer"
   ↓ tap upload
[Camera / gallery picker]
   ↓ upload → POST /admin/event/:id/peserta/:id/bukti
[Status berubah jadi "Menunggu Verifikasi"]
[Push notif "Pembayaran diverifikasi" saat admin approve]
[Status jadi BAYAR; menjelang event, jadi reminder]
```

### Flow 5.5: Lihat & Bayar Persembahan

```
[Home → tab "Persembahan" / "Beri"]
   ↓
[List cabang yang relevan: cabang home + sinode]
   ↓ pilih cabang
[List rekening per purpose:]
   - Persembahan Umum — BCA 1234567890
   - Pembangunan — Mandiri 9876543210
   - Diakonia — BRI 1111222233
   ↓ tap salah satu
[Detail Rekening]
   - Bank + nomor + atas nama
   - QRIS image (clickable to enlarge)
   - Tombol "Copy nomor" / "Share"
   - Tombol "Saya sudah transfer" (future: upload bukti optional)
```

### Flow 5.6: Cek Renungan Pagi

```
[Push notif 06:00 "Renungan hari ini: 'Pengharapan Baru'"]
[Tap notif → masuk app → langsung ke Renungan detail]
   ↓
[Renungan detail]
   - Hero image
   - Ayat Alkitab (highlight)
   - Body markdown
   - Date stamp
   - Tombol Share (WhatsApp / Copy link / Instagram story)
   - Bookmark untuk read later
   - Tombol "Renungan kemarin" / "besok"
```

---

## 6. Screen Inventory & Wireframe Hints

Minimum screens untuk MVP:

| # | Screen | Notes |
|---|---|---|
| 1 | **Splash** | Brand logo, redirect berdasarkan auth state |
| 2 | **Onboarding** (3 slides) | Skip-able. First-launch only. |
| 3 | **Login (input no HP)** | Native keyboard, format `+62` prefix auto-fill |
| 4 | **OTP Verify** | 6 input boxes, auto-advance, resend button cooldown |
| 5 | **Home / Dashboard** | Greeting + foto user + cards: ibadah hari ini, event upcoming, renungan terbaru, news headline |
| 6 | **Tab bar utama (bottom nav)** | Home / Ibadah / Event / Persembahan / Profil |
| 7 | **Ibadah Calendar view** | Bisa grid bulanan atau list timeline |
| 8 | **Ibadah Detail** | Info + tombol "QR saya" |
| 9 | **QR Code Modal** | Full screen QR, auto-blur after 30s |
| 10 | **Event List** | Grid cards |
| 11 | **Event Detail** | Hero + scroll content + sticky bottom CTA |
| 12 | **Event Daftar Form** | Catatan + konfirmasi |
| 13 | **Event Bayar Info** | Bank info + QRIS + upload bukti |
| 14 | **Event Status** | Status timeline: Daftar → Menunggu → Bayar → Hadir |
| 15 | **News/Renungan List** | Tab switcher: News / Renungan |
| 16 | **News/Renungan Detail** | Markdown render, share button |
| 17 | **Cabang Info** | Alamat + map + kontak + rekening (multi card) |
| 18 | **Rekening Detail** | Bank info + QRIS + tombol copy |
| 19 | **Homecell Detail** (kalau jemaat anggota) | List anggota + PIC contact |
| 20 | **Profil Saya** | Foto + nama + no HP + kode jemaat + edit limited fields + logout |
| 21 | **Settings** | Notif toggle, dark mode, language, about |
| 22 | **Scanner Mode** (volunteer only) | Full-screen camera + bottom bar with stats |
| 23 | **Scanner Result Overlay** | Animasi sukses/error |
| 24 | **Force Scan Modal** | Override warning |
| 25 | **Error / Empty State** | Reusable component dengan illustration |

### State variations untuk setiap screen

- **Loading**: skeleton (bukan spinner penuh layar)
- **Empty**: illustration + helpful copy + CTA jika applicable
- **Error**: retry button + technical detail di collapse
- **Offline**: cached data + banner "Mode offline"

---

## 7. Business Rules & Edge Cases

### 7.1 Login & Authentication

- **No HP normalize**: client-side normalize `082/62/8/+62` → E.164 sebelum kirim. Display di UI bebas (`0821-1567-8446` untuk readability), kirim ke API selalu `+6282115678446`.
- **OTP cooldown**: 5 menit antara request OTP. UI harus tampilkan timer countdown.
- **Token expire**: access token 15 menit, refresh token 30 hari. App harus auto-refresh sebelum API call (atau interceptor pattern).
- **Multi-device**: 1 user bisa login di banyak device. Refresh token per device tracked di server (table `refresh_token`).
- **Logout**: invalidate refresh token di server + clear local storage.
- **Force logout**: kalau API return 401 setelah refresh juga gagal, force logout + redirect login.

### 7.2 Ibadah & Kehadiran

- **Ibadah recurring** vs ONCE — cek `tipeJadwal`:
  - WEEKLY/BIWEEKLY/MONTHLY → ada banyak occurrence
  - ONCE → cuma `tanggalMulai`
- **Occurrence ditiadakan** (mis. Natal jatuh di Minggu) → `IbadahOccurrenceStatus.status=CANCELLED`. App harus skip dari calendar — backend sudah filter di `/calendar` endpoint.
- **Reservasi 1 per (jemaat, ibadah, tanggal)** — unique constraint. Re-reservasi tanggal sama akan fail.
- **Walk-in scan** — kalau jemaat scan tanpa reservasi, backend auto-create. App tidak perlu handle ini secara khusus.
- **Idempotent check-in** — scan ulang jemaat yang sudah JOIN return success dengan `meta.alreadyCheckedIn=true`. Treat sebagai info, bukan error.

### 7.3 Event

- **3 Tipe Bayar**:
  - `GRATIS` — daftar langsung, no payment
  - `NOMINAL_TETAP` — jumlah fixed, ditentukan admin. Wajib bayar.
  - `NOMINAL_BEBAS` — jemaat tentukan sendiri (optional minimum di `nominal`)
- **Quota**: kalau `quotaPeserta` tercapai (count partisipasi non-BATAL), POST baru reject 409. UI tampilkan "Quota penuh" + disable tombol daftar.
- **Lifecycle status**: DAFTAR → MENUNGGU_VERIFIKASI (bukti uploaded) → BAYAR (admin approve) → HADIR (admin scan/mark) → BATAL.
- **butuhKehadiran=false**: event tidak ada scan check-in. Status berhenti di BAYAR.
- **butuhKehadiran=true**: scan QR di hari H → status HADIR.

### 7.4 Homecell

- **Member lifecycle**: `tanggalBergabung` (default today), `isActive=true`, `tanggalKeluar=null` saat join. Saat keluar, `tanggalKeluar=now`, `isActive=false`.
- **Re-aktivasi** masih supported — backend clear `tanggalKeluar`, set `isActive=true`.
- **Tidak ada attendance per pertemuan** di MVP saat ini. Kalau perlu, perlu add `HomecellMeeting` + `HomecellAttendance` model.

### 7.5 Persembahan / Rekening

- **Multi rekening per cabang**: 1 cabang bisa punya banyak rekening dengan purpose berbeda. App show semua rekening aktif (`isActive=true`).
- **QRIS opsional**: rekening tanpa QRIS tetap valid — app show "Belum ada QRIS, transfer manual".
- **App tidak tracking transfer**: pembayaran manual via bank/QRIS, app tidak verify ke gateway payment. Untuk konfirmasi, jemaat lapor admin via channel terpisah (atau lewat upload bukti di event-context).

### 7.6 Konten (News & Renungan)

- **Targeting audience**:
  - `sinodeId=null, cabangId=null` → konten **global** (semua jemaat di semua cabang lihat)
  - `sinodeId=X, cabangId=null` → konten **sinode-wide** (jemaat di sinode X)
  - `sinodeId=X, cabangId=Y` → konten **cabang-specific** (jemaat di cabang Y)
- **Filter di mobile**: app harus filter berdasarkan jemaat current — tampilkan global + sinode-jemaat + cabang-jemaat.
- **isPublished filter**: app hanya tampilkan `isPublished=true`. Draft tidak visible.

---

## 8. RBAC di Mobile

Mobile app dapat `menuAccess` map dari login response. Pakai untuk:

### Hide / show fitur

```typescript
if (user.menuAccess.event?.canRead) {
  showTab('Event');
}
if (user.menuAccess.event?.canWrite) {
  showButton('CreateEvent');  // probably never on mobile
}
```

### Conditional features berdasarkan permission

| User type | menuAccess example | Mobile features tersedia |
|---|---|---|
| Jemaat regular | `{ dashboard, event, news, renungan }` semua canRead | Home, Event list, News, Renungan, Profil, QR card |
| Volunteer scanner | + `ibadah` canRead, special flag canScanAttendance | + Mode Scanner |
| Pelayanan member | + `pelayanan` canRead | + "Tugas saya" tab (list ibadah yang dia tugaskan) |
| Fulltimer | full access | + admin dashboard quick stats |

### Authorized scanner check

Wewenang scan check-in **tidak** dari `menuAccess` — itu per-event/per-ibadah via `EventPelayananPetugas.canScanAttendance` atau `IbadahPelayananPetugas.canScanAttendance`. Mobile app:

1. Setelah login, fetch list event/ibadah yang user-nya scanner via endpoint baru (belum ada — perlu di-build):

```
GET /admin/me/scanner-events    → list event{butuhKehadiran, sebagai scanner}
GET /admin/me/scanner-ibadah    → list ibadah yang user scanner
```

2. Atau lebih simple: tombol "Scan" di event/ibadah detail, baru cek di endpoint check-in. Kalau 403, tampilkan error.

> **Note**: endpoint `/admin/me/scanner-*` ini **belum di-build**. Sementara, pakai pattern (2) — coba scan, handle 403 gracefully.

---

## 9. QR Code & Scanner Strategy

### QR yang harus app handle

**Outgoing QR** (jemaat *show* dari app):

- Format: 8 char alphanumeric uppercase (mis. `ABC23XYZ`)
- Source: `user.kode` dari auth response (atau re-fetch via `/admin/jemaat/by-kode/{kode}`)
- Render client-side dengan library QR (mis. `qrcode_flutter`, `react-native-qrcode-svg`) — tidak perlu API call.
- Auto-blur/hide setelah 30 detik untuk privasi (jangan lifetime full-screen).

**Incoming QR** (volunteer scan):

- Sumber QR: kartu QR jemaat (8 char) atau legacy kode reservasi (8 char dengan format berbeda).
- Mobile scanner pakai library kamera + QR decoder (mis. `mobile_scanner`, `react-native-vision-camera`).
- App perlu detect 8 char alphanumeric; kalau format lain (URL, vCard, dll), ignore.

### Distinguishing kode jemaat vs kode reservasi

Keduanya 8 char alphanumeric. Distinction by context:

- Saat user di **mode scanner ibadah/event**, treat sebagai **kode jemaat** → endpoint `/admin/ibadah/{id}/checkin` atau `/admin/event/{id}/checkin`.
- Saat di **mode scanner reservasi (legacy)**, treat sebagai **kode reservasi** → endpoint `/api/v1/reservasi/checkin`.

Untuk MVP, mobile cuma perlu support kode jemaat (kode reservasi legacy untuk backward-compat mobile lama).

### Scanner UX

**Tips:**

1. **Continuous scan mode** — setelah satu scan sukses, jangan close camera. Lanjut scan berikutnya.
2. **Debounce** — kalau QR sama discan 2x dalam 3 detik, ignore yang kedua (cegah double-fire).
3. **Visual feedback strong** — green/red flash + sound + haptic (vibration).
4. **Manual input fallback** — kalau QR rusak, admin bisa ketik kode 8 char manual.
5. **Result overlay non-blocking** — tampil 1.5 detik, auto-dismiss.

### Camera permission

Request permission **at scanner page entry**, bukan di app launch. Kalau ditolak:

- Show explanation: "Untuk scan QR jemaat, kami butuh akses kamera."
- Tombol "Buka Settings" → deep link ke settings app.
- Fallback: input manual kode.

---

## 10. Offline-First Considerations

Mobile app sering offline atau slow network. Strategi:

### Data yang harus cache lokal

| Data | Cache strategy | Refresh trigger |
|---|---|---|
| User profile + menuAccess | Persistent | Login + manual refresh |
| Calendar ibadah 1 bulan ahead | Persistent | Daily background |
| News + Renungan terbaru (20 latest) | Persistent | Hourly atau on-open |
| Cabang info + rekening | Persistent | Weekly |
| Event list | Cache 1 jam | Pull-to-refresh |

Pakai library:
- Flutter: `Drift` / `Hive` / `Sembast`
- React Native: `MMKV` / `WatermelonDB` / `Realm`

### Offline action queue

Untuk action yang time-sensitive (scan check-in, daftar event):

```
[User scan QR di lokasi tanpa signal]
   ↓
[Save ke local queue: { eventId, kode, scannedAt, attemptId }]
   ↓ (background worker)
[Saat online → POST /checkin]
   ↓ success → remove dari queue + show notif "X scan sync"
   ↓ failure (404 kode not found, dll) → retry up to 3x, lalu mark failed
```

**Penting**: backend check-in idempotent — duplicate scan tidak masalah. Queue items dengan duplicate kode bisa langsung di-merge.

### Network state indicator

Banner di top kalau offline:

```
⚠ Mode offline — data mungkin tidak terbaru. Tap untuk refresh.
```

---

## 11. Notifications Strategy

> **Backend status**: notification system **belum di-build**. App harus implement Firebase Cloud Messaging (FCM) / Apple Push Notification (APNS) sendiri dan kirim ke endpoint backend yang nantinya akan dibuat.

### Notification yang direkomendasikan

| Trigger | Notif content | Action |
|---|---|---|
| H-1 sebelum ibadah Minggu | "Besok ada Ibadah Minggu Pagi 08:00 di ECC Jakarta" | Open ibadah detail |
| H-0 jam 06:30 | "QR siap. Tampilkan saat masuk gereja" | Open QR card |
| Renungan baru published (06:00 daily) | "Renungan hari ini: '{judul}'" | Open renungan detail |
| Event baru published | "Event baru: {judul}" | Open event detail |
| Event deadline H-3 | "Pendaftaran retreat ditutup 3 hari lagi" | Open event detail |
| Bukti transfer di-approve | "Pembayaran Retreat Pemuda diverifikasi ✓" | Open event status |
| Bukti transfer ditolak (kalau ada flow ini di future) | "Bukti transfer perlu dicek ulang" | Open event status |
| Ibadah dibatalkan (mis. minggu Natal) | "Ibadah Minggu Pagi 25 Des ditiadakan" | Open ibadah detail |

### Privacy & opt-in

User harus bisa opt-out per kategori di Settings:

- [x] Reminder ibadah
- [x] Renungan harian
- [x] News & event
- [x] Payment update

---

## 12. Design System Reference

### Brand colors

Sesuai portal (`apps/portal/tailwind.config.ts`):

```
Brand orange (primary):
  brand-50  #FFF7ED  — background lembut
  brand-100 #FFEDD5  — chip background
  brand-500 #F97316  — primary action, link
  brand-600 #EA580C  — hover state
  brand-700 #C2410C  — pressed state

Accent yellow:
  accent-400 #FBBF24 — accent highlight
  accent-500 #F59E0B — accent button

Neutral:
  Black     #0A0A0A — body text dominan
  Gray-500  #737373 — secondary text
  Gray-200  #E5E5E5 — divider, border
  White     #FFFFFF — surface

Semantic:
  Success   #22C55E — green
  Warning   #F59E0B — amber (sama dgn accent)
  Error     #EF4444 — red
  Info      #3B82F6 — blue
```

### Typography

- **Font family**: Inter (system fallback OK)
- **Sizes** (recommended):
  - Display: 32 / 28 (heading utama)
  - Title: 22 / 20 (subheading)
  - Body: 16 / 15 (default)
  - Caption: 13 / 12 (small text, timestamp)
  - Micro: 11 / 10 (label, badge)
- **Weight**: 400 regular, 500 medium, 600 semibold, 700 bold

### Component patterns

| Pattern | Description |
|---|---|
| **Card** | rounded-xl (12-16px), `bg-white`, shadow-sm, border-neutral-200 |
| **Button primary** | `bg-brand-500`, rounded-lg, padding 12x16, text-white, font-medium |
| **Button secondary** | `bg-white`, border, hover bg-neutral-50 |
| **Input** | rounded-lg, border-neutral-300, focus ring-2 ring-brand-500 |
| **Badge** | Status warna sesuai context (lihat semantic colors) |
| **Modal / bottom sheet** | rounded-t-2xl (16px), drag handle di top |
| **Toast** | rounded-lg, success/error/info color, auto-dismiss 3-4s |

### Iconography

Pakai **Lucide Icons** untuk konsistensi dengan portal — tersedia di `lucide-react` (web), `lucide-react-native` (RN), `lucide_icons` (Flutter).

### Animation

- **Page transition**: slide horizontal (iOS) atau fade+rise (Android material)
- **Modal**: slide-up from bottom
- **Toast**: slide-in from top, slide-out same
- **Tap feedback**: scale 0.97 + slight opacity drop
- **Loading skeleton**: shimmer animation (gradient sliding)

---

## 13. Internationalization

**Bahasa primary**: Indonesia.

**Tone**: friendly + respectful (jangan terlalu formal — gereja kontemporer, target young adults).

### String guidelines

| Konteks | Style |
|---|---|
| Heading | Title Case Bahasa: "Ibadah Minggu Pagi" |
| Button | Imperative + sopan: "Daftar Sekarang", "Lihat Selengkapnya" |
| Error | Specific + actionable: "Nomor HP belum terdaftar. Hubungi pengurus cabang." (bukan "Error 404") |
| Empty state | Encouraging: "Belum ada event di cabang Anda. Cek lagi minggu depan!" |

### Date format

- Display: `19 Mei 2026` (Indonesian short)
- Day + Date: `Sabtu, 19 Mei 2026`
- Time: `08:30 - 10:30`
- Relative: `2 jam lalu`, `kemarin`, `3 hari lalu`, lalu absolute `19 Mei`

### Currency

- Format: `Rp 750.000` (titik separator, no decimal untuk angka bulat)
- Lib: `intl` (Flutter `NumberFormat.currency('id_ID')`, JS `Intl.NumberFormat('id-ID')`)

---

## 14. Privacy, Data, & Security

### Data sensitivity tiers

| Data | Sensitivity | Handling |
|---|---|---|
| No HP, email | Medium | OK to display di profile, mask di list view (`+628211234****`) |
| Foto profil | Low-Medium | OK to display |
| Kartu QR / kode jemaat | **High** | Auto-blur after 30s, JANGAN screenshot reminder, don't share |
| Tanggal lahir | High | Hanya display di profile-nya sendiri |
| Alamat | High | Sama |
| Face descriptor | **Critical** | Tidak pernah keluar dari device (kalau di-stored di mobile) atau dari server. Hash-only display. |
| JWT / refresh token | **Critical** | Simpan di iOS Keychain / Android Keystore. **NEVER** di SharedPreferences plain / localStorage. |
| API key (untuk mobile scanner mode) | **Critical** | Sama, secure storage |

### Local encryption

- iOS: Keychain (default encrypted)
- Android: EncryptedSharedPreferences atau Keystore-backed wrapper
- Flutter: `flutter_secure_storage`
- RN: `react-native-keychain` atau `expo-secure-store`

### Network security

- Pinning SSL certificate (di prod) — opsional tapi recommended untuk anti-MITM
- TLS 1.2+ only
- No analytics third-party yang ingest user data tanpa anonymization

### Compliance

Indonesian PDP Law (UU Perlindungan Data Pribadi) — patuh:

1. **Consent**: minta consent saat onboarding untuk koleksi data + push notif
2. **Purpose limitation**: data jemaat dipakai hanya untuk pelayanan gereja
3. **Right to delete**: user bisa request hapus akun + data (forward ke admin gereja, manual handling)
4. **Encryption at rest** (server) dan **in transit** (HTTPS)

---

## 15. Performance Budgets

Target:

| Metric | Target |
|---|---|
| App size (APK / IPA) | < 30 MB |
| Cold start | < 2s di mid-range Android |
| Time to first meaningful paint (post-login) | < 1.5s |
| API response time p95 | < 500ms |
| Scan-to-result time | < 1s (sebagian besar untuk camera focus + decode) |
| Image load time | < 1s untuk hero, < 500ms untuk thumbnail |
| Battery: scanner mode 1 jam | < 15% battery drain |

### Optimization tips

- **Image**: pakai WebP yang sudah disediakan backend. Lazy load di list. Preload hero di detail.
- **List**: virtualization (FlatList di RN, ListView.builder di Flutter). Jangan render 100 items di tree sekaligus.
- **Network**: batch API calls. Cache aggressively.
- **Bundle size**: tree-shake icons (pakai Lucide subset, bukan full bundle).

---

## 16. Testing Scenarios

### Critical paths (must test sebelum release)

- [ ] Login OTP flow dari awal sampai dashboard tampil
- [ ] Token refresh otomatis di background
- [ ] Force logout kalau refresh token expire
- [ ] Show QR Code (visual correctness — scanable oleh app lain)
- [ ] Scan QR mode — sukses + already checked-in + 403 + 404 + 409 force
- [ ] Calendar ibadah render dengan occurrence cancel di-skip
- [ ] Daftar event berbayar end-to-end (daftar → upload bukti → status update)
- [ ] List event filter quota penuh
- [ ] Profile edit (limited fields) save sukses
- [ ] Settings notif toggle persist
- [ ] Offline behavior: cached data tampil, banner offline visible
- [ ] Offline queue: scan tanpa signal → kirim saat reconnect
- [ ] Network error: retry button works
- [ ] Permission denied: settings deep-link
- [ ] Deep link: notif tap → open correct screen

### Device matrix minimum

- iOS: iPhone 11 (iOS 15) + iPhone 14 (iOS 17)
- Android: Mid-range Samsung A-series (Android 11+) + Pixel 6+ (Android 14)
- Screen sizes: 360dp / 393dp / 412dp width
- Test slow network (Network Link Conditioner 3G)

### Accessibility quick checks

- [ ] Tap target min 44x44 pt
- [ ] Color contrast 4.5:1 untuk body text (gunakan WebAIM contrast checker)
- [ ] Screen reader labels (semantic labels di Flutter, accessibilityLabel di RN)
- [ ] Dynamic Type / font scaling support

---

## 17. Release Strategy

### Phased rollout

1. **Alpha (internal)**: tim Fulltimer + sebagian volunteer test 2 minggu.
2. **Beta closed**: 50-100 jemaat aktif. Feedback channel via Telegram/WhatsApp.
3. **Beta open**: rilis ke 1-2 cabang dulu (ECC Jakarta), 4 minggu.
4. **GA**: semua cabang via TestFlight + Play Store.

### Versioning

Semantic versioning: `Major.Minor.Patch+Build`.

- `1.0.0+1` → first GA
- `1.1.0+15` → minor (fitur baru, mis. v1.1 volunteer scanner)
- `1.0.1+8` → patch (bugfix)

### App store metadata

- **Name**: "ECC Companion" atau "MyECC" — final TBD
- **Description**: short (170 char) + long (4000 char) untuk store
- **Screenshots**: minimum 6 — login, dashboard, ibadah, event, QR card, persembahan
- **Privacy policy URL**: wajib untuk both stores. Hosted di `eccchurch.global/privacy`.
- **Support email**: tech-support email dari admin gereja

### Crash + analytics

- **Crash reporting**: Sentry / Firebase Crashlytics — wajib production
- **Analytics**: Mixpanel / Amplitude — track:
  - DAU/WAU/MAU
  - Funnel: login → first meaningful action
  - Feature usage: ibadah view, event daftar, QR scan
  - Performance: API latency, crash rate

**Never** kirim PII (nama, no HP, alamat) ke analytics. Anonymize dengan user-id hash.

---

## 18. Open Questions & Decisions

### Sudah diputuskan (per 2026-05-19 + 2026-05-21)

- [x] **Self-registration dari mobile?** → **YES, auto-active**. Flow: OTP enrollment → POST /auth/register. Anti-abuse: rate limit 3/jam/IP + 1 register per nomor. Lihat section 20.
- [x] **Family management confirmation flow?** → **Auto-verify** (trust-based, tidak ada 2-way confirm). Kolom `isVerified` di schema tetap di-keep — kalau perlu, switch ke confirmation flow di Phase 2 tanpa migrasi schema.
- [x] **Push notification infrastructure?** → **Defer total**. Mobile pakai local notification (expo-notifications) untuk reminder ibadah saja. Backend tidak punya endpoint device token / notification model sampai infra ready.
- [x] **Bilingual content?** → **UI translated (id/en), konten Indonesia**. Tidak ada field `judulEn` / `kontenEn` di backend.
- [x] **Streak hadir source?** → **Endpoint stats dedicated** (`GET /admin/me/stats`) — bukan hitung client-side dari list reservasi.

### Masih open

- [ ] Native (Swift+Kotlin) vs cross-platform (Flutter / React Native)?
- [ ] App store: ECC sendiri yang punya akun developer atau vendor?
- [ ] Single app untuk semua persona (jemaat + volunteer + admin) atau split?
- [ ] Bahasa label UI: hanya Indonesia, atau juga English untuk expat?
- [ ] Self-service forgot face / reset descriptor dari mobile?
- [ ] Apakah mobile perlu show donation history personal (kalau backend track)?
- [ ] Offline scanner mode: berapa lama queue di-keep?
- [ ] White-label per sinode (mis. ECC, GBI, dll punya brand mereka sendiri) atau single brand?
- [ ] Branch change: apakah ada SLA approval (mis. 24 jam) atau dibiarkan tanpa target?
- [ ] Family link confirmation: kapan switch dari auto-verify ke 2-way confirm? (Trigger: kalau ada abuse case)

---

## 20. Phase 1 Implementation Status (per 2026-05-21)

Response terhadap feedback tim mobile app (`api-gap-analysis.md` + `backend-meeting-brief.md`). Semua endpoint yang ditandai 🔴 di gap analysis sebagian besar sudah di-implement, kecuali push notif yang sengaja di-defer.

### Schema baru

| Model | Tabel | Purpose |
|---|---|---|
| `FamilyRelation` | `family_relation` | Self-managed family network (M5). Auto-verify, reciprocal pair |
| `BranchChangeRequest` | `branch_change_request` | Mobile submit permintaan pindah cabang (M6) |
| Jemaat extension | `jemaat.primary_guardian_id`, `jemaat.registered_via_jemaat_id` | Dependent (anak balita tanpa HP) + audit self-onboarding |

Migration: `packages/database/prisma/migrations/20260521100000_mobile_app_phase1/`.

### Endpoint baru (semuanya sudah live di Swagger)

**Auth:**

- `POST /auth/register` — self-registration jemaat baru (post-OTP enrollment)

**Self-service `/admin/me/*`:**

- `GET /admin/me` — full profile (Jemaat + User + cabang + roles + homecells)
- `PATCH /admin/me` — edit field subset (nama, email, alamat, tanggalLahir, jenisKelamin)
- `POST /admin/me/foto` — upload foto profile (multipart, max 5MB)
- `GET /admin/me/stats` — streak, attended this year, events joined
- `GET /admin/me/scanner-events` — event yang user-nya scanner
- `GET /admin/me/scanner-ibadah` — ibadah yang user-nya scanner
- `GET /admin/me/homecell-managed` — homecell yang user-nya PIC
- `GET /admin/me/homecell-area-managed` — area yang user-nya PIC
- `GET /admin/me/family` — list family network
- `POST /admin/me/family/link-by-kode` — link via QR scan
- `POST /admin/me/family/link-by-phone` — link via no HP
- `POST /admin/me/family/register-new` — register anak balita + auto-link
- `PATCH /admin/me/family/:jemaatId` — update role
- `DELETE /admin/me/family/:jemaatId` — unlink (kedua arah)
- `GET /admin/me/branch-change-requests` — riwayat permohonan user
- `POST /admin/me/branch-change-request` — submit permohonan baru

**Event:**

- `POST /admin/event/:id/peserta/batch` — daftar multi-jemaat sekaligus (M3)
- `GET /admin/event/:id/checkin/stats` — live count untuk scanner mode

**Ibadah:**

- `GET /admin/ibadah/:id/checkin/stats?tanggalIbadah=YYYY-MM-DD` — live count per occurrence

**Homecell:**

- `POST /admin/homecell/:id/members/by-kode` — tambah member via QR scan

**Admin queue:**

- `GET /admin/branch-change-request` — list request (filter status, cabangId)
- `GET /admin/branch-change-request/:id` — detail
- `POST /admin/branch-change-request/:id/review` — approve / reject

### Penting untuk mobile dev

1. **Self-registration auto-active**: jemaat baru langsung dapat token + bisa pakai app penuh. Cabang admin tidak block usage — kalau perlu verify, lakukan di portal (Jemaat list, ada filter tanggalBergabung hari ini).

2. **Family auto-verify**: A link B → both arah ke-create reciprocal (CHILD ↔ PARENT, SPOUSE ↔ SPOUSE, SIBLING ↔ SIBLING). Tidak ada notifikasi ke jemaat B. Kalau A salah link, A bisa unlink sendiri — tidak perlu approval B. Trade-off: trust-based, future bisa switch ke 2-way confirm.

3. **Dependent jemaat (anak balita)**: register-new tanpa noHp → jemaat baru di-create dengan `primaryGuardianId = parent's jemaatId`. Tidak bisa login mandiri. Mobile: jangan show login flow untuk dependent — manage via parent's app.

4. **Scanner endpoint pattern**: pakai `GET /admin/me/scanner-events` (atau `/scanner-ibadah`) untuk tahu user authorized di mana. Reactive pattern (try scan → 403 → friendly error) tetap works, tapi proaktif lebih clean UX.

5. **Stats polling**: `GET /:id/checkin/stats` aman di-poll 10-15 detik. Rate limit admin 300/menit → 4-6/menit cukup longgar.

6. **Branch change**: max 1 PENDING per jemaat. User harus tunggu admin approve/reject sebelum bisa submit baru. Tidak ada notifikasi otomatis ke jemaat saat approved — mobile harus poll `GET /admin/me/branch-change-requests` (atau show di Settings page yang user buka sesekali).

### Yang ditunda (Phase 2+)

- **Push notifications**: device token registry + notification model + FCM/APNS sender. Mobile pakai local notif untuk reminder.
- **WA confirmation untuk family link**: switch dari auto-verify. Trigger kalau ada abuse case.
- **WebSocket realtime**: scanner stats current pakai polling.
- **Bookmark renungan server-side**: bisa local-only di AsyncStorage.
- **Translation konten id/en**: konten tetap Indonesia.
- **Branch change SLA**: tidak ada hard deadline, admin manual flow.

---

## 21. Resources

| Doc | Lokasi |
|---|---|
| API spec interactive | `{BASE_URL}/docs` (Swagger UI) |
| API integration guide | `docs/mobile-api-guide.md` |
| Domain knowledge | `knowledge-base.md` (di root repo) |
| Portal source (referensi UI) | `apps/portal/src/app/dashboard/*` |
| Design tokens | `apps/portal/tailwind.config.ts` |
| Backend source | `apps/core-api/src/` |
| Database schema | `packages/database/prisma/schema.prisma` |

### Contact

- Product owner: TBD
- Tech lead (BE): IDEA dev team
- Design: TBD
- QA: TBD

---

*Document version: 1.1 · Last updated: 2026-05-21 · For ECC Mobile App vendor onboarding. v1.1 = Phase 1 endpoints (M1-M9 gap analysis response).*
