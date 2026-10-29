# Spec — Prayer Request (Doa) & Resolusi Tahunan + Re-layout Quick Access

Status: diimplementasi 18 Okt 2026 (migration 20261018120000_prayer_request_resolusi). Target rilis mobile 2.4.0 (butuh build baru, bukan OTA).

## 1. Prayer Request ("Doa")

### Alur
1. Jemaat membuat request (app): kategori, didoakan untuk, nama (opsional), isi, anonim.
2. Masuk ke portal → menu **Prayer Request** (filter cabang/status/kategori/petugas).
3. Admin assign ke 1 petugas (minister/pastoral).
4. Petugas tandai **Sudah Didoakan** + catatan opsional → catatan **ditampilkan ke jemaat**.
5. Jemaat tandai **Sudah Mendapat Jawaban Doa** + kesaksian opsional (bisa dibatalkan).
6. Jemaat bisa **mengedit** request (selama status masih BARU/DITUGASKAN) dan **menghapus** (soft delete).

### Status
`BARU → DITUGASKAN → SUDAH_DIDOAKAN → TERJAWAB` (TERJAWAB bisa ditandai jemaat kapan saja).

### Keputusan
- Role petugas yang bisa di-assign: **diatur di Konfigurasi** (Role/SubRole).
- Petugas bekerja di **portal dan app** (tab "Ditugaskan ke Saya" di layar Doa).
- Kerahasiaan: **untuk sekarang semua user portal** bisa lihat (pembagian akses menyusul).
- **Anonim**: nama disembunyikan dari petugas, tetap terlihat oleh admin.
- Notifikasi: **in-app + WhatsApp** (ke petugas saat di-assign; ke jemaat saat sudah didoakan).
- **Didoakan untuk**: Diri sendiri / Keluarga (pilih dari data keluarga atau ketik) / Orang lain (+ nama).
- Tamu (guest mode): **tidak** punya akses (tile disembunyikan).

### Kategori doa (kode → id / en)
HEALTH Kesehatan / Health · FAMILY Keluarga / Family · WORK Pekerjaan / Work · FINANCE Keuangan / Finances · STUDY Studi / Studies · RELATIONSHIP Pernikahan & Hubungan / Marriage & Relationships · RESTORATION Pemulihan / Restoration · THANKSGIVING Ucapan Syukur / Thanksgiving · OTHER Lainnya / Other

## 2. Resolusi Tahunan

- Jemaat menambah/mengubah/menghapus item resolusi per tahun, kapan saja (tahun lalu **tetap bisa diedit**).
- Tiap item bisa ditandai **Done**; progress per tahun (mis. 2/5).
- Portal: section **Resolusi Tahunan** di detail jemaat, **read-only**, pilih tahun.
- Akses portal: **semua user** (pembagian akses menyusul).
- Pengingat: **nanti**.

### Kategori resolusi (kode → id / en)
SPIRITUAL Rohani / Spiritual · FAMILY Keluarga / Family · HEALTH Kesehatan / Health · CAREER Karier / Career · FINANCE Keuangan / Finances · MINISTRY Pelayanan / Ministry · PERSONAL_GROWTH Pengembangan Diri / Personal Growth · OTHER Lainnya / Other

## 3. Mobile GUI

### Home — Quick Access (grid 4 kolom)
Urutan:
1. Ibadah, Event, Beri, Berita
2. Renungan, Alkitab, **Doa**, **Resolusi**
3. Keluarga, **Tamu** (→ Tamu Saya), **Group** (→ Group Saya), Homecell
4. Ministry, (Area — PIC area saja), Visit, Local Market

- **Tanpa placeholder**: jumlah kolom mengikuti lebar layar (min 4, tile ±84px); layar lebar (tablet/web) menampilkan lebih banyak tile per baris, baris terakhir dibiarkan apa adanya.
- Tile **Doa** membawa badge jumlah "belum didoakan" untuk petugas doa.
- **Scanner** keluar dari grid → ikon di header Home, kiri ikon QR (hanya petugas scanner).
- **Kalender** keluar dari grid → ikon di header **Profil**, kiri ikon Notif.
- Menu Tamu Saya, Group Saya, Jelajahi Group **tetap ada** di Profil.

### Layar
- **Doa**: jemaat biasa → langsung "Doa Saya" (tab Aktif / Terjawab). Petugas → tab "Doa Saya" | "Ditugaskan ke Saya (n)".
- Form request (chip kategori, chip didoakan untuk, isi, toggle anonim); detail dengan timeline status, catatan petugas, tombol "Tandai doa terjawab", edit, hapus.
- **Resolusi**: chip tahun, progress bar, list checkbox + chip kategori, bottom sheet tambah/ubah/hapus.
- Profil → menu **Prayer Request Saya** & **Resolusi Tahunan** juga tersedia.

## 4. Portal
- Menu **People → Prayer Request** (`/dashboard/prayer-request`, menu key `prayer-request`; migration memberi akses baca ke semua role portal, tulis/hapus diatur di Role Access).
- Tab status + filter kategori/cabang/petugas/cari; panel detail: timeline, assign petugas (cari, filter cabang, beban tugas aktif), catatan + tandai sudah didoakan, hapus.
- Tombol **Konfigurasi Petugas**: daftar Role / Sub Role petugas doa.
- Detail jemaat → section **Resolusi Tahunan** (read-only, pilih tahun).
- WA template `PRAYER_ASSIGNED` & `PRAYER_PRAYED` (kategori DOA) bisa diedit di WhatsApp Notif Config.

## 5. API
- Mobile: `/admin/me/prayer` (+ `/summary`, `/assigned`), `/admin/me/resolusi`.
- Portal: `/admin/prayer-request` (+ `/config`, `/petugas-options`, `/:id/assign`, `/:id/prayed`), `/admin/jemaat/:id/resolusi`.
