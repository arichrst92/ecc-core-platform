-- Catatan aktivitas pemrosesan (RoPA) + penilaian risiko — menu Compliance
CREATE TABLE "processing_activity" (
    "id" UUID NOT NULL,
    "kode" VARCHAR(10) NOT NULL,
    "nama" VARCHAR(200) NOT NULL,
    "tujuan" TEXT NOT NULL,
    "subjek_data" TEXT NOT NULL,
    "kategori_data" TEXT NOT NULL,
    "data_sensitif" BOOLEAN NOT NULL DEFAULT false,
    "dasar_hukum" TEXT NOT NULL,
    "penerima" TEXT NOT NULL,
    "transfer_luar_negeri" TEXT NOT NULL,
    "retensi" TEXT NOT NULL,
    "keamanan" TEXT NOT NULL,
    "pemilik" VARCHAR(200) NOT NULL,
    "negara" TEXT[] DEFAULT ARRAY['ID', 'MY', 'AU']::TEXT[],
    "risiko_kemungkinan" INTEGER NOT NULL DEFAULT 1,
    "risiko_dampak" INTEGER NOT NULL DEFAULT 1,
    "risiko" TEXT NOT NULL,
    "mitigasi" TEXT NOT NULL,
    "risiko_sisa" VARCHAR(10) NOT NULL DEFAULT 'RENDAH',
    "tinjau_berikutnya" DATE,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "processing_activity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "processing_activity_kode_key" ON "processing_activity"("kode");

-- Seed 11 aktivitas sesuai sistem per 30 Okt 2026 (tidak menimpa hasil edit).
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-01','Akun & profil jemaat','Membuat dan mengelola akun Els App, login, profil, dan pendataan jemaat per cabang.','Jemaat (dewasa & remaja 13–17 dengan izin orang tua)','Nama, no HP, email, jenis kelamin, tanggal lahir, alamat, cabang, foto, pekerjaan, status pernikahan, data baptis, keanggotaan gereja',true,'Persetujuan eksplisit (tercatat di user_consent) & pelaksanaan layanan','Penyedia server (Indonesia); Fonnte — OTP WhatsApp (Indonesia); SendGrid — tautan login email (AS); IDEA — pengembang','Email login via SendGrid (AS); data jemaat MY & AU disimpan di server Indonesia','Selama akun aktif; akun dihapus/nonaktif → disamarkan otomatis setelah 3 tahun atau segera atas permintaan','HTTPS/TLS, login OTP tanpa kata sandi, Role Access, Audit Log, pengaturan privasi per data, backup terenkripsi','Admin pusat / Sekretariat',2,2,'Akses tidak sah oleh admin/petugas; data keyakinan agama terungkap.','Role Access per menu & cabang, Audit Log, tinjauan hak akses 6 bulanan, persetujuan eksplisit, hapus data permanen.','RENDAH',DATE '2027-04-30',1,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-02','Reservasi & kehadiran ibadah','Reservasi kursi, tiket QR, check-in (swipe/QR/usher), laporan kehadiran & okupansi.','Jemaat & tamu','Nama, kode jemaat, tanggal & ibadah yang diikuti, waktu check-in, cara check-in',true,'Pelaksanaan layanan & kepentingan sah (administrasi ibadah)','Penyedia server; petugas usher/scanner sesuai peran','Tidak ada (server Indonesia)','Selama akun aktif; ikut disamarkan saat akun dihapus','Role Access, QR bertanda kode jemaat, laporan & monitor hanya angka agregat','Tim Ibadah / Usher',1,2,'Riwayat kehadiran ibadah (menyiratkan agama) terlihat pihak tak berwenang.','Akses laporan dibatasi peran; monitor hanya agregat; Audit Log.','RENDAH',DATE '2027-04-30',2,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-03','Event & pembayaran event','Pendaftaran event, tiket, verifikasi bukti transfer, donasi event, check-in event.','Jemaat & tamu peserta event','Nama, kontak, status pendaftaran, nominal bayar, foto bukti transfer, catatan peserta',true,'Pelaksanaan layanan (pendaftaran & pembayaran)','Penyedia server; panitia event sesuai peran; bank (pembayaran oleh jemaat)','Tidak ada','Bukti transfer dihapus otomatis 1 tahun setelah event; data pendaftaran mengikuti akun','Role Access, bukti transfer hanya untuk panitia, retensi otomatis','Panitia event / Keuangan',2,2,'Bukti transfer (data keuangan) bocor atau disimpan terlalu lama.','Retensi otomatis 1 tahun, akses terbatas panitia, backup terenkripsi.','RENDAH',DATE '2027-04-30',3,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-04','CKids (pelayanan anak)','Pendataan anak oleh orang tua, check-in/out ibadah anak, kode jemput, poin & hadiah.','Anak di bawah 13 tahun & orang tua/wali','Nama anak, tanggal lahir, jenis kelamin, kehadiran, poin, kode jemput, data orang tua/wali',true,'Persetujuan orang tua/wali (tercatat) & kepentingan keselamatan anak','Penyedia server; petugas CKids yang berwenang','Tidak ada','Selama akun keluarga aktif; ikut disamarkan saat akun dihapus','Kode jemput 6 digit, akses hanya orang tua & petugas CKids, monitor hanya angka','Koordinator CKids',2,3,'Data anak terungkap atau anak dijemput orang yang tidak berhak.','Kode jemput unik per check-in, akses petugas dibatasi, persetujuan orang tua tercatat, SOP kebocoran.','SEDANG',DATE '2027-04-30',4,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-05','Homecell, group & tamu','Keanggotaan homecell/group, absensi pertemuan, pencatatan & tindak lanjut tamu, permintaan bergabung mode tamu.','Anggota, pemimpin, tamu (termasuk yang didaftarkan orang lain)','Nama, no HP, jenis kelamin/usia, kehadiran pertemuan, catatan tindak lanjut tamu',true,'Persetujuan (tamu wajib tahu & setuju — S&K Bag. 5) & kepentingan sah pelayanan','Penyedia server; pemimpin homecell / PIC area sesuai peran','Tidak ada','Tamu tanpa kunjungan > 3 tahun disamarkan otomatis','Akses per homecell/area, alamat & kontak pemimpin baru dibuka setelah diterima','Koordinator Homecell',2,2,'Data tamu dimasukkan tanpa sepengetahuan tamu; catatan tindak lanjut tersebar.','Klausul S&K tentang data orang lain, retensi tamu 3 tahun, hapus atas permintaan.','RENDAH',DATE '2027-04-30',5,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-06','Prayer request','Menerima & mendoakan permohonan doa, penugasan ke tim doa, kesaksian.','Jemaat & orang yang didoakan','Isi permohonan doa (dapat memuat kesehatan/keluarga), kategori, status, kesaksian',true,'Persetujuan (dikirim sukarela, bisa anonim)','Penyedia server; tim doa yang ditugaskan','Tidak ada','Mengikuti akun; isi diganti "[dihapus]" saat data dihapus','Akses hanya tim doa berwenang, opsi anonim, Audit Log','Koordinator Tim Doa',2,3,'Isi doa yang sangat pribadi (mis. kesehatan) terbaca pihak tak berwenang.','Akses dibatasi peran, opsi anonim, pengingat agar menulis seperlunya, hapus atas permintaan.','SEDANG',DATE '2027-04-30',6,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-07','Komunikasi WhatsApp & email','OTP, tautan login, pengingat ibadah/event, ucapan ulang tahun, info aktivitas.','Jemaat','No HP, email, nama, isi pesan, log pengiriman',false,'Pelaksanaan layanan (OTP) & persetujuan (pesan non-wajib, bisa dimatikan)','Fonnte (Indonesia); SendGrid / Twilio (AS)','Email via SendGrid (AS)','Log notifikasi mengikuti retensi sistem; dihapus saat data jemaat dihapus','Preferensi pesan per jemaat (Pengaturan → Privasi), OTP tetap terkirim','Admin pusat',1,2,'Pesan terkirim ke nomor yang salah; jemaat tidak bisa berhenti berlangganan.','Pilihan berhenti per jenis pesan, template diatur admin, perjanjian vendor.','RENDAH',DATE '2027-04-30',7,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-08','Analitik anonim aplikasi','Mengukur halaman yang dibuka, kecepatan aplikasi & API untuk perbaikan layanan.','Pengguna app & web','Kode acak per perangkat, halaman, durasi, versi app, waktu respons (tanpa nama/no HP)',false,'Kepentingan sah (perbaikan layanan), bisa dimatikan pengguna','Penyedia server','Tidak ada','Data halaman ±13 bulan, data kecepatan 90 hari (otomatis)','Anonim, tanpa SDK pihak ketiga, saklar matikan di Privasi','Tim IT (IDEA)',1,1,'Kode perangkat dikaitkan ke identitas.','Tidak disimpan bersama akun; agregasi harian; retensi otomatis.','RENDAH',DATE '2027-04-30',8,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-09','Asisten AI Elsa (Portal admin)','Membantu admin menyusun informasi & laporan dari data gereja.','Jemaat yang datanya relevan dengan pertanyaan admin','Pertanyaan admin & potongan data gereja yang relevan',true,'Kepentingan sah (administrasi), terbatas admin berwenang','Anthropic (AS)','Ya — AS (Anthropic)','Tidak disimpan oleh gereja di luar riwayat percakapan portal','Hanya admin dengan akses menu, S&K Bag. 10 (cek ulang hasil AI), tanpa pelatihan model dari data API','Admin pusat / Tim IT',2,2,'Data pribadi terkirim ke luar negeri lebih banyak dari perlu.','Batasi pertanyaan seperlunya, perjanjian pemrosesan Anthropic, disebut di Kebijakan Privasi.','SEDANG',DATE '2027-04-30',9,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-10','Layar monitor ibadah & event','Menampilkan angka kehadiran & status secara langsung di ruang kontrol.','Jemaat (agregat)','Angka gabungan kehadiran, okupansi, status — tanpa nama/no HP',false,'Kepentingan sah (operasional ibadah)','—','Tidak ada','Tidak disimpan (tampilan langsung)','Kode akses monitor terpisah, hanya angka agregat','Tim Ibadah / IT',1,1,'Kode akses monitor tersebar.','Kode akses di .env bisa diganti, tidak ada data pribadi di layar.','RENDAH',DATE '2027-04-30',10,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(),'P-11','Backup, log & keamanan sistem','Backup database, Audit Log, laporan error, pemantauan server.','Seluruh jemaat & admin','Salinan seluruh database; log aktivitas admin; laporan error teknis',true,'Kewajiban keamanan & kepentingan sah','Penyedia server; pengurus penerima backup bulanan (email)','Tidak ada (file terenkripsi)','Audit Log 1 tahun, laporan error 30 hari, backup sesuai kebutuhan','Backup & Credential terenkripsi AES-256-GCM, kunci di luar server, link unduh bertanda tangan','Tim IT (IDEA)',1,3,'File backup bocor atau kunci enkripsi hilang.','Enkripsi wajib, kunci disimpan pengurus di luar server, kirim backup bulanan off-site, SOP kebocoran.','RENDAH',DATE '2027-04-30',11,CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;

-- RBAC: Fulltimer full access
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'compliance-ropa', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (SELECT 1 FROM "role_menu_access" rma WHERE rma."role_id" = r."id" AND rma."menu_key" = 'compliance-ropa');
