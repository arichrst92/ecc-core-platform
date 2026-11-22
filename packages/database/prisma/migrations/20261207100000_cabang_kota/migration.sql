-- Kota cabang untuk label jam "Waktu <kota>" (opsional).
ALTER TABLE "cabang_gereja" ADD COLUMN IF NOT EXISTS "kota" VARCHAR(100);
