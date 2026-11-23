---
id: doa-konten-notifikasi
title: Prayer Request, Kritik & Saran, Konten (Berita/Renungan/Worship), Pengumuman & Notifikasi
tags: doa, prayer request, petugas doa, tugas doa, anonim, kritik, saran, feedback, berita, news, renungan, worship, lagu, album, alkitab, bible 365, catatan saya, catatan khotbah, announcement, pengumuman, notifikasi, notif, whatsapp, wa, template, saluran notifikasi, email notifikasi, pengingat, reminder, ulang tahun
summary: Alur prayer request & petugas doa, kritik & saran, konten broadcast (berita, renungan, worship), pengumuman, serta notifikasi in-app/WhatsApp/email dan cara mengaturnya.
---

# Prayer Request, Kritik & Saran, Konten & Notifikasi

## Prayer Request
- Jemaat (app): Akses Cepat → **Doa** → + → kategori, untuk siapa (diri/keluarga/orang lain), pokok doa → opsi **anonim** (nama hanya terlihat admin, tidak oleh petugas doa) → Kirim. Status: Menunggu → Sudah didoakan (+ catatan tim) → bisa ditandai **terjawab** + kesaksian.
- **Doa terjawab (2.5.1)**: tombol **Bagikan** membuat kartu gambar kesaksian + ayat & tautan ayatnya (isi doa tidak ikut), plus ajakan "Ingin memberikan sesuatu yang berarti untuk Tuhan dari jawaban doa ini?" → halaman **Beri**.
- Portal → **People → Prayer Request**:
  1. **Konfigurasi Petugas**: tentukan siapa petugas doa — berdasarkan **Role** (+ sub role) dan/atau **Ministry** (+ peran tertentu / semua anggota aktif).
  2. **Tugaskan** doa ke petugas → petugas mendapat notifikasi in-app + WhatsApp; tab **Ditugaskan ke Saya** muncul di app mereka.
- Petugas doa (app): Doa → Ditugaskan ke Saya → baca → catatan untuk jemaat (opsional) → **Tandai sudah didoakan** → jemaat mendapat kabar.
- Siapa yang membaca isi doa: petugas yang ditugaskan & pengirim. **Elsa tidak bisa membaca isi doa/kesaksian.**
- Badge Portal = prayer request baru.

## Kritik & Saran
- App: Profil → **Kirim Kritik & Saran** → jenis (Saran/Kritik), topik (Aplikasi, Ibadah, Pelayanan, Event, Homecell, Lainnya) → pesan. Nama & no HP terlihat tim.
- Portal → **People → Kritik & Saran**: balas → jemaat menerima notifikasi & balasan di percakapan yang sama.

## Konten broadcast
- Portal → **Broadcast → News / Renungan**: judul, ringkasan, isi (editor dengan toolbar Tebal · Miring · Judul · Daftar · Kutipan + tab Pratinjau; coret, daftar bernomor & link belum tersedia karena Els App 2.5.0 belum bisa menampilkannya), audiens (global/sinode/cabang), tanggal & ayat (renungan). **Simpan dulu, baru unggah hero image** (3:2). Centang Published.
- App: bookmark, bagikan sebagai kartu gambar + link pratinjau.
- **ECC Worship**: album & single (vokal/karaoke, lirik, unduh offline) dikelola di Portal → Worship.
- **Alkitab & Bible 365**, **Catatan saya**, **Resolusi** = data pribadi jemaat; tidak terlihat di Portal.
- **Resolusi (2.5.1)**: tiap resolusi bisa ditautkan **ayat pegangan** (cukup ketik referensinya seperti di Catatan, mis. "Yoh 3:16" / "1 Kor 13:4-7"; versi = Alkitab yang dipakai jemaat; tautan ayat di daftar & detail membuka Alkitab di ayat itu). Resolusi **tercapai** bisa dibagikan sebagai gambar + ayatnya, dengan ajakan Beri seperti doa terjawab.
- **Ajakan ECC Worship (2.5.1)**: di Alkitab & Catatan ("baca/mencatat sambil mendengarkan ECC Worship") dan di detail homecell untuk PIC & asisten ("tidak punya pemain musik? Coba ECC Worship karaoke") → membuka menu ECC Worship.
- **Renungan di Beranda (2.5.1)**: hanya renungan bertanggal **hari ini**; tidak ada → section disembunyikan (2.5.0 menampilkan renungan terbit terakhir).
- **Kalender (2.5.1)**: ulang tahun **Anda sendiri** ikut tampil.

## Announcement (pengumuman)
- Portal → **Announcement**: susun pengumuman ke penerima tertentu dan pantau pengiriman (halaman detail: konten | penerima & pengiriman).
- **Penerima hanya jemaat yang sudah aktif di Els App** (sudah masuk & menyelesaikan pendaftaran di app) — untuk semua kanal (in-app, WhatsApp, email). Jemaat yang belum memakai app tidak menerima pengumuman; "Semua pemakai Els App" = semua jemaat aktif yang sudah memakai app. (2026-11)

## Notifikasi
- **In-app** (lonceng di app; app memeriksa berkala ±30 detik). Ketuk notifikasi → membuka halaman terkait. *Tandai semua* = sudah dibaca.
- **WhatsApp & Email** per jenis notifikasi diatur di Portal → Developer Tools → **WhatsApp Notif Config**: aktif/nonaktif, edit template (placeholder mis. {nama}, {event_judul}), **Test** ke nomor sendiri, dan **Saluran notifikasi** per jenis (In-app / WhatsApp / Email / Email bila tanpa WA). Jenis baru default WA nonaktif. Perubahan berlaku ≤60 detik.
- Jenis penting: CKIDS_CHECKIN/PICKUP, GIFT_REDEEMED, POINT_EARNED/ADJUSTED, FAMILY_LINKED, GROUP_MEMBER_ADDED/REMOVED/DISMISSED, EVENT_REGISTERED/APPROVED/CHECKED_IN/PAYMENT_REJECTED/CANCELLED_BY_ADMIN, HOMECELL_ATTENDED, VISIT_RECORDED, BRANCH_CHANGE_APPROVED/REJECTED, MINISTRY_JOIN_REQUESTED/APPROVED/REJECTED, MINISTRY_DUTY_ASSIGNED/REMOVED (termasuk "tugas diperbarui"), HOMECELL_MATERIAL, pengingat ibadah/event, ulang tahun.
- Jemaat bisa mematikan pesan WhatsApp (pengingat, ucapan, info) di Pengaturan → Privasi → Pesan WhatsApp; OTP tetap terkirim.
- Pengingat WA bisa dipicu manual di Developer Tools → **Maintenance**.

## Kasus umum
- **"Notifikasi WA tidak terkirim"** → cek jenis notif aktif di WhatsApp Notif Config, saluran notifikasi, gateway (Server Health), dan apakah jemaat mematikan pesan WA.
- **"Petugas doa tidak melihat tab tugas"** → ia belum cocok dengan Konfigurasi Petugas (role/ministry).
- **"Gambar berita tidak bisa diunggah"** → simpan konten dulu.
- **"Renungan tidak muncul di Beranda"** → di 2.5.1 hanya renungan bertanggal hari ini yang tampil; pastikan tanggal renungan = hari ini & Published.
- **"Tombol bagikan doa tidak ada"** → hanya untuk doa yang sudah ditandai terjawab, di app 2.5.1.

## Diagnosis (untuk Elsa)
`prayer_request` (status, tanpa isi) + `prayer_petugas_role` / `prayer_petugas_pelayanan` → `feedback` → `konten` → `notification` (jemaatId, type, createdAt, readAt) untuk memastikan notifikasi in-app terkirim.
