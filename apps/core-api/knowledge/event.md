---
id: event
title: Event — Pendaftaran, Pembayaran, Pembatalan, Sesi & Petugas
tags: event, pendaftaran, daftar, peserta, kuota, berbayar, sukarela, gratis, nominal, bukti transfer, verifikasi, tolak bukti, lunas, batal, pembatalan, refund, grup sesi, sesi, natal, walk-in event, tiket event, publish, butuh kehadiran, laporan event, website pembayaran
summary: Membuat event, tipe bayar, aturan pendaftaran (tutup saat mulai), grup sesi, verifikasi/tolak bukti transfer, aturan pembatalan, batal otomatis, walk-in di lokasi, petugas & laporan.
---

# Event — Pendaftaran, Pembayaran, Pembatalan, Sesi & Petugas

## Tempat & akses
- Portal: **Movement → Event** (`/dashboard/event`), detail event `/dashboard/event/<id>`. Laporan: **Laporan Event**.
- Membuat/mengubah/menghapus event, melihat & mengubah peserta, menyetujui pembayaran, dan mengatur petugas butuh **akses menu Event** (tulis; hapus untuk menghapus) — diberi lewat Role Access.
- App: Event dibuka dari Beranda / Akses Cepat (2.4.9: menu bawah tidak lagi punya tab Event). Tiket event di tab **Reservasi → Event**.

## Membuat event (Portal)
1. Event → Tambah Event: judul, slug (otomatis), ringkasan, deskripsi (markdown didukung: tebal, poin, judul, tautan).
2. Tanggal mulai/selesai, jam mulai/selesai, lokasi (+ link Google Maps). Lokasi/jam yang dikosongkan tampil **"-"** di app.
3. Audiens: sinode atau cabang tertentu.
4. **Tipe bayar**: Gratis (hijau) · **Sukarela** (biru; dulu "donasi / nominal bebas") · **Berbayar nominal tetap** (kuning). Untuk berbayar/sukarela isi rekening + QRIS (opsional). Sukarela boleh punya nominal minimum.
5. Kuota peserta (opsional), syarat usia (opsional), tags.
6. **Butuh Kehadiran** — nyalakan bila ada scan QR/absensi di hari H (tanpa ini scan ditolak "Event ini tidak mencatat kehadiran").
7. **Grup sesi** (opsional) — lihat bagian Grup sesi.
8. **Izinkan self check-in** + radius lokasi, rating & ulasan on/off.
8b. **Syarat peserta** (role tertentu) dan **beri role otomatis** kepada peserta (mis. tahap Spiritual Journey / kelas) — opsional.
9. **Publish** → event tampil di app. Hanya event **aktif & dipublikasikan** yang bisa didaftari.

## Aturan pendaftaran (app, website & Portal)
- Pendaftaran **online (app & website) ditutup saat event dimulai** → setelah itu hanya **walk-in di lokasi** lewat petugas. Pengelola event di Portal tetap bisa mendaftarkan peserta.
- Jemaat hanya bisa mendaftarkan **diri sendiri, keluarga, dan tamunya** ("Hanya bisa mendaftarkan diri sendiri dan anggota keluarga.").
- Peserta yang belum memenuhi syarat usia ditandai "Belum memenuhi syarat usia" dan tidak bisa dicentang.
- **Kuota penuh** → pendaftaran ditolak; admin di Portal bisa tetap memasukkan (force).
- Angka peserta di kartu/detail event: **app 2.5.0 ke bawah** "N/kuota" = jumlah **terdaftar** (tidak termasuk batal; no-show tetap dihitung). **Web & build setelah 2.5.0**: sebelum check-in dibuka (15 menit sebelum mulai) "N terdaftar dari kuota", sesudahnya "N hadir dari kuota" (event yang mencatat kehadiran). Status "Kuota penuh" tetap mengikuti jumlah terdaftar.
- Tombol **sukarela/daftar dinonaktifkan** di app bila pendaftaran sudah ditutup atau kuota penuh (untuk yang belum terdaftar).
- "Event ini belum dibuka untuk pendaftaran." → event belum publish/aktif.

## Grup sesi (mis. 3 ibadah Natal di hari yang sama)
- Event dengan kode **grupSesi** yang sama: satu jemaat hanya boleh punya **satu pendaftaran aktif** di antara event-event itu. **Pindah sesi = batalkan dulu** pendaftaran di sesi lama.
- Berlaku untuk pendaftaran online (app, website, Portal). **Petugas di lokasi** (walk-in / tambah tamu hari H) tidak dibatasi.
- Saat scan: peserta yang tidak terdaftar di sesi ini tapi terdaftar di sesi lain → pesan menyebut sesi lain tempat ia terdaftar.

## Pembayaran
- **Berbayar**: setelah daftar, peserta transfer lalu **upload bukti** → status **Menunggu Verifikasi** → admin setujui → **Lunas**. QR/tiket aktif setelah diverifikasi.
- **Sukarela** di iPhone/app: pendaftaran + nominal + upload bukti dilakukan di **halaman web** (eccchurch.global/event/…/pembayaran) sesuai aturan App Store. App membuka halaman itu sudah login (token sekali pakai, sesi 30 menit). Minimal Rp 1.000/orang (atau nominal minimum event). Tombol "Kembali ke Els App" menutup browser. "Sesi kedaluwarsa" → buka ulang dari app.
- Pemberian sukarela tambahan dari website tercatat per baris sendiri.
- **Wajib lunas sebelum check-in**: event berbayar selalu; sukarela hanya bila ada nominal minimum (tanpa minimum, peserta boleh hadir walau belum memberi).

### Verifikasi bukti (Portal)
1. Detail event → bagian **Pembayaran** (badge merah di menu Event = bukti menunggu).
2. Klik bukti, cocokkan dengan mutasi rekening.
3. **Setujui** → Lunas; peserta bisa self check-in dan tiket bertuliskan "Lunas".
4. **Tolak bukti** (bukti salah/buram/nominal tidak sesuai): isi alasan → status peserta kembali **Daftar** dan peserta mendapat notifikasi *"Bukti pembayaran ditolak"* berisi alasan, lalu bisa upload ulang dari halaman event. Hanya bukti yang sedang menunggu verifikasi yang bisa ditolak.

## Pembatalan
Aturan sama di app, website, dan Portal (oleh peserta sendiri):
- Sudah **hadir** → tidak bisa dibatalkan sendiri ("… sudah hadir — tidak bisa dibatalkan. Hubungi admin event bila keliru.").
- Sudah **bayar / menunggu verifikasi** → dibatalkan **lewat admin event** (untuk pengembalian dana).
- Event **sudah dimulai** → tidak bisa dibatalkan sendiri.
- Admin membatalkan peserta (ubah status ke Batal di Portal) → peserta mendapat notifikasi *"dibatalkan oleh admin"*.

## Batal otomatis (no-show)
- Tiket event yang **belum dibayar** dibatalkan otomatis **30 menit setelah event selesai** (hanya event yang "Butuh Kehadiran"). Peserta yang sudah membayar / menunggu verifikasi **tidak** dibatalkan.
- Petugas tetap bisa check-in tiket yang terlanjur dibatalkan bila orangnya hadir.

## Hari H — check-in & walk-in
- Check-in peserta terdaftar: 30 menit sebelum s.d. 30 menit setelah jam mulai; terlambat → dicatat walk-in (lihat panduan *checkin-scan*).
- **Walk-in / tamu di lokasi** oleh petugas: untuk event berbayar wajib pilih metode bayar tamu (**Tunai / Transfer / QRIS**) atau Gratis — langsung tercatat lunas ("Diterima petugas").
- Pengingat event hanya dikirim untuk event **aktif**.

## Petugas & volunteer event
- Portal → detail event → **Pelayanan & volunteer**: tautkan pelayanan, tambah volunteer (anggota pelayanan), atur peran, **Beri akses scan**, dan (2.5.0) **tugas** (Kategori → Tugas).
- Koordinator pelayanan (pemegang otoritas cabang) juga bisa mengatur petugas event cabangnya dari app.

## Notifikasi terkait event
EVENT_REGISTERED (daftar diterima), EVENT_APPROVED (pembayaran disetujui), EVENT_CHECKED_IN (kehadiran tercatat), EVENT_PAYMENT_REJECTED (bukti ditolak + alasan), EVENT_CANCELLED_BY_ADMIN (dibatalkan admin), pengingat event.

## Kasus umum
- **"Tiket event belum muncul"** → tarik layar untuk memuat ulang; event berbayar → tiket aktif setelah pembayaran diverifikasi.
- **"Tidak bisa daftar lagi"** → cek apakah event sudah mulai, kuota penuh, belum publish, atau sudah terdaftar di sesi lain dalam grup sesi yang sama.
- **"Mau pindah sesi Natal"** → batalkan pendaftaran sesi lama dulu (bila belum bayar/hadir), lalu daftar sesi baru. Bila sudah bayar → admin event.
- **"Sudah transfer tapi masih menunggu"** → admin cek Pembayaran di detail event; setujui atau tolak dengan alasan.
- **"Nominal minimum untuk event ini adalah …"** → nominal sukarela di bawah minimum.
- **"Event ini gratis — tidak perlu bukti transfer."**, **"Event ini nominal tetap — pembayaran hanya sekali dan sudah tercatat."** → upload bukti tidak diperlukan.
- **"Pendaftaran ini sudah dibatalkan. Daftar ulang dulu sebelum mengunggah bukti."**

## Diagnosis (untuk Elsa)
- `event` (isActive, isPublished, tanggalMulai/Selesai, jamMulai, butuhKehadiran, grupSesi, kuota, tipe bayar) → `event_participation` (status DAFTAR/HADIR/BATAL, filter eventId + jemaatId) → `event_donation` (status MENUNGGU_VERIFIKASI/BAYAR/BATAL per participationId) → `event_pelayanan_petugas` untuk hak scan petugas.
