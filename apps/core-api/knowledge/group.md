---
id: group
title: Group — Publik/Private, Bergabung, PIC, Anggota, Parent Group, QR
tags: group, grup, komunitas, publik, private, gabung group, permintaan bergabung group, kode undangan, qr group, pic group, anggota group, daftar anggota tersembunyi, parent group, sub group, pengumuman group, polling, voting, file group, bubarkan group, dismiss
summary: Jenis group, siapa yang melihat group private, alur bergabung (selalu disetujui PIC), siapa yang melihat daftar anggota, parent group di Portal, QR/kode undangan, pengumuman & polling.
---

# Group

## Tempat
- Portal: **Community → Group** (`/dashboard/group`, kartu 16:9), detail `/dashboard/group/<id>`.
- App: Profil → **Cari Group** / **Group Saya**, atau scan QR group.

## Dasar
- Group = komunitas di luar homecell (profesi, hobi, pelayanan, keluarga). Jenis: Homecell Style, Family, Ministry, Community, System, Lainnya.
- **Publik**: terlihat semua jemaat. **Private**: hanya terlihat oleh anggota, PIC, dan (di Portal) pemegang Role Access menu Group.
- Setiap group (publik & private) punya **kode/QR** untuk dibuka lewat scan di app; kode dibuat otomatis saat PIC/admin membuka group lama. Kode hanya terlihat oleh PIC/admin.
- Gambar group diunggah dengan crop 16:9.

## Membuat group = pengajuan (2026-11)
- Group yang dibuat jemaat dari **Els App** (siapa pun, termasuk Fulltimer) berstatus **Menunggu persetujuan**. Pembuat otomatis jadi PIC.
- Selama menunggu: group **tidak tampil** untuk jemaat lain, **belum bisa menerima anggota** (gabung / kode / QR / tambah anggota ditolak dengan pesan "masih menunggu persetujuan admin"). Pembuat masih bisa melihat & mengubah datanya, atau membatalkan pengajuan.
- Disetujui/ditolak oleh pemegang Role Access menu **Group (tulis)** di Portal: menu **Community → Pengajuan Group** (badge jumlah) → buka group → **Setujui** / **Tolak** (alasan wajib). Pembuat mendapat notifikasi; ditolak → group nonaktif, alasan ikut di notifikasi.
- Group yang dibuat admin Group langsung dari Portal langsung aktif.
- App 2.5.0 belum mengenal status ini: setelah membuat group masih tertulis "berhasil dibuat", tetapi group tetap menunggu persetujuan (orang lain belum bisa bergabung). App 2.5.1 menampilkan "Pengajuan terkirim" + label "Menunggu persetujuan".

## Bergabung
- Jemaat bergabung (dari group publik atau lewat kode undangan) → menjadi **permintaan** yang harus **disetujui PIC** (atau admin). PIC mendapat notifikasi.
- **Di app, permintaan diproses oleh PIC**; pemegang Role Access menu **Group** (tulis) memproses lewat **Portal**.
- PIC & admin yang bergabung ke group sendiri langsung menjadi anggota.
- PIC juga bisa menambah anggota langsung (pilih jemaat / kode jemaat). Anggota mendapat notifikasi ditambahkan/dikeluarkan.

## Siapa yang melihat daftar anggota
- **App**: hanya **anggota aktif** dan **PIC** group itu. Orang lain — termasuk Fulltimer yang bukan anggota — hanya melihat **jumlah anggota** dan keterangan "daftar anggota hanya untuk anggota".
- **Portal**: anggota, PIC, dan pemegang akses menu Group. Status Fulltimer saja **tidak** memberi akses (sejak 2026-11).
- No HP anggota mengikuti pengaturan privasi masing-masing.

## Parent group (hierarki)
- Group bisa berada di bawah group lain (nested). Atur di Portal → form Group → **Parent Group (opsional)**: ketik minimal 2 huruf untuk mencari (hasil "Nama · Cabang"); group tidak bisa menjadi parent dirinya sendiri. × untuk melepas.
- Daftar Group Portal menampilkan nama parent di bawah nama group ("↳ Nama parent").
- Detail group menampilkan parent & sub-group (children).

## Isi group
- Jadwal, lokasi, PIC, deskripsi, **pengumuman** (bisa disematkan), **polling/voting**, **file/lampiran**.
- **Bubarkan group** (dismiss) oleh PIC/admin → nonaktif + semua anggota dinotifikasi.

## Kasus umum
- **"Non-anggota masih melihat anggota"** → pastikan server sudah versi terbaru; tarik layar untuk muat ulang. Di Portal, admin memang bisa melihat.
- **"Group private tidak ketemu di pencarian"** → private hanya terlihat anggota/PIC/pemegang Role Access Group (Portal); bagikan kode/QR.
- **"Sudah minta gabung tapi belum masuk"** → menunggu persetujuan PIC.
- **"Group yang saya buat tidak muncul untuk teman / tidak bisa diundang"** → pengajuan group belum disetujui admin (Portal → Community → Pengajuan Group).
- **"Parent group tidak ada di pilihan"** → gunakan pencarian (bukan dropdown); group nonaktif tidak muncul.

## Diagnosis (untuk Elsa)
`group` (approvalStatus PENDING/APPROVED/REJECTED + approvalNote, isPublic, isActive, picJemaat, parent) → `group_member` (isActive) → `group_join_request` (status) → `group_announcement` / `group_poll`.

## Hak admin group (2026-11)
- Kelola group (edit, gambar, anggota, konten, permintaan) = **PIC** group itu, atau di **Portal** pemegang Role Access menu **Group** (tulis). Fulltimer tidak lagi otomatis bisa.
- Di app hanya PIC yang mengelola; app lama (≤ 2.5.0) mungkin masih menampilkan tombol edit/gabung langsung untuk Fulltimer — server menolak / menjadikannya permintaan.
