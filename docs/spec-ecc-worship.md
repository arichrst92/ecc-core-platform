# Spec — ECC Worship (album & lagu di Els App)

Status: diimplementasi 20 Okt 2026 (migration 20261020100000_ecc_worship). Setup server: docs/worship-server-setup.md. Target rilis mobile **2.4.0** (butuh build baru — modul audio native).

## Keputusan
- **Konten:** lagu original ECC, milik ECC sepenuhnya. Di-host di server sendiri (VPS sekarang).
- **Skala:** ±40 lagu; ±1.500 pendengar (25% dari ±6.000 jemaat).
- **Akses:** wajib login (tile disembunyikan untuk tamu). Semua lagu global (semua cabang).
- **Penempatan:** tile **ECC Worship** di Quick Access Home. Tile **hanya tampil bila sudah ada minimal 1 lagu terpublikasi** (album/single published); app mengecek lewat ringkasan ringan (`hasSongs`) yang ikut di-refresh, jadi tile muncul otomatis begitu lagu pertama dipublikasikan — tanpa update app.
- **Kategori:** Album dan **Single**.
- **Data lagu:** judul, file audio, lirik (statis), ciptaan, tahun, + **file karaoke opsional** (musik tanpa vokal, upload terpisah).
- **File audio:** MP3/M4A, **maks 30 MB** per file (standar unggah MP3 192 kbps). Durasi dibaca otomatis. Tanpa transcoding.
- **Cover:** crop **1:1** di portal (geser, zoom, putar, pratinjau di app), disimpan **1000×1000 WebP**. Berlaku untuk album & single.
- **Fitur:** lirik statis + **lirik tersinkron** (opsional per lagu), Disukai (favorit), share, statistik, download offline, mode karaoke.
- **Hitungan putar:** dihitung setelah diputar **≥ 30 detik**. Statistik vokal & karaoke ditampilkan terpisah, total digabung.
- **Share:** halaman publik `eccchurch.global/worship/...` **tanpa lirik dan tanpa audio** — OG image cover, nama album, nama lagu, pencipta, tombol "Dengarkan di Els App".
- **Pengelola:** menu portal **ECC Worship** (menu key `ecc-worship`) diatur via Role Access; fulltimer selalu bisa.

## Mobile (Els App)
- **Beranda ECC Worship:** tab Album · Single · Disukai · Unduhan; Paling sering diputar; cari lagu.
- **Detail album:** Putar, Acak, Karaoke semua; unduh album; share; per lagu: suka, unduh, tambah antrian; badge "Karaoke" bila ada file karaoke.
- **Pemutar layar penuh:** seek, acak, ulang, antrian, lirik; toggle **Vokal / Karaoke** (melanjutkan dari detik yang sama).
- **Mode putar (sumber antrian):**
  - **Semua lagu (lintas album)** — tombol Putar semua / Acak semua di beranda ECC Worship.
  - **Album / Single / Disukai / Unduhan** — Putar / Acak dari halaman tersebut.
  - **Lagu dipilih** — ketuk lagu → mulai dari lagu itu lalu lanjut lagu berikutnya di sumbernya; menu lagu → **Putar lagu ini saja**; mode pilih beberapa lagu → **Putar pilihan** / Tambah ke antrian.
  - **Acak** (on/off) berlaku untuk sumber aktif; **Ulang**: mati / ulang semua / ulang 1 lagu.
  - Pemutar menampilkan sumber aktif ("Memutar dari: Semua lagu · Acak").
- **Mode karaoke:** lirik lagu (dari data lagu) tampil besar, ukuran teks bisa diatur, layar tetap menyala.
- **Lirik tersinkron:** baris aktif menyala & auto-scroll (pemutar + karaoke); ketuk baris → lompat ke detik itu. Lagu yang belum disinkron → lirik statis. Timing sama untuk file karaoke.
- **Kartu "Sedang diputar" di Beranda app** (di atas Quick Access): cover, judul, album, progress, putar/jeda, berikutnya, badge Karaoke bila mode karaoke; ketuk → pemutar layar penuh. **Tampil hanya bila ada lagu aktif** (diputar atau dijeda); **hilang** saat berhenti, antrian selesai, atau ditutup (X). Saat kartu ini terlihat di Beranda, mini-player melayang disembunyikan agar tidak dobel.
- **Mini-player** global di semua halaman; **background playback** + kontrol lock screen/notifikasi.
- **Unduhan offline:** disimpan di dalam app (hanya bisa diputar setelah login); pilih Vokal, Karaoke, atau keduanya; total ukuran + hapus semua.

## Portal
- CRUD album & single (cover crop, publish, urutan), lagu (audio vokal wajib, karaoke opsional — peringatan bila durasi beda > 3 detik).
- Statistik per lagu: putar, suka, unduh (30 hari / total).
- **Sinkronkan lirik:** putar lagu, tekan Spasi/"Tandai" di awal tiap baris → timestamp otomatis; geser ±0,1 dtk, tandai ulang, pratinjau; atau unggah file .lrc. Disimpan sebagai daftar {waktu, baris}; bisa dikerjakan setelah rilis tanpa update app.

- **Sinkron otomatis (AI):** tombol di alat sinkron → audio vokal ditranskripsi dengan timestamp per kata oleh **whisper.cpp self-hosted di VPS yang sama** (audio tidak keluar dari server, tanpa biaya API) → dicocokkan ke lirik yang sudah diketik (urutan baris, toleran salah dengar & reff berulang) → waktu tiap baris terisi otomatis. Baris dengan keyakinan rendah ditandai kuning; hasil tidak menimpa sinkron manual tanpa konfirmasi. Status di portal: Antri → Diproses → Selesai/Gagal.
  - VPS: 2 vCPU (AMD EPYC 9354P), RAM 7,8 GB (±6,9 GB bebas), disk 91 GB bebas, tanpa swap.
  - Antrian **1 lagu per kali**, `nice -n 19`; **siang 1 thread**, **malam (00:00–05:00) 2 thread**. Model default **small** (±1 GB RAM); opsi **"Lebih teliti" (medium, ±2 GB)** diproses di jendela malam.
  - **Progress bar** selama proses: tahap *Antri (posisi #n)* → *Menyiapkan audio* → *Membaca lirik* (persentase dari progress whisper.cpp / detik audio yang sudah diproses) → *Mencocokkan lirik* → *Selesai*; tampil perkiraan sisa waktu (ETA) & mode thread (siang/malam). Progress disimpan di tabel job dan dipantau portal tiap ±3 detik; tampil di alat sinkron dan di daftar lagu (mini progress). Bisa **dibatalkan** selama antri/diproses; tutup halaman tidak menghentikan proses.
  - **Branding di UI: "Elsa"** (Els Agent) — semua teks yang dilihat admin memakai nama Elsa, bukan Whisper: tombol **"Sinkronkan dengan Elsa"**, status *"Elsa sedang mendengarkan lagu…"* / *"Elsa sedang mencocokkan lirik…"*, hasil *"Elsa menyinkronkan 12 baris — 2 perlu dicek"*, label kualitas **"Cepat" / "Teliti"** (bukan small/medium), avatar/ikon Elsa yang sama dengan Elsa chat. Nama Whisper/whisper.cpp hanya di kode, log server, dan dokumen teknis.
  - Tambah **swap 2 GB** sebagai pengaman memori. Butuh `ffmpeg` + binary whisper.cpp + file model di server.
- **Uji Putar (sebelum publikasi):** halaman per lagu yang meniru pemutar app (bingkai HP): putar/seek, toggle Vokal/Karaoke, lirik tersinkron menyala & ketuk baris untuk lompat, mode karaoke layar gelap. Panel **cek otomatis**: durasi vokal vs karaoke, baris lirik belum ditandai, urutan waktu mundur/tumpang tindih, baris terakhir melewati durasi. Tombol **Perbaiki sinkron** membuka alat sinkron di baris yang dipilih. Bisa dipakai untuk lagu **draft**.
- **Pratinjau di HP:** lagu/album draft terlihat di Els App **hanya** untuk akun dengan akses menu `ecc-worship` (berlabel "Draft"), supaya bisa dites di HP sungguhan sebelum dipublikasikan ke jemaat.

## Teknis
- Audio **tidak** di `/uploads` publik. App meminta **URL putar bertanda tangan** (berumur ±6 jam) setelah login; file dikirim **Nginx (X-Accel-Redirect)** dengan dukungan Range (seek).
- Batas upload Nginx untuk endpoint audio dinaikkan (32 MB, khusus `/admin/worship/songs/*/audio/*`).
- Modul audio native: verifikasi `expo-audio` vs `react-native-track-player` (lock screen, antrian, New Architecture RN 0.81).
- iOS: `UIBackgroundModes: audio`; App Review notes: lagu original milik ECC.
- Backup: folder audio & cover perlu dicadangkan terpisah dari backup database.
- Elsapp web: pemutar audio browser (tanpa background/lock screen penuh).
