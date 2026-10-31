# Uji beban Els App (k6) — hanya memanggil API

**Tidak membuat, mengubah, atau menghapus data apa pun di production**: tidak ada akun uji, tidak ada login/token, semua request `GET` ke endpoint publik. Satu-satunya jejak: angka request di Portal → Analitik (tabel Endpoint) pada jam uji.

Beban meniru 2000 jemaat aktif (±205 request/detik):

| Perilaku app | Endpoint yang dipanggil |
|---|---|
| Cek maintenance tiap 60 dtk | `/public/maintenance` |
| Lonceng notifikasi tiap 30 dtk (butuh login) | pengganti: `/public/app-config` |
| Telemetry ±2x/menit (tidak dikirim, supaya Analitik bersih) | pengganti: `/public/app-version` |
| Buka app | `/public/app-version`, `/public/app-config` |
| Jadwal ibadah, event, berita, renungan, homecell | versi publik (mode tamu), maks. ±22/dtk per IP |
| S&K / Kebijakan Privasi | `/public/legal/...` |

Jalankan **di luar jam ibadah dan di luar 07.00–10.00** (jam kirim reminder WA), **setelah** deploy batas per IP + koneksi database 20 + nginx 4096.

## Jalankan (dari Mac)

```bash
brew install k6
cd ~/Projects/ecc-core-platform

# 1. Pemanasan — 500 jemaat, 2 menit
k6 run -e USERS=500 -e RAMP=1m -e HOLD=2m scripts/loadtest/k6-jemaat.js

# 2. Target launching — 2000 jemaat, 5 menit
k6 run scripts/loadtest/k6-jemaat.js

# 3. Lonjakan — 3x beban dalam 30 detik (mis. check-in dibuka 07.15)
k6 run -e SCENARIO=spike scripts/loadtest/k6-jemaat.js
```

Pantau server di terminal lain selama uji:

```bash
ssh deploy@<IP-VPS> 'top -b -n 30 -d 2 | grep -E "^%Cpu|node|postgres"; pm2 status ecc-core-api'
```

k6 berhenti sendiri bila > 5% request gagal.

## Membaca hasil

| Metrik di ringkasan k6 | Aman | Perlu tindakan |
|---|---|---|
| `http_req_failed` | < 1% | ≥ 1% — 429 = batas per IP, 502/504 = server kewalahan |
| `http_req_duration` p(95) | < 800 ms | > 800 ms |
| `http_req_duration{name:ibadah-calendar}` p(95) | < 1 dtk | > 1 dtk (query database terberat) |
| `dropped_iterations` | < 100 | ≥ 100 — k6/Mac tidak sanggup mengirim secepat target |
| CPU `node` di `top` | < 80% | menempel 100% → jalankan core-api 2 proses |

Keterbatasan: endpoint yang butuh login (reservasi, tiket, lonceng) tidak diuji langsung — diwakili endpoint publik dengan query setara. Dari satu Mac, internet bisa jadi batas sebelum server: kalau banyak error `dial`/`timeout` tapi CPU server rendah, ulangi dari jaringan lain.
