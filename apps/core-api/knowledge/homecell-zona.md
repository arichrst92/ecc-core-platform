---
id: homecell-zona
title: Homecell & Zona — PIC, Asisten, Pastor Zona, Bergabung, Pertemuan, Absen, Potensial Member & Materi
tags: homecell, cellgroup, zona, area, zone leader, pic homecell, pemimpin, asisten, pastor zona, bergabung homecell, permintaan bergabung, mode tamu, jadwal pertemuan, absen, kehadiran homecell, scan homecell, tamu homecell, keluarkan anggota, alasan keluar, potensial member, radius, laporan homecell, materi homecell, homecell material
summary: Struktur zona → homecell, peran PIC/asisten/pastor zona dan batas haknya, alur bergabung (termasuk dari mode tamu), jadwal & absen pertemuan, keluarkan anggota, potensial member, laporan, dan materi homecell.
---

# Homecell & Zona

## Tempat
- Portal: **Community → Zona** (`/dashboard/homecell-area`), **Homecell** (`/dashboard/homecell`), **Homecell Material** (`/dashboard/homecell-material`), **Map View** (`/dashboard/map`).
- App: Akses Cepat → **Homecell** dan **Zona**; kartu Homecell Anda di Beranda.

## Struktur & peran
- **Zona** (dulu "Area") per cabang. **PIC zona = Zone Leader** (dari Pelayanan Penggembalaan). **Pastor zona** boleh kosong atau lebih dari satu.
- **Homecell** di bawah zona; **PIC homecell = pemimpin**. Kategori Single / Couple / Umum + rentang usia, jadwal (hari & jam), lokasi (link Google Maps).
- PIC zona/homecell harus jemaat di Pelayanan Penggembalaan. Bila ia keluar dari pelayanan, PIC **tidak** otomatis kosong — admin menunjuk ulang.
- **Pastor zona** punya hak yang sama dengan PIC zona di setiap homecell dalam zonanya (kelola jadwal, anggota, laporan, potensial member) — kecuali memproses permintaan bergabung, yang hanya oleh PIC homecell.
- **Asisten homecell** (sejak 2.4.8): ditunjuk PIC (atau PIC/pastor zona) lewat titik tiga di anggota → *Jadikan asisten*; jumlah tidak dibatasi.
  - Asisten **boleh**: buat & ubah jadwal, absen (scan/manual), catat tamu, pengumuman, voting, lampiran.
  - Asisten **tidak boleh**: tambah/keluarkan anggota, hapus jadwal, ubah info homecell, laporan, atau memproses permintaan bergabung.
  - Keluar dari homecell otomatis melepas status asisten.

## Bergabung ke homecell
- Jemaat: Homecell → **Cari homecell terdekat** (izinkan lokasi) atau cari nama/area → detail → **Minta bergabung** (pesan opsional) → tunggu persetujuan.
- **Mode tamu** (tanpa akun): Lanjut sebagai Tamu → Cari homecell → Minta Bergabung → isi nama, WhatsApp, tujuan (belum tahu / ingin bergabung / sekadar berkunjung). Permintaan tampil di bagian *Dari mode tamu*; pemimpin menghubungi lewat WhatsApp.
- **PIC homecell** (di app): banner permintaan → lihat profil, pesan, tujuan → **Terima / Tolak**. Admin dengan Role Access menu **Homecell** (tulis) memproses lewat **Portal** — status Fulltimer saja tidak cukup (sejak 2026-11). PIC zona, pastor zona, dan asisten **tidak** memproses permintaan bergabung di app ("Hanya pemimpin homecell ini yang dapat memproses permintaan bergabung.").
- "Jemaat sudah jadi member homecell ini" → sudah anggota.

## Pertemuan & absen
- **Buat Jadwal** pertemuan; ubah lewat ikon pensil (tanggal, jam, lokasi, catatan) — **juga setelah absen tercatat**, tanpa notifikasi ke anggota; kehadiran yang sudah tercatat tetap.
- Saat bertemu: **Scan kehadiran** (QR kartu jemaat) atau manual. Anggota mendapat notifikasi "kehadiran tercatat".
- Catat **tamu** yang hadir (kategori New Comer / Visitor).
- **Absen hanya saat pertemuan dimulai atau setelahnya** (berlaku sejak 21 Nov 2026 untuk semua versi app): tanggal + jam mulai jadwal, zona waktu cabang; jadwal tanpa jam mulai → terbuka sejak 00.00 hari itu. Berlaku untuk scan QR, input kode manual, Absen Checklist, dan tandai tamu hadir. Tidak bisa lagi mengisi absen sebelum pertemuan / untuk jadwal besok. Menghapus absen yang salah tetap bisa kapan saja.
  - Server menolak dengan pesan *"Absensi dibuka saat pertemuan dimulai (…). Silakan absen saat atau setelah pertemuan dimulai."* (kode ABSEN_BELUM_DIBUKA).
  - **App ≤ 2.5.0**: pesan tampil di Absen Checklist & tandai tamu; di **layar scanner/input manual pesannya tidak terlihat** (scan seolah tidak bereaksi) → tutup scanner, cek jam mulai jadwal, atau coba Absen Checklist untuk melihat alasannya.
  - **Build setelah 2.5.0**: tombol Scan & Absen Checklist disembunyikan sampai jam mulai (muncul otomatis), diganti keterangan "Absensi dibuka saat pertemuan dimulai (…)"; pesan error juga tampil di dalam layar scanner.
  - Jam mulai salah di jadwal? PIC/asisten ubah jadwal (ikon pensil) — absen langsung mengikuti jam baru.

## Keluarkan anggota
- Titik tiga → **Keluarkan dari homecell** → pilih alasan (salah invite, sudah tidak aktif, pindah homecell, pindah kota, atau alasan lain). Anggota pindah ke daftar nonaktif (tanpa notifikasi); alasan tersimpan di riwayat (Portal). Bisa ditambahkan kembali kapan saja.
- Hanya PIC homecell, PIC/pastor zona, atau admin yang bisa mengeluarkan.

## Potensial member
- Detail homecell → **Potensial member**: jemaat aktif yang **belum ikut homecell mana pun** dan rumahnya (perkiraan dari alamat) dalam radius (0,5–50 km, default 3 km). Untuk PIC, PIC zona, pastor zona.
- No HP & usia mengikuti privasi tiap jemaat; alamat tidak ditampilkan.
- Di Portal: Map View → pin homecell → **Cari Potensial Member** / **Cek Lokasi Member** (butuh akses menu Jemaat; maks 300 orang terdekat).
- Alamat yang tidak dikenali tidak muncul di peta — perbaiki alamat jemaat (Map View → Lihat daftar).

## Zona di app
- Semua jemaat melihat zona homecell-nya (Zone leader, Pastor, daftar homecell). PIC & pastor melihat semua zona yang dilayani dengan badge rata-rata kehadiran; PIC zona bisa **Ubah info zona** ("Hanya PIC zona ini yang dapat mengubahnya."); PIC & pastor bisa membuka **Laporan zona**.
- 2.4.9: Beranda pemimpin menampilkan carousel homecell yang dipimpin + zona (ringkasan anggota, bertemu 7 hari, perlu perhatian).

## Materi homecell (2.5.0)
- Admin unggah file materi di Portal → **Homecell Material**: judul, keterangan, file, **berlaku mulai/sampai**, cabang tujuan, **Publish**, dan opsi **beri tahu pemimpin** (notifikasi HOMECELL_MATERIAL).
- Yang melihat di app: **Pastor zona, Zone Leader, PIC & Asisten homecell** di cabang tujuan, selama materi dipublish dan masih berlaku.
- Di app 2.5.0: kartu homecell di Beranda punya baris **"Materi minggu ini"** (jumlah file, judul, penanda baru); kartu zona punya baris **"Materi homecell"** menuju daftar semua materi (bagian *Minggu ini* & *Sebelumnya*, penanda Baru/sudah dibuka). File (PDF/PowerPoint/Word) dibuka di browser bawaan lalu bisa disimpan/dibagikan. Ketuk notifikasi materi baru → layar Materi homecell. Unduhan tercatat.
- App 2.4.9 tetap menerima notifikasi materi, tetapi belum punya layar materinya.
- Role Access menu **Homecell Material** perlu diatur untuk admin yang mengunggah.
- Materi tidak muncul → cek isPublished, tanggal berlaku, cabang tujuan, dan apakah orangnya memang pemimpin/asisten. Fitur ini butuh app 2.5.0.

## Lokasi homecell (titik peta)
- Titik diambil dari **Lokasi (link Google Maps)** saat disimpan (Portal → Homecell → Edit, atau PIC di app). Dipakai Map View & "Homecell terdekat".
- Portal → Homecell menampilkan kolom **Lokasi**, banner jumlah yang bermasalah, filter **Lokasi**, dan kotak penjelasan di detail homecell.
- Masalah yang dikenali: **Titik di laut (bawaan Google)** — link terbaca pusat peta bawaan; **Tanda minus hilang** — koordinat tanpa minus (mis. 6.89 untuk Bandung) sehingga pin di laut utara; **Jauh dari cabang** (>150 km) — link salah atau zona/cabang salah; **Link tidak terbaca**; **Belum ada lokasi**.
- Sejak 2026-11 saat menyimpan: titik bawaan Google ditolak dengan pesan jelas, dan tanda minus yang hilang dibetulkan otomatis.
- Perbaikan: ganti link dengan link *Bagikan* dari titik lokasi pertemuan, atau tempel koordinat (mis. -6.2088, 106.8456).

## Laporan & Portal
- Portal Zona: saring cabang/pastor/periode, Export PDF/CSV. Detail homecell: anggota (aktif/nonaktif + alasan), jadwal, kehadiran.
- Anggota keluar = toggle nonaktif (bukan hapus) agar riwayat tetap.

## Kasus umum
- **"Menu Kelola tidak muncul"** → orangnya bukan PIC/asisten/pastor zona homecell itu.
- **"Asisten tidak bisa keluarkan anggota"** → memang tidak diizinkan; PIC yang melakukan.
- **"Permintaan bergabung tidak bisa diproses"** → hanya PIC homecell itu (app) atau pemegang Role Access Homecell tulis (Portal); cek bagian *Dari mode tamu* untuk permintaan dari tamu.

## Diagnosis (untuk Elsa)
`homecell_area` (+ `homecell_area_pastor`) → `homecell` (picJemaat, area) → `homecell_member` (isActive, peran asisten) → `homecell_schedule` → `homecell_attendance` → `homecell_join_request` / `homecell_guest_request` / `homecell_tamu` → `homecell_material`.

## Hak admin homecell (2026-11)
- Tidak ada lagi jalan pintas **Fulltimer**. Mengelola homecell mana pun (jadwal, absen, tamu, hapus jadwal, laporan zona, ubah zona) hanya untuk **PIC / PIC zona / pastor zona / asisten** homecell itu, atau pemegang **Role Access menu Homecell** (tulis; baca untuk materi & laporan).
- App lama (≤ 2.5.0) masih menampilkan tombol kelola untuk Fulltimer; server menolak dengan pesan "Hanya pemimpin homecell ini…". Solusi: beri Role Access Homecell atau jadikan PIC/asisten.
