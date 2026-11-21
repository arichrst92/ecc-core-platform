---
id: jemaat-keluarga
title: Jemaat, Keluarga, Tamu, Privasi, Spiritual Journey & Role
tags: jemaat, data jemaat, profil, edit profil, validasi, kode jemaat, kartu qr, keluarga, relasi, tambah keluarga, dependen, anak, pasangan, tamu, tamu saya, new comer, visitor, follow-up, privasi, unduh data, duplikat, junk, shiftsoft, sync, foto, role, sub role, spiritual journey, tahap, sertifikat, onboarding, alamat, peta
summary: Data jemaat & validasi isian, kartu QR, keluarga & relasi otomatis, tamu & kategorinya, privasi data, duplikat/junk/Shiftsoft di Portal, role & Spiritual Journey (request dari app).
---

# Jemaat, Keluarga, Tamu & Privasi

## Data jemaat (Portal → People → Jemaat)
- Saring: cabang, homecell, zona, ministry, status, jenis kelamin, role, umur. Cari nama/email/no HP. Export CSV/PDF mengikuti saringan.
- Setiap jemaat punya **kode 8 karakter** + **kartu QR** (identitas untuk check-in, visit, CKids).
- Detail: QR, kontak WhatsApp/Email, riwayat homecell/event/ibadah/group/visit/local market, indikator keaktifan 3 bulan, Export PDF, foto (crop), **kode masuk sementara**.
- Ubah/buat/impor/ganti foto butuh akses menu **Jemaat tulis**; hapus butuh **hapus**.
- **Sumber data**: badge "Shiftsoft" (impor/sync) atau "Keluarga" (didaftarkan anggota keluarga).
- **Potensial junk** (badge kuning "Perlu dicek"): nama janggal/data uji, pola akun sistem, no HP/email tidak valid, tanggal tidak wajar, data kosong, tidak aktif >6 bulan, onboarding tidak selesai >30 hari, data Shiftsoft tanpa aktivitas. Tidak ada yang dihapus otomatis — pilih "Bukan junk" atau nonaktifkan.
- **Sync Shiftsoft** tidak menimpa jemaat yang sudah onboarding di app, pernah diubah admin, atau ditandai "Bukan junk" (hanya mengisi kolom kosong); jemaat nonaktif dilewati.
- **Cek Duplikat**: kandidat akun ganda (no HP/email/nama+tanggal lahir sama).
- Import CSV: template → Dry Run → Commit.

## Edit profil & validasi (app)
- Nama hanya huruf, spasi, titik, koma, apostrof, tanda hubung (tanpa angka/simbol). Alamat/catatan harus bermakna. Tanggal lahir tidak di masa depan.
- Pekerjaan & status pernikahan dipilih dari daftar ("Pilih pekerjaan dari daftar yang tersedia."). Belum Bekerja / IRT / Pensiunan → nama kantor disembunyikan. Single → tanggal pernikahan disembunyikan; status lain: tanggal wajar terhadap tanggal lahir.
- Isian lama yang tidak diubah tidak dicek ulang.

## Keluarga
- App: Akses Cepat → **Keluarga** → *Tambah anggota*: **Scan QR Kartu Jemaat**, **Cari jemaat** (nama ≥3 huruf, atau email/no HP lengkap), atau **Daftarkan Baru** (untuk anak/lansia tanpa HP — menjadi *dependen*).
- Pilih hubungan (pasangan, anak, orang tua, saudara, dll.). **Menambah anak otomatis menghubungkan pasangan** sebagai ayah/ibu; menambah pasangan otomatis menghubungkan anak-anaknya.
- Anggota keluarga bisa dipilih saat reservasi ibadah & daftar event. Target relasi mendapat notifikasi FAMILY_LINKED.
- Portal: detail jemaat → Relasi Keluarga (relasi satu arah; master tipe di **Relasi Jemaat**).
- "Hanya bisa mendaftarkan diri sendiri dan anggota keluarga." → orang itu belum terhubung sebagai keluarga.

## Tamu
- Tamu = orang yang belum menjadi jemaat (jemaat dengan isTamu). Dicatat dari: **Tamu Saya**, walk-in usher, homecell, visit dengan tamu, mode tamu → minta bergabung homecell.
- **Kategori**: **New Comer** (berpotensi berjemaat) atau **Visitor** (berkunjung; bawaan). Diubah admin di Portal → **Tamu**.
- Tamu Saya (app): status Diundang → Hadir → Bergabung + petugas follow-up. Tamu bisa dipilih saat reservasi/event seperti keluarga.
- Portal → Tamu: atur status & **petugas follow-up** (badge = tamu tanpa petugas). Laporan memecah tamu per kategori.

## Privasi
- App: Pengaturan → **Privasi**: tiap data (no HP, ulang tahun, alamat, daftar keluarga, pekerjaan, status pernikahan) dicentang siapa yang boleh melihat — Keluarga, Homecell, Group, Pelayanan, Satu cabang, Semua. Tanpa centang = **hanya saya**. Akun baru bawaan "hanya saya".
- **Unduh data saya** (PDF). **Pesan WhatsApp**: matikan pengingat/ucapan/info (OTP tetap dikirim).
- Privasi memengaruhi tampilan no HP/usia di potensial member, anggota group, kalender ulang tahun, dll.
- Data pribadi yang **tidak terlihat di Portal maupun Elsa**: Catatan saya (catatan khotbah), jurnal Bible 365, isi doa & kesaksian, nama pengirim ulasan anonim.

## Role & akses
- Portal → **Role Jemaat**: role → sub role → status (mis. Fulltimer › Pastoral › Pemimpin Cabang). Assign di detail jemaat → Role.
- Role **Fulltimer** otomatis bisa masuk Portal; role lain diatur di **Role Access** (menu read/write/delete per role/sub role).

## Spiritual Journey
- Tahap (mis. Encounter → Empower → Engage → Expand). Terisi otomatis dari role/kelas/event terkait, atau lewat **request dari app**: jemaat *Ajukan update tahap* + catatan (satu request menunggu per jemaat, bisa dibatalkan).
- Portal → Spiritual Journey → **Request dari App** (badge): Setujui → tahap diminta + tahap sebelumnya yang belum tercatat diberikan (role/sub role/status), jemaat dinotifikasi; Tolak → alasan dikirim. Saring per cabang.
- **Bertahap**: mencapai tahap N = tahap 1..N-1 dianggap tercapai (tahap ECC memakai role/sub-role sama dengan status berbeda, jadi status tahap awal tertimpa). Jumlah & daftar jemaat per tahap di Portal = jemaat yang tahap **saat ini**-nya tahap itu (tahap tertinggi).
- Hapus jemaat dari tahap: klik jumlah jemaat di tahap → tempat sampah (butuh akses hapus menu Spiritual Journey).

## Alamat & peta
- Alamat dipetakan otomatis (±1.000 alamat/15 menit). Map View → *Lihat daftar* untuk alamat tidak dikenali / terlalu umum; alamat yang diperbaiki dipetakan ulang.

## Diagnosis (untuk Elsa)
`jemaat` (isActive, isTamu, tamuKategori, cabang, tanggalLahir) → `jemaat_relasi` (+ `tipe_relasi`) → `jemaat_tamu` → `jemaat_role` → `spiritual_journey_request` / `spiritual_journey_step` → `jemaat_geocode`.
