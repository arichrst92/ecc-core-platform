# ECC Core Platform — catatan untuk pengembang & asisten AI

## Kontrak server ↔ app (WAJIB dicek sebelum mengubah aturan server)

App Els App (repo `ecc-mobile-app`) **tidak bisa diperbarui lewat OTA** dan
**tidak mengambil teks dari server**. Beberapa angka & perhitungan aturan server
ikut tertanam di app yang sudah terpasang di HP jemaat. Mengubah aturan server
tanpa menyesuaikan app = app menampilkan informasi salah sampai jemaat update
(pernah terjadi: self check-in diubah 30 menit, app tetap menulis "15 menit").

Sebelum mengubah salah satu aturan di bawah:
1. `grep` repo mobile (`app/src/i18n/locales/*.json`, `app/src/utils`, komponen terkait) untuk angka/aturan yang sama.
2. Bila app ikut terdampak: pilih menyamakan server dengan app yang sudah terpasang, ATAU
   ubah app + server bersamaan dan pastikan versi lama tetap tampil benar / ditolak dengan pesan jelas.
3. Perbarui juga panduan Elsa (`apps/core-api/knowledge/*.md`), User Guide Portal, dan Manual.

| Aturan server | Lokasi server | Tertanam di app |
|---|---|---|
| Self check-in dibuka **15 menit** sebelum mulai | `lib/self-checkin.ts` `OPEN_BEFORE_MIN` | i18n `ibadah.self_checkin_opens_at` ("15 menit sebelum mulai"); `ticketActions.ts` `ticketTimes` (jam mulai = opensAt + 15) |
| Self check-in ditutup 30 menit setelah mulai | `lib/self-checkin.ts` `CLOSE_AFTER_START_MIN` | `SelfCheckinEndsCountdown` (tampil ≤ 30 menit sebelum closesAt) |
| Batalkan self check-in s.d. 30 menit setelah ibadah **selesai** | `lib/reservasi-window.ts` `canCancelCheckin` / `CLOSE_AFTER_MIN` | i18n `cancel_checkin_body`; `SELF_CHECKIN_GRACE_MS` (kartu Beranda diburamkan selesai + 30 menit) |
| Scan petugas 30 menit sebelum mulai | `lib/scan-window.ts` `SCAN_BEFORE_MIN` | pesan berasal dari server (aman) |
| Batalkan visit dalam 1 jam | `routes/admin/me-visit.ts` `DELETE_WINDOW_MS` | i18n `visit.cancel_sub` ("1 jam pertama") |
| Absen homecell saat pertemuan dimulai | `lib/homecell-absen.ts` | app ≥ build setelah 2.5.0 memakai `absenDibukaAt` dari server; app lama → server menolak dengan pesan |

Pesan error dari server (`error.message`) tampil apa adanya di app — aman diubah kapan saja.
