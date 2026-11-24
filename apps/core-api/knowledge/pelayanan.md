---
id: pelayanan
title: Pelayanan (Ministry) — Anggota, Permintaan Bergabung, Koordinator, Jadwal Petugas & Tugas
tags: pelayanan, ministry, volunteer, anggota pelayanan, peran, role pelayanan, gabung, permintaan bergabung, join request, koordinator, otoritas approval, pendaftaran per cabang, buka pendaftaran, tutup pendaftaran, atur jadwal, petugas, susunan tetap, khusus tanggal, jadwal pelayanan saya, bisa scan, kategori tugas, tugas, bagian, ikon pelayanan
summary: Struktur pelayanan & peran, alur jemaat bergabung, siapa koordinator (otoritas approval per cabang), buka/tutup pendaftaran, atur jadwal petugas (app & Portal), Kategori → Tugas petugas, dan Jadwal Pelayanan Saya.
---

# Pelayanan (Ministry)

## Tempat
- Portal: **Service → Pelayanan** (`/dashboard/pelayanan`), detail anggota `/dashboard/pelayanan/<id>`, **Permintaan Volunteer** (`/dashboard/pelayanan/join-requests`), master peran di **Role Pelayanan**.
- App: Akses Cepat → **Ministry** → daftar pelayanan → detail (tab Anggota / Jadwal / Tentang). Koordinator punya aksi cepat **Atur jadwal, Permintaan, Pendaftaran, Chat koordinator**.

## Struktur
- Pelayanan punya **peran** (mis. Worship Leader, Vocal; `level` lebih tinggi = lebih senior), **ikon & warna** (dipilih di Portal; tampil di app & Portal), deskripsi (baris pertama = tagline app).
- Satu jemaat hanya **satu keanggotaan aktif per pelayanan**. Keluarkan anggota = riwayat tetap ada.
- Portal detail pelayanan: cari & saring anggota (cabang, peran), ubah peran, keluarkan, **Tambah Anggota** (cari nama, kode, no HP).

## Koordinator = pemegang otoritas approval
- Portal → detail pelayanan → ikon **perisai** di baris anggota → **Otoritas approval** → centang cabang. Anggota itu menjadi **koordinator** untuk jemaat dari cabang tsb.
- Hanya pemegang otoritas yang bisa: menyetujui/menolak permintaan bergabung dari cabangnya, membuka/menutup pendaftaran cabangnya, dan **mengatur jadwal petugas** dari app. Leader tanpa otoritas **tidak** bisa menyetujui (berlaku juga di app lama).
- **Fulltimer/admin**: bebas, tetapi hanya lewat **Portal**.
- Otoritas dicabut otomatis saat anggota dikeluarkan.
- Pesan terkait: "Hanya anggota yang diberi otoritas approval yang dapat mengelola permintaan bergabung.", "Anda tidak punya otoritas approval untuk cabang pemohon ini.", "Hanya anggota dengan otoritas yang dapat mengatur jadwal pelayanan.", "Anda tidak punya otoritas di cabang ini."

## Jemaat bergabung
1. App → pelayanan → kartu "Ingin melayani di sini?" → **Gabung Ministry Ini** → pilih peran → motivasi (opsional) → Kirim.
2. Status **Menunggu Persetujuan Koordinator** (bisa dibatalkan). Koordinator cabang pemohon mendapat notifikasi.
3. Disetujui (koordinator menetapkan peran) → jadi anggota + notifikasi. Ditolak → alasan ditampilkan; boleh mengajukan lagi.
- Patokan cabang = **cabang jemaat yang mendaftar**.
- Pesan: "Permintaan Anda masih menunggu persetujuan", "Jemaat ini sudah menjadi anggota aktif.", "Permintaan ini sudah diproses."

## Pendaftaran per cabang (buka/tutup)
- Status per cabang: **Belum dibuka** (bawaan; di data tertulis MENERIMA / tidak ada baris — namanya dipertahankan untuk app lama, artinya tetap *belum dibuka*), **Buka pendaftaran** (dengan catatan & tutup otomatis tanpa batas/7/14/30 hari atau tanggal), **Tutup**.
- Hanya cabang berstatus **Buka pendaftaran** yang menampilkan tombol **Gabung** di app. Selain itu tombol diganti keterangan "Pendaftaran di {cabang} sedang ditutup" dan request baru ditolak.
- Diatur di Portal (detail pelayanan → **Pendaftaran per cabang**) atau oleh koordinator di app (aksi **Pendaftaran**). Tanpa notifikasi ke jemaat — mereka melihat badge "Buka pendaftaran".

## Mengatur jadwal petugas
**Di Portal** (admin): detail ibadah → Pelayanan yang Melayani → Tambah Petugas (Default tiap minggu / Khusus tanggal), atau detail event → Pelayanan & volunteer.
**Di app** (koordinator): pelayanan → **Atur jadwal** → pilih cabang (bila otoritas >1) → daftar ibadah yang memakai pelayanan ini + event cabang, **8 minggu** ke depan.
- Kartu kuning = **Belum ada petugas**.
- Ibadah: pilih **Tanggal ini saja** (susunan khusus) atau **Setiap jadwal** (susunan tetap). **Kembalikan ke susunan tetap** menghapus susunan khusus tanggal itu.
- **Tambah petugas** → cari anggota; tampil **Tersedia / Bertugas (bentrok di tanggal yang sama)** dan jumlah tugas bulan ini. Chip **Semua cabang** untuk memilih dari cabang lain.
- Ketuk peran untuk mengganti, chip **scan** untuk memberi/mencabut hak scan kehadiran, × untuk menghapus → **Simpan jadwal**.
- Hasilnya sama dengan petugas yang diatur di Portal. Petugas mendapat notifikasi (dijadwalkan / tidak lagi dijadwalkan) dan melihatnya di **Jadwal Pelayanan Saya**. Pengatur tidak menotifikasi dirinya sendiri.
- Susunan khusus tanggal **menggantikan** susunan tetap untuk tanggal itu (bukan menambah).
- "Petugas harus anggota aktif pelayanan ini." → tambahkan dulu sebagai anggota.

## Kategori → Tugas petugas (2.5.0)
Menandai **bagian** tiap petugas (mis. Sound › Mixer, Multimedia › Kamera 1).
- **Daftar pilihan** per pelayanan dikelola **hanya di Portal**: detail pelayanan → panel **Kategori & tugas petugas**. Bisa tambah, **edit nama langsung** (klik nama), **atur urutan** (▲▼), **pindah tugas ke kategori lain** ("Pindah ke…"), **pilih ikon kategori**, nonaktifkan & aktifkan lagi. App tidak bisa mengubah daftar ini (server menolak).
- Nonaktif = tidak bisa dipilih untuk jadwal baru, tapi jadwal lama tetap menampilkannya. Ganti nama/pindah kategori langsung tercermin di jadwal yang sudah tersimpan.
- **Memilih tugas**: koordinator di app (Atur jadwal → baris petugas → "Atur tugas ▾": langkah 1 kategori, langkah 2 tugas) atau admin di Portal (baris petugas → "+ Atur tugas"). Boleh **lebih dari satu**, **kategori saja**, atau **kosong**.
- Tombol tugas hanya muncul bila pelayanan sudah punya kategori.
- Siapa yang melihat: petugas sendiri (kotak "Tugas Anda" di Jadwal Pelayanan Saya & Beranda), rekan di jadwal yang sama, koordinator & Portal.
- **Kartu Tim Pelayanan di detail ibadah/event (app 2.5.0)**: tugas tampil di bawah peran (ikon papan klip) **hanya** bagi petugas pelayanan itu di jadwal tsb (dirinya ditandai "(Anda)") dan koordinator pelayanan itu untuk cabang ibadah/event. Jemaat lain — termasuk Fulltimer yang bukan petugas/koordinator — hanya melihat peran. Ibadah memakai susunan tanggal yang dibuka (?tanggal).
- **2026-11**: pelayanan tempat petugas bertugas kini tampil **paling atas** di kartu Tim Pelayanan dan dirinya paling depan (dulu bisa tersembunyi di balik "Lihat semua" pada tim besar) — berlaku juga app 2.5.0. **App 2.5.1**: kartu **"Anda bertugas di sini"** di atas Tiket Saya (detail ibadah & event) berisi pelayanan, peran, dan tugas; bila koordinator belum memilih tugas tertulis "Tugas belum diatur koordinator."
- Notifikasi in-app: petugas baru dijadwalkan → tugas ikut disebut; tugas diubah → "Tugas pelayanan … diperbarui".
- App lama (<2.5.0) tidak mengirim tugas → tugas yang ada tetap dipertahankan saat app lama menyimpan jadwal.

## Jadwal Pelayanan Saya (petugas)
- Profil → **Jadwal Pelayanan Saya** (atau kartu Tugas berikutnya di halaman Pelayanan). Tab Mendatang & Riwayat.
- Isi: ibadah/event, peran, pelayanan, jam (zona cabang), lokasi, rekan bertugas (+ tugasnya), **Bertugas scan kehadiran** bila punya hak scan, catatan.
- Sumber: jadwal roster leader dan petugas tetap ibadah (label "Petugas tetap") — tanggal yang ditiadakan tidak tampil.

## Kasus umum
- **"Tombol Gabung tidak ada"** → pendaftaran cabang jemaat belum dibuka/ditutup, atau ia sudah anggota/permintaannya menunggu.
- **"Koordinator tidak bisa approve / tidak melihat Atur jadwal"** → belum diberi Otoritas approval untuk cabang itu (Portal → perisai).
- **"Petugas tidak dapat notifikasi jadwal"** → notifikasi tidak dikirim ke pengatur sendiri; cek juga apakah ia benar ada di susunan tanggal itu (khusus tanggal vs tetap).
- **"Petugas tidak bisa scan"** → beri chip scan / "Bisa Scan" di jadwal ibadah/event itu (lihat *checkin-scan*).
- **"Pilihan tugas tidak muncul"** → isi Kategori & tugas di Portal dulu; app harus versi 2.5.0+.

## Diagnosis (untuk Elsa)
`pelayanan` → `jemaat_pelayanan` (anggota & peran) → `pelayanan_approver` (koordinator per cabang) → `pelayanan_pendaftaran` (status cabang) → `ibadah_pelayanan` + `ibadah_pelayanan_petugas` (tanggalIbadah null = tetap; tugas; canScanAttendance) / `event_pelayanan` + `event_pelayanan_petugas` → `pelayanan_tugas_kategori` + `pelayanan_tugas`.
