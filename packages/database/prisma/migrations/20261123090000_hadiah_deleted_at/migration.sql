-- Hapus hadiah dari katalog. Hadiah tanpa riwayat redeem dihapus permanen;
-- yang punya riwayat redeem ditandai deleted_at (riwayat point tetap utuh).
ALTER TABLE "hadiah_katalog" ADD COLUMN "deleted_at" TIMESTAMP(3);
