---
id: forecast
title: Forecast — Pertumbuhan Jemaat (Portal)
tags: forecast, prediksi, pertumbuhan jemaat, jemaat aktif, els app aktif, proyeksi, perkiraan, platform, ios, android, web, tamu, konversi, homecell, event, kapasitas, okupansi, simulasi, keandalan data, export pdf
summary: Menu Forecast di Portal (dock di sebelah Elsa) — jemaat aktif Els App per bulan, komponen pertumbuhan, prediksi s/d 60 bulan, per cabang, platform, tamu, homecell & event, kapasitas ibadah, simulasi, kesiapan data, export PDF 16:9.
---

# Forecast — Pertumbuhan Jemaat

**Letak:** dock bawah Portal, tombol **Forecast** di sebelah Elsa (`/dashboard/forecast`). Akses: Role Access → menu **Forecast** (Lihat = membuka halaman & export; Ubah = mengubah Pengaturan batas data).

## Patokan
- **Jemaat aktif Els App** = jemaat (bukan tamu) yang membuka Els App dalam keadaan login minimal sekali dalam bulan itu.
- **Berhenti aktif** = sebelumnya aktif, lalu tidak membuka Els App 2 bulan berturut-turut. **Kembali aktif** = sempat berhenti lalu aktif lagi. **Baru** = pertama kali aktif.
- Angka bulanan memakai bulan yang sudah lengkap (WIB); bulan berjalan ditampilkan terpisah.

## Dari mana datanya
- Server mencatat aktivitas setiap request Els App yang login (header `X-Client: mobile`; platform dari `X-App-Version` "versi/ios|android|web") ke tabel `jemaat_activity_monthly` — berlaku untuk semua versi app tanpa update. Portal tidak dihitung.
- Riwayat sebelum pencatatan dimulai dibentuk dari catatan sesi login & audit yang masih tersimpan. Bulan riwayat yang lebih tua hanya **ditampilkan** (diarsir "riwayat login (kurang lengkap)"), **tidak dipakai** untuk prediksi.
- Tamu: kehadiran ibadah, event & homecell. Kapasitas: check-in ibadah & jumlah kursi (Ibadah → Edit ibadah). Homecell: anggota aktif. Event: peserta & jadwal event.

## Tab
1. **Ringkasan & Prediksi** — angka utama, grafik riwayat + prediksi (skenario Pesimis / Normal / Optimis, pita rentang 80%, tonggak 3.000/5.000/…), proyeksi per tahun, komponen pertumbuhan, "Yang perlu diperhatikan", platform, usia, keterlibatan, "Apa yang perlu gereja kerjakan".
2. **Per Cabang** — aktif, tumbuh, tren 12 bulan, baru/berhenti, platform, prediksi 12 bulan (cabang kecil diberi tanda rentang lebar).
3. **Platform** — jemaat aktif per iOS / Android / Web per bulan, tren & retensi bulan pertama.
4. **Tamu** — tamu per bulan (New Comer / Visitor) + prediksi, perjalanan tamu 90 hari (hadir → hadir lagi → dihubungi/homecell → daftar Els App → jemaat aktif), New Comer belum di-follow-up, per cabang.
5. **Homecell & Event** — **pertumbuhan homecell** (homecell aktif, anggota aktif, homecell baru per bulan, rata-rata hadir per pertemuan, perkiraan anggota 12 bulan & homecell yang dibutuhkan), % jemaat aktif di homecell, tingkat berhenti ikut vs tidak ikut homecell, kurva bertahan, kapasitas homecell & jumlah homecell yang perlu dibuka, jemaat baru dari event, event paling menumbuhkan.
6. **Kapasitas Ibadah** — okupansi (rata-rata hadir ÷ kursi), status Aman < 75% · Mulai padat 75–89% · Penuh ≥ 90%, prediksi 6/12 bulan & perkiraan bulan penuh. Okupansi hanya pendataan.
7. **Simulasi** — geser pengguna baru, retensi bulan pertama, berhenti, % ikut homecell, event per tahun → dampak ke 12 bulan.
8. **Keandalan Data** — kesiapan data per bagian (Siap / Perkiraan awal / Belum cukup), **Pengaturan batas data minimal** (bawaan: tren 12 bulan, musiman 24 bulan, cabang 12 bulan & ≥ 100 jemaat aktif, platform 3 bulan, tamu 6 bulan, 8 pertemuan, homecell 6 bulan, 5 event; bila kurang: tampilkan "perkiraan awal" atau sembunyikan), uji ketepatan prediksi.

## Peringatan data dini
Bila data kurang dari batas tren, muncul kotak kuning "Data masih terlalu dini" dengan bilah kemajuan & kapan cukup akurat. Prediksi muncul setelah minimal 3 bulan data yang dapat dipercaya.

## Cara prediksi
Model tren yang melambat bertahap (damped Holt) + pola musiman bulanan bila data ≥ batas musiman; event yang sudah dijadwalkan menambah perkiraan jemaat baru (bila sudah ada cukup event untuk diukur). Bukan AI kotak hitam; dihitung ulang tiap kali dibuka (cache 5 menit). Lebih dari 24 bulan = gambaran arah.

## Export PDF
Tombol **Export PDF** → slide 16:9 (ukuran PowerPoint), ±17 halaman: sampul, ringkasan, perkiraan, per tahun, dari mana pertumbuhan datang (+ yang perlu diperhatikan), perjalanan tamu, tamu per bulan & cabang, kapasitas ibadah, per cabang, perangkat, usia & keterlibatan, pertumbuhan homecell, homecell & event, kebutuhan homecell & event teratas, tentang data (kesiapan & asumsi), **Apa yang perlu gereja kerjakan**, penutup **ECC Church × IDEA** + pernyataan pertumbuhan + Kisah Para Rasul 2:47. Simpan lewat Print → Simpan sebagai PDF (Margin: None).
