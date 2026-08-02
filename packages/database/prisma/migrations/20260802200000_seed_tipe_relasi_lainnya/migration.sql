-- ============================================================
-- Seed TipeRelasiKeluarga "Lainnya"
--
-- Backend reciprocal mapping (family-relation.ts) pakai "Lainnya"
-- sebagai reverse untuk Wali dan symmetric untuk OTHER role.
-- Sebelumnya cuma 11 tipe di seed — tambah "Lainnya" supaya endpoint
-- family gak crash saat receive role=OTHER atau Wali.
-- Idempotent — INSERT IF NOT EXISTS pattern.
-- ============================================================

INSERT INTO "tipe_relasi_keluarga" ("id", "nama", "deskripsi", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), 'Lainnya', 'Relasi keluarga yang tidak spesifik di kategori lain', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "tipe_relasi_keluarga" WHERE "nama" = 'Lainnya'
);
