# Checklist Kepatuhan Hukum Digital — Ekosistem Els App (Indonesia · Malaysia · Australia)

**Cakupan:** Els App (iOS, Android, web), Portal admin, CKids, core-api, layar `/monitor`.
**Per tanggal:** 29 Oktober 2026 (revisi 10 — Compliance: SOP, backup bulanan, catatan pemrosesan; cek ulang dokumen yang tayang di api.eccchurch.global) · **Disusun dari:** pemeriksaan kode di repo `ecc-core-platform` & `ecc-mobile-app` + ringkasan regulasi terbaru (lihat Sumber).

> **Bukan nasihat hukum.** Dokumen ini adalah daftar periksa teknis–operasional untuk membantu tim. Keputusan akhir (mis. penunjukan DPO, isi Kebijakan Privasi, dasar hukum pemrosesan) perlu dikonfirmasi dengan penasihat hukum di masing-masing negara.

## Keterangan status

| Status | Arti |
|---|---|
| ✅ **Sudah** | Sudah ada di sistem / sudah berjalan |
| 🟡 **Sebagian** | Ada, tetapi belum lengkap untuk memenuhi kewajiban |
| ❌ **Belum** | Belum ada |
| ⚪ **Konfirmasi** | Bukan hal teknis, atau perlu dicek oleh pengurus/legal |
| ➖ **Tidak berlaku** | Saat ini tidak relevan untuk Els App |

**Pemilik tindak lanjut:** **IT** = tim pengembang · **ORG** = pengurus/gereja · **LEGAL** = penasihat hukum.

---

## 1. Regulasi yang berlaku (ringkas)

| Negara | Regulasi utama | Status per Okt 2026 | Catatan penting untuk Els App |
|---|---|---|---|
| 🇮🇩 Indonesia | UU 27/2022 Pelindungan Data Pribadi (UU PDP) + **PP 33/2026** (peraturan pelaksana, terbit 16 Jul 2026) | UU PDP berlaku penuh sejak Okt 2024; PP 33/2026 berlaku efektif ±16 Jan 2027; **Lembaga PDP belum terbentuk** | Notifikasi kebocoran 3×24 jam, DPO, transfer lintas negara, denda adm. s.d. 2% pendapatan tahunan |
| 🇮🇩 Indonesia | PP 71/2019 & Permenkominfo 5/2020 (Penyelenggara Sistem Elektronik/PSE) | Berlaku | Wajib **daftar PSE Lingkup Privat** di Komdigi |
| 🇮🇩 Indonesia | **PP 17/2025 (PP Tunas)** — perlindungan anak di sistem elektronik | Berlaku; aturan teknis (Permen) sedang disiapkan | Batas usia minimum, verifikasi usia, kanal pelaporan, persetujuan orang tua; berlaku lintas platform, termasuk layanan yang **dirancang untuk anak** (relevan: CKids) |
| 🇲🇾 Malaysia | PDPA 2010 + **Amendment Act 2024** | Bertahap: 1 Jan, 1 Apr, **1 Jun 2025** | DPO wajib (ambang: >20.000 subjek / >10.000 data sensitif / pemantauan sistematis), notifikasi kebocoran 72 jam, **hak portabilitas data**, denda s.d. RM1 juta; **keyakinan agama = data sensitif** |
| 🇲🇾 Malaysia | Guidelines Cross Border Transfer (29 Apr 2025), DPO & Breach Notification Guidelines | Berlaku | Transfer ke luar Malaysia perlu dasar hukum (negara setara / persetujuan / TIA) |
| 🇦🇺 Australia | Privacy Act 1988 (13 Australian Privacy Principles) + **Privacy and Other Legislation Amendment Act 2024** | Tort privasi sejak 10 Jun 2025; transparansi keputusan otomatis (ADM) **10 Des 2026** | Notifiable Data Breaches (NDB); **agama = sensitive information**; pengecualian usaha kecil (omzet < AUD 3 jt) — perlu dicek |
| 🇦🇺 Australia | **Children's Online Privacy Code** (draft Mar 2026) | Wajib terdaftar paling lambat 10 Des 2026; tanggal berlaku belum ditetapkan | Mencakup layanan yang **"primarily concerned with activities of children"** → CKids berpotensi masuk |
| 🇦🇺 Australia | Spam Act 2003 | Berlaku | Pesan elektronik komersial wajib ada persetujuan & cara berhenti berlangganan (lembaga amal punya pengecualian terbatas) |

---

## 2. Checklist kontrol utama (berlaku di ketiga negara)

| No | Kewajiban | 🇮🇩 Indonesia | 🇲🇾 Malaysia | 🇦🇺 Australia | Status | Kondisi di sistem saat ini | Tindak lanjut | Prioritas | Pemilik |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **Kebijakan Privasi & Syarat Layanan** dipublikasikan | Wajib (UU PDP Ps. 21, PP 33) | Wajib (Notice & Choice Principle) | Wajib (APP 1) | ✅ Sudah | **6 dokumen v3.0 tayang** (PRIVACY & TERMS × id/en/ms): pengendali data, server Indonesia, vendor, hak, retensi, DPO, regulator. Sisa kecil: DPO `[NAMA]` & judul "Notic" di PRIVACY/ms; klausul bahasa S&K ID/EN belum sebut BM | Rapikan sisa kecil; review LEGAL berkala | Rendah | LEGAL + IT |
| 2 | **Persetujuan (consent) yang tercatat** | Wajib eksplisit, tertulis/terekam, untuk tujuan spesifik (Ps. 20–22) | Wajib; data sensitif butuh **persetujuan eksplisit** | Data sensitif butuh consent (APP 3.3) | ✅ Sudah | **Aktif di server sejak 30 Okt 2026** (layar persetujuan tampil di app 2.4.4 & web): model `UserConsent` (versi S&K/Privasi, data sensitif, kelompok usia, platform, IP, waktu); centang saat daftar + layar setuju ulang (`ConsentGate`) bila versi `id` berubah; badge di Portal → detail jemaat | Rilis app; pantau cakupan persetujuan | Sedang | IT |
| 3 | **Data sensitif: keyakinan agama** (keanggotaan gereja) | Bukan "data spesifik" eksplisit di UU PDP, tetap data pribadi | **Data sensitif** | **Sensitive information** | ✅ Sudah | Persetujuan eksplisit data sensitif (termasuk agama) wajib & tercatat (No. 2) | — | — | LEGAL + IT |
| 4 | **Hak akses & koreksi data** | Wajib (Ps. 6–7) | Wajib (Access & Correction) | Wajib (APP 12–13) | ✅ Sudah | Jemaat melihat & mengubah profil sendiri di app (Ubah Profil, Keluarga) | — | — | — |
| 5 | **Hak hapus / tarik persetujuan** | Wajib (Ps. 8–9) | Retention Principle; tarik persetujuan | Hapus/de-identifikasi bila tak diperlukan (APP 11.2) | ✅ Sudah | **Aktif sejak 30 Okt 2026**: Portal → Jemaat → **Hapus data permanen** (`POST /admin/jemaat/:id/purge`, ketik HAPUS PERMANEN) + akun nonaktif disamarkan otomatis setelah 3 th | SOP permintaan via privacy@ (3×24 jam) | Sedang | IT |
| 6 | **Hak portabilitas / salinan data** | Hak memperoleh & memakai data (Ps. 13) | **Wajib sejak 1 Jun 2025** | Hak akses (APP 12) | ✅ Sudah | **Dibangun 30 Okt 2026**: `POST /admin/me/export/link` (PDF via link 10 menit, 3x/jam, tercatat di Audit Log) + tombol **Unduh data saya** di Pengaturan → Privasi (app 2.4.4 & web) | — | — | IT |
| 7 | **Pengaturan privasi oleh pengguna** | Prinsip minimisasi & kontrol | Choice | APP 6 | ✅ Sudah | Pengaturan Privasi per data (siapa boleh melihat), opsi ditemukan via no HP, saklar analitik anonim | — | — | — |
| 8 | **Notifikasi kebocoran data** | 3×24 jam ke subjek & Lembaga (Ps. 46) | **72 jam** ke Komisioner bila merugikan signifikan; ke subjek | Segera ke OAIC & individu (NDB) | ✅ Sudah | **Dibangun 30 Okt 2026**: Portal → **Compliance → SOP Compliance** — SOP kebocoran & permintaan data per negara (model `ComplianceDocument`, seed 6 dokumen di migrasi `20261030170000`), editable, unduh PDF | Isi nama tim respons, sosialisasi & simulasi tahunan | Sedang | ORG + IT |
| 9 | **Petugas Pelindungan Data (DPO)** | Wajib bila pemrosesan skala besar / data spesifik / pemantauan sistematis | Wajib bila ambang terpenuhi; registrasi portal ≤ 21 hari; residen/terhubung Malaysia, fasih BM & EN | Tidak wajib (disarankan Privacy Officer) | ✅ Sudah | **Ditunjuk: Caroline Gugun Hartanti** — privacy@eccchurch.global, tercantum di Kebijakan v3.0 | Pastikan privacy@ dipantau harian (tenggat 3×24 jam); DPO Malaysia lihat MY-2 | Sedang | ORG |
| 10 | **Keamanan data teknis** | Wajib (Ps. 35–39) | Security Principle | APP 11 | ✅ Sudah (inti) | HTTPS, Helmet, JWT berumur pendek + rotasi refresh token, OTP, rate limit, RBAC per menu (Role Access), Audit Log, Master password Credential | Lihat No. 11–13 untuk celah | — | — |
| 11 | **Enkripsi data sensitif saat disimpan** | Wajib sesuai risiko | Security Principle | APP 11 | ✅ Sudah | **Dibangun 30 Okt 2026**: kolom rahasia Credential dienkripsi AES-256-GCM (`lib/crypto-at-rest.ts`, `lib/credential-crypto.ts`); data lama dienkripsi otomatis saat start. Aktif setelah `DATA_ENCRYPTION_KEY` di-set | Simpan salinan kunci di luar server | Tinggi | IT |
| 12 | **Backup aman** | Wajib | Security | APP 11 | ✅ Sudah | Backup terenkripsi + **Dibangun 30 Okt 2026**: **Compliance → Kirim Backup Bulanan** (`BackupEmailConfig`, job per jam, link unduh bertanda tangan `/public/backup/:token`) | Aktifkan & isi penerima; simpan file di luar server | Sedang | IT |
| 13 | **Data biometrik (wajah)** | Data spesifik | **Data sensitif** (sejak 1 Apr 2025) | Sensitive info | ✅ Sudah | **Aktif sejak 30 Okt 2026**: migrasi `20261029180000_consent_purge_face` mengosongkan data wajah & telemetri wajah; `/auth/face/*` → 410 Gone | — | — | IT |
| 14 | **Retensi data** | Wajib dimusnahkan bila tujuan selesai (Ps. 43–44) | Retention Principle | APP 11.2 | ✅ Sudah | **Aktif sejak 30 Okt 2026**: job harian `data-retention` — akun nonaktif >3 th & tamu tanpa kunjungan >3 th disamarkan (`dataPurgedAt`), bukti transfer dihapus 1 th setelah event (env `*_RETENTION_DAYS`, `DATA_RETENTION_ENABLED`) | — | — | ORG + IT |
| 15 | **Transfer data ke luar negeri** | Wajib setara/perlindungan memadai/persetujuan (Ps. 56) | Guideline 29 Apr 2025 (dasar hukum/TIA) | APP 8 | 🟡 Sebagian | Dijelaskan di Kebijakan v3.0: server **Indonesia**; SendGrid & Anthropic (AS); Fonnte & IDEA (ID) | DPA vendor (No. 16) | Sedang | ORG + LEGAL |
| 16 | **Perjanjian dengan pemroses (vendor)** | Wajib (prosesor) | Processor terikat Security Principle | APP 8 / kontrak | ⚪ Konfirmasi | Belum ada DPA | DPA dengan IDEA, Fonnte, hosting; cek DPA standar SendGrid & Anthropic | Sedang | ORG + LEGAL |
| 17 | **Catatan aktivitas pemrosesan & DPIA** | Wajib (rekam pemrosesan; DPIA untuk risiko tinggi) | Disarankan / bagian akuntabilitas | Disarankan (PIA) | ✅ Sudah | **Dibangun 30 Okt 2026**: Portal → **Compliance → Catatan Pemrosesan & Risiko** (`ProcessingActivity`, seed 11 aktivitas di migrasi `20261030190000` + P-12 Ulasan di `20261030230000`), editable, unduh PDF | Tinjau tiap 6 bulan / saat fitur baru | Rendah | ORG + IT |
| 18 | **Analitik / pelacakan** | Perlu dasar hukum & transparansi | Notice | APP 5, 6 | ✅ Sudah | Analitik anonim, saklar matikan di Privasi; **dijelaskan di Kebijakan v3.0** | — | — | LEGAL |
| 19 | **Pesan WhatsApp / email** (pengingat ibadah, ulang tahun, notifikasi) | Perlu persetujuan & cara berhenti | Hak menolak direct marketing | Spam Act: consent + **unsubscribe** (pesan komersial) | ✅ Sudah | **Dibangun 30 Okt 2026**: `jemaat_privacy.wa_reminders/wa_greetings/wa_updates` + Pengaturan → Privasi → **Pesan WhatsApp**; `sendWaIfEnabled`, pengingat H-1 & ucapan ulang tahun menghormati pilihan. OTP/tautan login tetap dikirim | — | — | IT |
| 20 | **Pengungkapan data ke pihak lain di dalam gereja** | Sesuai tujuan | Disclosure Principle | APP 6 | ✅ Sudah | Sesuai Pengaturan Privasi & Role Access; laporan/monitor agregat; link laporan 30 menit; **S&K v3.0 Bag. 10** mengatur kewajiban admin/petugas/kode monitor | — | — | — |
| 21 | **Keamanan akun admin** | Wajib | Security | APP 11 | 🟡 Sebagian | Login OTP/email + RBAC + Audit Log. Belum ada 2FA khusus admin & kebijakan tinjauan akses berkala | Tinjau hak Role Access tiap 6 bulan; pertimbangkan 2FA untuk akun portal | Sedang | ORG + IT |

---

## 3. Data anak (CKids)

| No | Kewajiban | Negara | Status | Kondisi di sistem | Tindak lanjut | Prioritas | Pemilik |
|---|---|---|---|---|---|---|---|
| A1 | Data anak = **data spesifik**; butuh persetujuan **orang tua/wali** | 🇮🇩 UU PDP Ps. 25 | ✅ Sudah | Persetujuan data sensitif mencakup data anak yang dikelola orang tua/wali & tercatat (No. 2) | — | — | IT |
| A2 | **PP Tunas**: usia minimum pengguna, verifikasi usia, kanal pelaporan, persetujuan ortu untuk 13–<16 th | 🇮🇩 | 🟡 Sebagian | Kelompok usia ditanyakan saat daftar/setuju ulang (18+ / 13–17 dgn izin ortu); <13 ditolak bila tanggal lahir diketahui; kanal lapor support@. Masih pernyataan sendiri | Pantau Permen teknis PP Tunas (metode verifikasi usia) | Sedang | ORG + IT |
| A3 | Data anak dilindungi ekstra (keamanan, minimisasi) | 🇲🇾 PDPA | 🟡 Sebagian | Kode jemput 6 digit, data anak hanya untuk orang tua & petugas CKids; monitor hanya menampilkan angka | Dokumentasikan dalam DPIA; batasi akses petugas sesuai cabang | Sedang | ORG |
| A4 | **Children's Online Privacy Code** (layanan "primarily concerned with children") | 🇦🇺 | ⚪ Konfirmasi | Kode masih draft; tanggal berlaku belum ditetapkan | Pantau OAIC; lakukan penilaian bila ada cabang & anak di Australia | Rendah (pantau) | LEGAL |

---

## 4. Kewajiban khusus per negara

### 🇮🇩 Indonesia

| No | Kewajiban | Status | Kondisi | Tindak lanjut | Prioritas | Pemilik |
|---|---|---|---|---|---|---|
| ID-1 | Pendaftaran **PSE Lingkup Privat** (Komdigi / OSS) untuk Els App & portal | ⚪ Konfirmasi | Belum diketahui apakah sudah terdaftar | Cek & daftarkan bila belum | Tinggi | ORG |
| ID-2 | Siap mengikuti **PP 33/2026** (berlaku ±16 Jan 2027) | ✅ Sudah | Semua kontrol inti ada (No. 1–17) | Pantau aturan teknis & Lembaga PDP | Sedang | ORG + IT |
| ID-3 | Bahasa Indonesia untuk dokumen hukum & pemberitahuan | ✅ Sudah | Kebijakan & S&K v3.0 dalam Bahasa Indonesia | — | — | — |
| ID-4 | Data keuangan (bukti transfer event) = data spesifik | ✅ Sudah | Dihapus otomatis 1 th setelah event (No. 14) | — | — | ORG + IT |

### 🇲🇾 Malaysia

| No | Kewajiban | Status | Kondisi | Tindak lanjut | Prioritas | Pemilik |
|---|---|---|---|---|---|---|
| MY-1 | Pemberitahuan (Notice) dalam **Bahasa Melayu & Inggris** | ✅ Sudah | **PRIVACY/ms & TERMS/ms tayang** (29 Okt 2026) | Isi nama DPO di PRIVACY/ms | Rendah | IT + LEGAL |
| MY-2 | Cek ambang **DPO** (>20.000 subjek / >10.000 data sensitif) — agama = sensitif | ⚪ Konfirmasi | DPO umum sudah ada; hitung jumlah jemaat cabang Malaysia | Bila melewati ambang: tunjuk DPO residen, daftar di portal PDP ≤ 21 hari | Tinggi | ORG |
| MY-3 | Notifikasi kebocoran ≤ 72 jam (guideline 1 Jun 2025) | ✅ Sudah | SOP kebocoran Malaysia (No. 8) | — | — | ORG |
| MY-4 | Hak portabilitas | ✅ Sudah | Unduh data saya (No. 6) | — | — | IT |
| MY-5 | Registrasi sebagai data user wajib (kategori tertentu) | ➖ Tidak berlaku / ⚪ | Organisasi keagamaan umumnya tidak termasuk kelas wajib registrasi | Konfirmasi dengan LEGAL | Rendah | LEGAL |

### 🇦🇺 Australia

| No | Kewajiban | Status | Kondisi | Tindak lanjut | Prioritas | Pemilik |
|---|---|---|---|---|---|---|
| AU-1 | Cek **pengecualian usaha kecil** (omzet tahunan < AUD 3 juta) | ⚪ Konfirmasi | Bila entitas Australia di bawah ambang, sebagian besar APP mungkin tidak wajib; tetap disarankan dipatuhi | Konfirmasi status entitas & omzet | Sedang | ORG + LEGAL |
| AU-2 | Kebijakan Privasi sesuai **APP 1** + pemberitahuan pengumpulan (**APP 5**) | ✅ Sudah | Kebijakan v3.0: transfer luar negeri (APP 8), cara mengeluh & kontak OAIC; S&K v3.0 menghormati Australian Consumer Law | — | — | LEGAL |
| AU-3 | **Notifiable Data Breaches** | ✅ Sudah | SOP kebocoran Australia (No. 8) | — | — | ORG |
| AU-4 | Transparansi **keputusan otomatis (ADM)** — mulai 10 Des 2026 | ➖ Tidak berlaku | Els App tidak membuat keputusan otomatis yang berdampak signifikan bagi individu (Elsa/analitik hanya bantuan & agregat) | Tinjau ulang bila ada fitur otomatis baru | Rendah | IT |
| AU-5 | **Tort privasi serius** (sejak 10 Jun 2025) | ✅ Sudah (mitigasi) | Kontrol akses & privasi mengurangi risiko penyalahgunaan data | Pelatihan singkat untuk admin/petugas tentang penggunaan data | Rendah | ORG |
| AU-6 | **Spam Act** untuk pesan WA/email | ✅ Sudah | Pilihan berhenti menerima WA di app (No. 19) | — | — | IT |

---

## 5. Ringkasan skor

| Area | ✅ Sudah | 🟡 Sebagian | ❌ Belum | ⚪ Konfirmasi |
|---|---|---|---|---|
| Kontrol umum (21) | 18 | 2 | 0 | 1 |
| Data anak (4) | 1 | 2 | 0 | 1 |
| Indonesia (4) | 3 | 0 | 0 | 1 |
| Malaysia (5) | 3 | 0 | 0 | 2 |
| Australia (6) | 4 | 0 | 0 | 2 (termasuk 1 tidak berlaku) |

**Kesimpulan (revisi 5):** dengan terbitnya Kebijakan Privasi & S&K **v3.0** dan penunjukan **DPO**, sisi dokumen hampir lengkap. Fokus berikutnya adalah **menjalankan janji di dokumen**: persetujuan tercatat (No. 2), hapus data wajah (No. 13), hapus permanen & retensi otomatis (No. 5, 14), SOP kebocoran & permintaan data 3×24 jam (No. 8), dan DPA vendor. Dokumen sudah tayang dalam 3 bahasa.

**Perubahan dari revisi 1:** No. 1, 6, 9, 15, 18 · A2 · MY-1, MY-4 · AU-2.

**Revisi 10 (30 Okt 2026):** dibangun Compliance → Catatan Pemrosesan & Risiko (No. 17, ID-2).

**Revisi 9 (30 Okt 2026):** `DATA_ENCRYPTION_KEY` terpasang. Dibangun menu **Compliance**: SOP kebocoran & permintaan data per negara (No. 8, MY-3, AU-3) dan Kirim Backup Bulanan (No. 12).

**Revisi 8 (30 Okt 2026):** dibangun enkripsi Credential (No. 11) & backup (No. 12), Unduh data saya (No. 6, MY-4), preferensi pesan WA (No. 19, AU-6). Enkripsi aktif setelah `DATA_ENCRYPTION_KEY` dipasang; fitur jemaat di app 2.4.4 & web.

**Revisi 7 (30 Okt 2026):** deploy server dicek — `sisa_wajah = 0`, job `data-retention` berjalan (0 data lewat masa simpan), `user_consent` siap (0, menunggu app 2.4.4). Dokumen legal sudah ditempel ulang.

**Revisi 6:** dibangun persetujuan tercatat (No. 2, 3, A1), hapus data wajah (No. 13), hapus permanen & retensi otomatis (No. 5, 14, ID-4); status Sudah berlaku setelah deploy & rilis app.

**Cek ulang (revisi 5):** placeholder & kurung siku hilang, No. 1 → Sudah; sisa kecil di PRIVACY/ms (nama DPO).

**Cek ulang (revisi 4):** 6 dokumen tayang (ID/EN/MS), MY-1 → Sudah, sisa perapian kecil (No. 1).

**Cek ulang (revisi 3):** Kebijakan Privasi ID/EN final kecuali lokasi server · dukungan `ms` aktif, PRIVACY/ms belum dipublish · S&K ID/EN masih placeholder & "draf" · belum ada perubahan sistem (No. 2, 5, 13, 14).

---

## 6. Rencana tindak lanjut (urut prioritas)

| Urutan | Pekerjaan | Pemilik | Target |
|---|---|---|---|
| 1 | Lengkapi SOP (nama tim respons), bagikan PDF ke petugas & latihan simulasi | ORG + DPO | Nov 2026 |
| 2 | Aktifkan Kirim Backup Bulanan & simpan file di luar server | IT + ORG | Nov 2026 |
| 3 | Rilis app 2.4.4 (persetujuan, unduh data, pesan WA) & deploy Els App web | IT | Nov 2026 |
| 4 | Perjanjian pemrosesan data (DPA) dengan vendor | ORG + LEGAL | Q1 2027 |
| 4b | Tinjau Catatan Pemrosesan & Risiko | DPO | Tiap 6 bulan |
| 5 | PP Tunas: verifikasi usia sesuai Permen teknis | IT | Saat Permen terbit |
| 6 | Cek PSE (ID), ambang DPO Malaysia, status usaha kecil (AU), pantau aturan baru | ORG + LEGAL | Berkala |

---

## Sumber

- Indonesia — PP 33/2026 & status Lembaga PDP: [Lexology](https://www.lexology.com/library/detail.aspx?g=0482381c-58c3-4c1b-8bd8-d415a59544a2), [law.asia](https://law.asia/indonesia-pdp-law-data-protection-compliance/), [AHP](https://www.ahp.id/pdp-law-updates-the-pdp-implementing-regulation-is-out-and-it-clarifies-some-key-questions-under-indonesias-pdp-law/), [DLA Piper — Data Protection Laws of the World](https://www.dlapiperdataprotection.com/?t=law&c=ID)
- Indonesia — PP Tunas (PP 17/2025): [Bisnis.com — 10 kewajiban platform](https://teknologi.bisnis.com/read/20260505/101/1971394/10-kewajiban-platform-dalam-pp-tunas-yang-perlu-diketahui-pse), [Bisnis.com — berlaku lintas platform](https://teknologi.bisnis.com/read/20260416/101/1967078/komdigi-tegaskan-pp-tunas-berlaku-lintas-platform-bukan-hanya-media-sosial), [Bisnis.com — verifikasi pengguna anak](https://teknologi.bisnis.com/read/20260505/84/1971467/pse-simak-ini-ketentuan-verifikasi-pengguna-anak-di-pp-tunas)
- Malaysia — PDPA Amendment 2024 & tanggal berlaku: [DFDL](https://www.dfdl.com/insights/legal-and-tax-updates/malaysia-implementation-of-the-personal-data-protection-amendment-act-2024/), [Baker McKenzie](https://insightplus.bakermckenzie.com/bm/data-technology/malaysia-personal-data-protection-amendment-act-2024-to-come-into-force), [ASEAN Briefing](https://www.aseanbriefing.com/news/malaysia-tightens-data-protection-from-june-2025/), [Data Protection Report](https://www.dataprotectionreport.com/2025/01/new-horizons-in-data-protection-malaysias-personal-data-protection-amendment-act-2024/)
- Malaysia — DPO, notifikasi kebocoran, transfer lintas negara: [DLA Piper Privacy Matters](https://privacymatters.dlapiper.com/2025/03/malaysia-guidelines-issued-on-data-breach-notification-and-data-protection-officer-appointment/), [CMS](https://cms.law/en/int/legal-updates/guidelines-on-appointment-of-data-protection-officers-in-malaysia), [Mayer Brown](https://www.mayerbrown.com/en/insights/publications/2025/07/from-legislative-reform-to-practical-guidance-key-amendments-to-malaysias-pdpa-and-the-launch-of-cross-border-transfer-guidelines)
- Australia — Privacy Act 2024 amendments, tort & ADM: [Corrs](https://corrs.com.au/insights/australias-ongoing-privacy-reforms-bolstering-australias-privacy-regulatory-framework), [LexisNexis](https://www.lexisnexis.com/blogs/en-au/insights/australias-bold-leap-into-a-new-era-of-privacy-law), [L&E Global](https://leglobal.law/2025/05/22/australia-a-new-statutory-tort-for-privacy-invasion-and-disclosure-of-automated-decision-making-incoming-privacy-law-reforms-in-australia/)
- Australia — Children's Online Privacy Code: [OAIC](https://www.oaic.gov.au/privacy/privacy-registers/privacy-codes/childrens-online-privacy-code), [Attorney-General](https://ministers.ag.gov.au/media-centre/draft-childrens-online-privacy-code-released-31-03-2026), [Bird & Bird](https://www.twobirds.com/en/insights/2026/australia/designed-for-kids-regulated-for-all)

*Dokumen ini perlu diperbarui saat Lembaga PDP Indonesia terbentuk, Permen PP Tunas terbit, dan Children's Online Privacy Code Australia didaftarkan.*
