# ECC Core Platform — catatan untuk pengembang & asisten AI

## Kontrak server ↔ app (WAJIB dicek sebelum mengubah aturan server)

App Els App (repo `ecc-mobile-app`) **tidak bisa diperbarui lewat OTA** dan
**tidak mengambil teks dari server**. Beberapa angka & perhitungan aturan server
ikut tertanam di app yang sudah terpasang di HP jemaat. Mengubah aturan server
tanpa menyesuaikan app = app menampilkan informasi salah sampai jemaat update
(pernah terjadi 2026-11: self check-in diubah ±30 menit dari mulai, app tetap menulis "15 menit sebelum mulai" & menghitung tutup setelah selesai → dikembalikan).

Sebelum mengubah salah satu aturan di bawah:
1. `grep` repo mobile (`app/src/i18n/locales/*.json`, `app/src/utils`, komponen terkait) untuk angka/aturan yang sama.
2. Bila app ikut terdampak: pilih menyamakan server dengan app yang sudah terpasang, ATAU
   ubah app + server bersamaan dan pastikan versi lama tetap tampil benar / ditolak dengan pesan jelas.
3. Perbarui juga panduan Elsa (`apps/core-api/knowledge/*.md`), User Guide Portal, dan Manual.

| Aturan server | Lokasi server | Tertanam di app |
|---|---|---|
| Self check-in dibuka **15 menit** sebelum mulai | `lib/self-checkin.ts` `OPEN_BEFORE_MIN` | i18n `ibadah.self_checkin_opens_at` ("15 menit sebelum mulai"); `ticketActions.ts` `ticketTimes` (jam mulai = opensAt + 15) |
| Self check-in ditutup **30 menit setelah ibadah/event SELESAI** | `lib/self-checkin.ts` `CLOSE_AFTER_MIN` | `SELF_CHECKIN_GRACE_MS`; `SelfCheckinEndsCountdown` ("berakhir dalam" setelah selesai); kartu Beranda diburamkan & tombol check-in hilang selesai + 30 menit; `ticketTimes` (jam selesai tiket = closesAt − 30) |
| Batalkan self check-in s.d. 30 menit setelah ibadah **selesai** | `lib/reservasi-window.ts` `canCancelCheckin` / `CLOSE_AFTER_MIN` | i18n `cancel_checkin_body` |
| Reservasi tidak dipakai dibatalkan otomatis selesai + 30 menit | `lib/auto-cancel.ts` (`CLOSE_AFTER_MIN`) | — (sama dengan penutupan self check-in) |
| Scan petugas 30 menit sebelum mulai | `lib/scan-window.ts` `SCAN_BEFORE_MIN` | pesan berasal dari server (aman) |
| Batalkan visit dalam 1 jam | `routes/admin/me-visit.ts` `DELETE_WINDOW_MS` | i18n `visit.cancel_sub` ("1 jam pertama") |
| Label okupansi ibadah/event "reservasi/terdaftar" → "hadir" (app & website) | `routes/admin/ibadah.ts` `okupansi.reservasi/checkinOpensAt`, `lib/event-attendance.ts` `attendanceInfo`, `routes/public-unauth.ts` (calendar `hadir/checkinOpensAt`, event `hadirCount`) — rumus = `selfCheckinOpensAt` | `OccupancyBar`, `utils/eventCount.ts` memakai waktu dari server (aman); app ≤ 2.5.0 hanya menampilkan hadir/terdaftar |
| Pesan "Reservasi ditutup… gunakan self check-in" di daftar ibadah | `routes/admin/ibadah.ts` calendar: `reservasiClosesAt` TIDAK dikirim untuk ibadah anak yang sudah mulai (+ `isKidsIbadah`) | app ≤ 2.5.0 daftar ibadah selalu pakai teks ibadah umum (i18n `deadline.ibadah_closed`); 2.5.1 pakai `deadline.kids_closed` |
| Batal pendaftaran event sendiri: ditolak bila sudah bayar / menunggu verifikasi / event mulai | `lib/event-payment.ts` `selfCancelBlockedReason` (pesan `CANCEL_NOT_ALLOWED`); detail event `mine-and-family` mengirim `canCancel` | app ≤ 2.5.0 menampilkan tombol "Batalkan pendaftaran" untuk semua status selain HADIR/BATAL (server menolak dengan pesan); 2.5.1 memakai `canCancel` |
| Tiket event: nominal diberikan & QR | `routes/admin/me-event-tiket.ts` `totalBayar` (pembayaran di partisipasi + donasi), `event.butuhKehadiran` | app menampilkan `totalBayar` (fallback `event.nominal` bila 0); 2.5.1: nominal di kartu ringkas & tanpa QR bila `butuhKehadiran=false` |
| Hitung mundur pendaftaran di kartu event | `routes/admin/event.ts` daftar: `registrationClosesAt` TIDAK dikirim untuk event sukarela (detail tetap mengirim) | kartu Beranda & daftar Event (`DeadlineCountdown`) tampil bila field ada; 2.5.1 juga memeriksa `tipeBayar` |
| Label zona jam "Waktu <kota cabang>" (ECC Bali → "Waktu Bali", bukan "Makassar") | `lib/tz.ts` `cabangKota({nama,kota})`/`tzZoneLabel`/`jamWithZone`/`instantInTzLabel` (pengingat push, pesan absen homecell, check-in event, jemput CKids); kolom `cabang_gereja.kota` (Portal → Cabang, opsional); `/auth/cabang` mengirim `kota`; Portal `lib/tz-label.ts` | app ≤ 2.5.0 membentuk label dari zona IANA (`utils/time.ts` `TZ_CITY`) → tetap "Waktu Makassar" sampai update; 2.5.1 `cabangCity()` (kota dari daftar cabang, cadangan nama tanpa "ECC") |
| Statistik scanner ibadah (header "hadir/total") | `routes/admin/ibadah.ts` `GET /:id/checkin/stats` wajib mengirim `hadir` (= JOIN) & `total` | `app/scanner/ibadah/[id].tsx` membaca `stats.hadir` — tanpa field ini header tampil "/33" |
| Statistik & daftar hadir scanner: hanya petugas scan / admin kehadiran / pengelola event | `ibadah.ts` & `event.ts` `/:id/checkin/stats` + `/checkin/list` (`assertCanScanIbadah`, `assertCanViewEventScan`); tanpa `tanggalIbadah` → hari ini zona cabang | app hanya memanggil dari layar scanner (petugas) — aman; 2.5.1 tidak mengirim tanggal HP |
| Metode check-in `LATE` (sudah reservasi, discan > 30 menit setelah mulai) | `reservasi.ts` & `event.ts` checkin (dulu `WALK_IN`); `lib/attendance-report.ts` `CHECKIN_METHODS` | app ≤ 2.5.0 memakai `meta.walkIn` (tidak berubah); laporan Portal punya kolom "Scan terlambat" |
| Tanpa jalan pintas Fulltimer di group & homecell | `group.ts` `getRequester` (`isGroupAdmin`/`canViewAll` = Role Access Group di Portal), `group-content.ts`, `homecell-pic.ts` `homecellAdmin` (Role Access Homecell), `me-homecell.ts`, `homecell-board.ts`, `me.ts` (ubah zona), `hadiah.ts`, `privacy.canDoCheckin`; detail group `canManage`, detail homecell `isHomecellAdmin` | app ≤ 2.5.0 masih menampilkan tombol kelola untuk Fulltimer → server menolak dengan pesan; 2.5.1 memakai `canManage` / `isHomecellAdmin` |
| Nominal tiket menunggu verifikasi | `me-event-tiket.ts` `totalBayarStatus` (CONFIRMED / PENDING) | app ≤ 2.5.0 menampilkan nominal tanpa keterangan; 2.5.1 menambah "menunggu verifikasi" |
| Pembuatan group dari app = pengajuan (menunggu persetujuan admin Group di Portal) | `group.ts` POST `/` (`approvalStatus` PENDING bila bukan admin Group Portal), `/:id/approve`, `/:id/reject`; group PENDING disembunyikan dari non-pembuat, join/tambah anggota ditolak (`assertGroupApproved`); notifikasi memakai tipe lama `GROUP_JOIN_APPROVED/REJECTED` (`metadata.kind`) supaya app lama bisa membuka | app ≤ 2.5.0 menampilkan toast "berhasil dibuat" (i18n `group.create_success`) lalu halaman group tanpa label; 2.5.1 popup "Pengajuan terkirim" + label "Menunggu persetujuan" |
| Format isi Renungan/News & deskripsi Event (Markdown, editor Portal `components/announcement/markdown-editor.tsx`) | Portal `konten-page.tsx` `KONTEN_TOOLS` (tebal, miring, judul, daftar, kutipan), `event-form-modal.tsx` (semua tombol) | renungan/news app ≤ 2.5.0 = `SimpleMarkdown` lama (tanpa coret, daftar bernomor, link → tampil mentah); 2.5.1 sama dengan Announcement. Event deskripsi sudah `AnnouncementMarkdown` sejak 2.5.0. Tambah tombol renungan/news setelah 2.5.0 tidak dipakai |
| Audiens event level pelayanan (+ level role minimal `minLevel` ≥ & cabang anggota `cabangId` per baris) (selain sinode/cabang) | `lib/event-audience.ts` (`eventAudienceVisibleWhereFull` di daftar event app, `EVENT_PUBLIC_AUDIENCE` di website/tamu); `lib/event-role.ts` `assertEventEligible` (daftar ditolak `NOT_ELIGIBLE`); detail event menambah `requirementLabels` "Anggota pelayanan …" + `myEligible`/`eligibilityMessage` | app ≤ 2.5.0 menyaring cabang di HP, server sudah membuang event khusus pelayanan untuk non-anggota → aman; label syarat tampil lewat `requirementLabels` yang sudah ada |
| Absen homecell saat pertemuan dimulai | `lib/homecell-absen.ts` | app ≥ 2.5.1 memakai `absenDibukaAt` dari server; app lama → server menolak dengan pesan |

Pesan error dari server (`error.message`) tampil apa adanya di app — aman diubah kapan saja.

### Aturan & teks lewat API (2.5.1)
`GET /public/app-config` mengirim `rules` (angka aturan) dan `texts` (teks i18n pengganti per bahasa) — sumbernya `apps/core-api/src/lib/app-rules.ts` (dibentuk dari konstanta server: `OPEN_BEFORE_MIN`, `CLOSE_AFTER_MIN`, `SCAN_*`, `KIDS_MAX_AGE`, `VISIT_CANCEL_MIN`, `HOMECELL_*_DAYS`, `ZONE_*_DAYS`, `ENROLL_WINDOW_MS`) + override Portal (Developer Tools → Diagnostics → **Tulisan di App**, kolom `app_config.app_text_overrides`).
App (`src/config/appRules.ts`): `appRule('…')` untuk hitungan, teks ditimpa ke i18n, disimpan di AsyncStorage (berlaku saat offline).
- Menambah aturan baru yang tampil/dihitung di app → tambahkan ke `AppRules` di KEDUA sisi + teksnya di `ruleTexts()`, jangan menulis angka langsung di app.
- Label app yang salah → perbaiki lewat Portal "Teks app" (pertahankan `{{placeholder}}`), lalu benahi juga file i18n app untuk 2.5.1.
- App ≤ 2.5.0 tidak membaca `rules`/`texts` → tabel di atas tetap berlaku untuk mereka.
- Editor Portal: Diagnostics → tab **Tulisan di App** (`components/diagnostics/app-texts-editor.tsx`). Daftar tulisan bawaan = `apps/portal/src/lib/app-text-catalog.json`; perbarui setelah teks app berubah: `python3 scripts/sync-app-text-catalog.py ../ecc-mobile-app/app/src/i18n/locales`.

## Pengaman darurat Role Access
`ROLE_ACCESS_ADMIN_JEMAAT_IDS` (root `.env`, dipisah koma) **wajib diisi di production** — jemaat ini selalu bisa membuka Portal & menu Role Access (`lib/menu-access.ts` `withBreakGlass`). Tanpa ini, salah atur Role Access hanya bisa diperbaiki lewat database.
