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
| Pesan "Reservasi ditutup… gunakan self check-in" di daftar ibadah | `routes/admin/ibadah.ts` calendar: `reservasiClosesAt` TIDAK dikirim untuk ibadah anak yang sudah mulai (+ `isKidsIbadah`) | app ≤ 2.5.0 daftar ibadah selalu pakai teks ibadah umum (i18n `deadline.ibadah_closed`); build berikutnya pakai `deadline.kids_closed` |
| Batal pendaftaran event sendiri: ditolak bila sudah bayar / menunggu verifikasi / event mulai | `lib/event-payment.ts` `selfCancelBlockedReason` (pesan `CANCEL_NOT_ALLOWED`); detail event `mine-and-family` mengirim `canCancel` | app ≤ 2.5.0 menampilkan tombol "Batalkan pendaftaran" untuk semua status selain HADIR/BATAL (server menolak dengan pesan); build berikutnya memakai `canCancel` |
| Absen homecell saat pertemuan dimulai | `lib/homecell-absen.ts` | app ≥ build setelah 2.5.0 memakai `absenDibukaAt` dari server; app lama → server menolak dengan pesan |

Pesan error dari server (`error.message`) tampil apa adanya di app — aman diubah kapan saja.
