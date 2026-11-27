---
id: event
title: Event — Pendaftaran, Pembayaran, Pembatalan, Sesi & Petugas
tags: event, pendaftaran, daftar, peserta, kuota, berbayar, sukarela, gratis, nominal, bukti transfer, verifikasi, tolak bukti, lunas, batal, pembatalan, refund, grup sesi, sesi, natal, walk-in event, tiket event, publish, butuh kehadiran, laporan event, website pembayaran
summary: Membuat event, tipe bayar, aturan pendaftaran (bawaan tutup saat mulai, bisa diatur per event), grup sesi, verifikasi/tolak bukti transfer, aturan pembatalan, batal otomatis, walk-in di lokasi, petugas & laporan.
---

# Event — Pendaftaran, Pembayaran, Pembatalan, Sesi & Petugas

## Tempat & akses
- Portal: **Movement → Event** (`/dashboard/event`), detail event `/dashboard/event/<id>`. Laporan: **Laporan Event**.
- **Detail event Portal**: bagian dibuat **tab** (Peserta · Pembayaran · Pelayanan & Volunteer · Ulasan). Tab Peserta punya ringkasan jumlah per status + **Tamu** (klik untuk menyaring) dengan rincian **New Comers** dan **Visitor** (masing-masing bisa diklik untuk menyaring; juga tersedia di pilihan filter di atas daftar; tamu yang kategorinya belum ditentukan dihitung Visitor, sama dengan laporan event) dan jam check-in (terbaru di atas). Tab Pelayanan & Volunteer diberi badge biru **Perlu diisi** bila belum ada pelayanan / volunteer / petugas scanner.
- **Export per event (2026-11)**: detail event → **Export Excel / Export PDF** (atau Laporan Event → pilih *Event*). PDF berdesain: kepala oranye dengan gambar & info event, kartu angka ber-ikon (terdaftar/kuota, hadir %, belum hadir, batal, tamu, pembayaran terverifikasi, rating), komposisi peserta, cara check-in & pembayaran dalam grafik batang, **daftar lengkap peserta** (kode, no HP → WhatsApp "Hi, <nama>", email, cabang, keterangan tamu/walk-in/didaftarkan admin, status, jam daftar & hadir, cara check-in + petugas scan, status & nominal pembayaran, catatan) dan ulasan. Akses: Role Access Event (baca) atau Laporan Event.
- Membuat/mengubah/menghapus event, melihat & mengubah peserta, menyetujui pembayaran, dan mengatur petugas butuh **akses menu Event** (tulis; hapus untuk menghapus) — diberi lewat Role Access.
- App: Event dibuka dari Beranda / Akses Cepat (2.4.9: menu bawah tidak lagi punya tab Event). Tiket event di tab **Reservasi → Event**.

## Membuat event (Portal)
1. Event → Tambah Event: judul, slug (otomatis), ringkasan, deskripsi (editor dengan toolbar seperti Announcement: tebal, miring, coret, judul, daftar, daftar bernomor, kutipan, link + tab Pratinjau).
2. Tanggal mulai/selesai, jam mulai/selesai, lokasi (+ link Google Maps). Lokasi/jam yang dikosongkan tampil **"-"** di app 2.5.0; di 2.5.1 baris jam/lokasi & tombol petunjuk arah disembunyikan. Jam tertulis "Waktu <kota cabang>"; event semua cabang = Waktu Jakarta.
3. Audiens: sinode atau cabang tertentu, dan (opsional, 2026-11) **pelayanan** tertentu — Target Audience → **Pelayanan (opsional)**. Dipilih = event hanya tampil di app & hanya bisa diikuti **anggota aktif** salah satu pelayanan itu; per pelayanan bisa dibatasi **level role** (mis. "Koordinator (level 5) ke atas" = hanya anggota dengan role level ≥ 5; level makin tinggi makin senior) dan **cabang anggota** (cabang jemaat, mis. hanya Worship ECC Bali); pelayanan yang sama boleh ditambahkan lagi untuk cabang/level lain (tombol ＋). Jemaat cukup cocok dengan salah satu baris (tetap terlihat oleh yang sudah terdaftar & petugas event); tidak tampil di website / mode tamu. Berlaku juga untuk app 2.5.0 (disaring server); di detail event app tampil sebagai syarat "Anggota pelayanan …".
4. **Tipe bayar**: Gratis (hijau) · **Sukarela** (biru; dulu "donasi / nominal bebas") · **Berbayar nominal tetap** (kuning). Untuk berbayar/sukarela isi rekening + QRIS (opsional). Sukarela boleh punya nominal minimum.
5. Kuota peserta (opsional), syarat usia (opsional), tags.
6. **Butuh Kehadiran** — nyalakan bila ada scan QR/absensi di hari H (tanpa ini scan ditolak "Event ini tidak mencatat kehadiran").
7. **Grup sesi** (opsional) — lihat bagian Grup sesi.
8. **Izinkan self check-in** + radius lokasi, rating & ulasan on/off.
   - **Wajib daftar sebelum hadir** (bawaan aktif). Matikan untuk event dadakan: jemaat boleh langsung datang tanpa daftar — **self check-in** di app (dirinya + keluarga) dan **scan QR oleh usher** langsung mencatatnya **Hadir** (dibuatkan partisipasi otomatis). Hanya untuk event yang butuh kehadiran & **tidak berbayar** (gratis / sukarela tanpa minimum). Kuota tidak membatasi kehadiran; syarat peserta & grup sesi tetap berlaku. Pendaftaran online tetap bisa dipakai. Di app 2.5.1 detail event bertuliskan "Boleh langsung datang tanpa daftar".
8b. **Syarat peserta** (role tertentu) dan **beri role otomatis** kepada peserta (mis. tahap Spiritual Journey / kelas) — opsional.
9. **Publish** → event tampil di app. Hanya event **aktif & dipublikasikan** yang bisa didaftari.

## Aturan pendaftaran (app, website & Portal)
- Pendaftaran **online (app & website) ditutup saat event dimulai** (bawaan) — atau sesuai **Batas Pendaftaran Online** di form event (N menit sebelum mulai; negatif = sesudah mulai). Hitung mundur pendaftaran di app mengikuti batas ini; pesan: "Pendaftaran online sudah ditutup (batasnya …)". Setelah itu hanya **walk-in di lokasi** lewat petugas. Pengelola event di Portal tetap bisa mendaftarkan peserta.
- Jemaat hanya bisa mendaftarkan **diri sendiri, keluarga, dan tamunya** ("Hanya bisa mendaftarkan diri sendiri dan anggota keluarga.").
- Peserta yang belum memenuhi syarat usia ditandai "Belum memenuhi syarat usia" dan tidak bisa dicentang.
- **Kuota penuh** → pendaftaran ditolak; admin di Portal bisa tetap memasukkan (force).
- Hitung mundur pendaftaran (app 2.5.1): format ringkas **Tutup dalam DD:jj:mm:dd** (hari:jam:menit:detik).
- Angka peserta di kartu/detail event: **app 2.5.0 ke bawah** "N/kuota" = jumlah **terdaftar** (tidak termasuk batal; no-show tetap dihitung). **Web & app 2.5.1**: sebelum check-in dibuka (bawaan 15 menit sebelum mulai, atau sesuai pengaturan event) jumlah **terdaftar**, sesudahnya jumlah **hadir** (event yang mencatat kehadiran) — app 2.5.1 menulis ringkas **"N/kuota"** sejajar progress bar, ikon orang = terdaftar, ikon orang-centang = hadir. Status "Kuota penuh" tetap mengikuti jumlah terdaftar. Website eccchurch.global (daftar & panel event) memakai aturan yang sama: "N/kuota terdaftar" lalu "N/kuota hadir".
- App 2.5.1: tulisan kuota di **atas** bar (tidak terpotong).
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
- **Tampilan event sukarela (2.5.1)**: kartu Beranda/daftar tanpa hitung mundur (server tidak mengirimnya untuk event sukarela — berlaku juga di 2.5.0) + ringkasan; daftar Event menampilkan **status saya** (Sudah memberi + nominal / Menunggu verifikasi / tombol Beri Sukarela). Kartu event di **Beranda** (2.5.1) menampilkan flag harga **Gratis / Sukarela / Rp…** di pojok kanan atas gambar (tanpa kotak status); detail event menampilkan ucapan terima kasih (bukan "Sampai bertemu di acara").
- **Event tanpa kehadiran** (Butuh Kehadiran mati): 2.5.1 menyembunyikan **Tiket Saya** & QR.
- **Nominal di tiket** = nominal yang benar-benar diberikan (bukan minimum); bila belum diverifikasi tertulis "menunggu verifikasi" (2.5.1) dan tanpa tombol bayar.
- **Wajib lunas sebelum check-in**: event berbayar selalu; sukarela hanya bila ada nominal minimum (tanpa minimum, peserta boleh hadir walau belum memberi).

### Verifikasi bukti (Portal)
1. Detail event → bagian **Pembayaran** (badge merah di menu Event = bukti menunggu).
2. Klik bukti, cocokkan dengan mutasi rekening.
3. **Setujui** → Lunas; peserta bisa self check-in dan tiket bertuliskan "Lunas".
4. **Tolak bukti** (bukti salah/buram/nominal tidak sesuai): isi alasan → status peserta kembali **Daftar** dan peserta mendapat notifikasi *"Bukti pembayaran ditolak"* berisi alasan, lalu bisa upload ulang dari halaman event. Hanya bukti yang sedang menunggu verifikasi yang bisa ditolak.

## Pembatalan
Aturan sama di app, website, dan Portal (oleh peserta sendiri):
- Sudah **hadir** → tidak bisa dibatalkan sendiri ("… sudah hadir — tidak bisa dibatalkan. Hubungi admin event bila keliru.").
- Sudah **bayar / menunggu verifikasi** → dibatalkan **lewat admin event** (untuk pengembalian dana). App 2.5.0 masih menampilkan tombol "Batalkan pendaftaran" (server menolak dengan pesan); 2.5.1 menyembunyikannya (`canCancel`).
- Event **sudah dimulai** → tidak bisa dibatalkan sendiri.
- Admin membatalkan peserta (ubah status ke Batal di Portal) → peserta mendapat notifikasi *"dibatalkan oleh admin"*.

## Batal otomatis (no-show)
- Tiket event yang **belum dibayar** dibatalkan otomatis saat **self check-in ditutup** (bawaan **30 menit setelah event selesai**; sesuai *Jam self check-in* di form event, paling cepat saat event selesai) (hanya event yang "Butuh Kehadiran"). Peserta yang sudah membayar / menunggu verifikasi **tidak** dibatalkan.
- Petugas tetap bisa check-in tiket yang terlanjur dibatalkan bila orangnya hadir.

## Hari H — check-in & walk-in
- **Portal → Event → detail → Check-in**: tombol **Scan pakai kamera** (kamera laptop/HP, browser Chrome/Edge/Safari terbaru) — scan berkelanjutan, QR yang sama diabaikan beberapa detik; bisa juga scanner USB atau ketik kode/nama/no HP.
- Daftar peserta Portal: kotak **Cari nama / no HP**; label **Walk-in** untuk jemaat yang didaftarkan langsung oleh admin di Portal (atau dicatat petugas di lokasi tanpa pendaftaran). Tamu tetap berlabel "Tamu · walk-in / dibawa …" ditambah label **New Comer** (hijau) atau **Visitor** (biru); kategori diubah di Portal → Tamu.
- **Ditambahkan di Portal = langsung hadir (2026-11)**: detail event → *Tambah peserta* pada event yang mencatat kehadiran dan sudah hari pelaksanaan → peserta langsung **HADIR** (metode Manual). Event berbayar: pilih *Pembayaran diterima* (Tunai/Transfer/QRIS/Gratis) — dicatat sebagai pembayaran terverifikasi. Sebelum hari-H / event tanpa kehadiran → tetap *terdaftar*. Peserta yang sudah terdaftar lalu ditambahkan lagi → ditandai hadir. Tamu dari menu Tamu: pilihan bawaan *Hadir sekarang* (event hari-H).
- Check-in peserta terdaftar: 30 menit sebelum s.d. 30 menit setelah jam mulai; lewat itu peserta terdaftar dicatat **terlambat** (metode LATE, kolom "Scan terlambat" di laporan), tamu tanpa pendaftaran = walk-in (lihat panduan *checkin-scan*). Petugas yang scan tercatat ("oleh Anda / oleh <petugas>" di Daftar Hadir scanner 2.5.1).
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

- **"Event tidak muncul di app saya"** → cek audiens: cabang lain, atau event khusus anggota pelayanan tertentu (Portal → detail event, baris audiens "… · Pelayanan X"). Bergabung ke pelayanan itu dulu, atau minta admin mendaftarkan.
- **"Tidak bisa daftar: belum diperbolehkan … anggota pelayanan X"** → event khusus pelayanan; jemaat harus anggota aktif pelayanan itu (Pelayanan → anggota).

## Diagnosis (untuk Elsa)
- `event` (audiencePelayanan → event_audience_pelayanan, isActive, isPublished, tanggalMulai/Selesai, jamMulai, butuhKehadiran, grupSesi, kuota, tipe bayar) → `event_participation` (status DAFTAR/HADIR/BATAL, filter eventId + jemaatId) → `event_donation` (status MENUNGGU_VERIFIKASI/BAYAR/BATAL per participationId) → `event_pelayanan_petugas` untuk hak scan petugas.

## Visualisasi Daftar & Absen (Portal, 2026-11)
- Detail event → tab **Visualisasi Daftar & Absen** (`GET /admin/event/:id/visualisasi`, pengelola event). Diperbarui otomatis tiap menit.
- **Ringkasan**: terdaftar aktif (vs kuota), batal, hadir (% dari terdaftar), belum/tidak hadir, tamu aktif (New Comer · Visitor), datang tanpa daftar.
- **Pendaftaran harian** H-30 s/d hari terakhir event: batang atas = daftar, bawah = batal, dipisah Jemaat / New Comer / Visitor; garis = pendaftar aktif kumulatif; hari acara diarsir.
- **Absensi per 15 menit** dari 720 menit sebelum mulai s/d 60 menit setelah selesai (event beberapa hari: pilih hari); tampilan per cara absen atau per jemaat/tamu; garis kumulatif; jam puncak.
- **Proporsi cara absen**: Self check-in · Scan petugas (termasuk scan terlambat & walk-in) · Absen Portal (manual admin).
- Tambahan: komposisi yang hadir, ketepatan waktu (sebelum mulai / telat ≤ 15 / > 15 menit), corong daftar → lunas → hadir, petugas scan teraktif, alasan batal, hadir per cabang.
- Tamu tanpa kategori dihitung Visitor (sama dengan laporan event).

## Aturan event & tombol di tab Peserta (Portal, 2026-11)
- Tab Peserta punya bagian buka-tutup **Aturan event ini** (`GET /admin/event/:id/aturan`): pendaftaran (sampai kapan), kuota, biaya, self check-in (dibuka/ditutup jam berapa, cek jarak lokasi atau tidak), scan petugas (30 menit sebelum mulai s/d akhir hari, lewat 30 menit setelah mulai = terlambat), tamu & walk-in, batal otomatis, batal sendiri, grup sesi, dan wewenang admin — lengkap dengan jam sesuai zona cabang.
- Tombol di atas daftar peserta kini berketerangan: **Tamu Walk-in** = tamu / orang baru yang belum punya data jemaat dan datang langsung; **Check-in** = menandai hadir dengan scan QR / ketik kode jemaat; **Daftarkan Jemaat** = jemaat yang sudah punya data, didaftarkan oleh admin.
- Tab Peserta (event yang mencatat kehadiran) menampilkan **Berwenang scan check-in**: daftar petugas pelayanan yang diberi izin scan (nama, pelayanan, peran) + tombol Ubah ke tab Pelayanan & Volunteer. Bila belum ada → **peringatan kuning** "Belum ada petugas yang bisa scan check-in" dengan tombol **Atur petugas scan**; sementara itu check-in hanya lewat admin di Portal atau self check-in (bila aktif).
- **Export PDF laporan event** (detail event → Export PDF, atau Laporan Event → pilih event) kini memuat bagian **Visualisasi Daftar & Absen**: grafik pendaftaran harian H-30 (daftar/batal per Jemaat, New Comer, Visitor + kumulatif), absensi per 15 menit (event beberapa hari: maks 3 hari yang ada kehadirannya), proporsi cara absen, komposisi yang hadir, dan ketepatan waktu.
