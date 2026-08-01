-- ============================================================
-- Modul 27: Kids Ibadah + Kode Jemput
--
-- Extension untuk ibadah anak — pickup code security tracking.
-- Saat check-in child + ibadah.isKidsIbadah=true, backend auto-generate
-- 6-digit code. Parent lihat kode di app, tunjukkan ke admin saat jemput.
-- ============================================================

-- 1. Ibadah.isKidsIbadah — flag ibadah anak
ALTER TABLE "ibadah"
  ADD COLUMN "is_kids_ibadah" BOOLEAN NOT NULL DEFAULT false;

-- 2. Reservasi — pickup fields
ALTER TABLE "reservasi"
  ADD COLUMN "pickup_code" VARCHAR(6),
  ADD COLUMN "picked_up_at" TIMESTAMP(3),
  ADD COLUMN "picked_up_by_jemaat_id" UUID;

-- Unique constraint: pickup_code unique per (ibadah + tanggal) occurrence.
-- NULL allowed multiple (jemaat non-kids ibadah tidak punya code).
-- Pakai partial index untuk enforce hanya kalau pickup_code IS NOT NULL.
CREATE UNIQUE INDEX "reservasi_pickup_code_per_occurrence_key"
  ON "reservasi"("ibadah_id", "tanggal_ibadah", "pickup_code")
  WHERE "pickup_code" IS NOT NULL;

-- Index untuk query "belum di-pickup" (kids masih di dalam)
CREATE INDEX "reservasi_picked_up_at_idx" ON "reservasi"("picked_up_at");

-- FK ke Jemaat untuk pickedUpByJemaatId
ALTER TABLE "reservasi"
  ADD CONSTRAINT "reservasi_picked_up_by_jemaat_id_fkey"
  FOREIGN KEY ("picked_up_by_jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
