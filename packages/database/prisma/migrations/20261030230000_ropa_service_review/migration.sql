-- Catatan Pemrosesan: tambah aktivitas P-12 Ulasan ibadah & event (tidak menimpa bila sudah ada)
INSERT INTO "processing_activity" ("id","kode","nama","tujuan","subjek_data","kategori_data","data_sensitif","dasar_hukum","penerima","transfer_luar_negeri","retensi","keamanan","pemilik","risiko_kemungkinan","risiko_dampak","risiko","mitigasi","risiko_sisa","tinjau_berikutnya","urutan","updated_at")
VALUES (gen_random_uuid(), 'P-12', 'Ulasan ibadah & event',
 'Mengumpulkan rating (1–5) dan komentar jemaat setelah ibadah/event untuk evaluasi & perbaikan pelayanan; ditampilkan di portal dan laporan ibadah/event.',
 'Jemaat pemilik tiket reservasi / pendaftaran event',
 'Rating, komentar (bisa memuat pengalaman pribadi), pilihan anonim, ibadah/event & tanggal yang diulas, nama pemberi ulasan (disembunyikan bila anonim)',
 true,
 'Persetujuan (ulasan diberikan sukarela) & kepentingan sah (evaluasi pelayanan)',
 'Penyedia server; admin/pengurus dengan akses menu Ibadah, Event, Laporan Ibadah/Event',
 'Tidak ada',
 'Selama data jemaat ada; saat data dihapus permanen, komentar dihapus & ulasan dijadikan anonim',
 'Hanya pemilik tiket, jendela waktu terbatas (acara dimulai s/d 14 hari setelah selesai), opsi anonim (nama tidak dikirim ke portal), Role Access, Audit Log',
 'Tim Ibadah / Panitia Event', 1, 2,
 'Komentar memuat data pribadi/sensitif orang lain atau keluhan yang mengidentifikasi seseorang; nama pemberi ulasan terlihat luas di laporan.',
 'Opsi anonim, komentar hanya untuk pengguna portal berwenang, laporan PDF bertanda dokumen internal, hapus/samarkan saat permintaan hapus data.',
 'RENDAH', DATE '2027-04-30', 12, CURRENT_TIMESTAMP)
ON CONFLICT ("kode") DO NOTHING;
