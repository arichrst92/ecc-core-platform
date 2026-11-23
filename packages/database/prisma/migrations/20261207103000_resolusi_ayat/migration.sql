-- Ayat yang ditautkan ke resolusi tahunan (opsional).
ALTER TABLE "resolusi" ADD COLUMN IF NOT EXISTS "ayat_versi" VARCHAR(16);
ALTER TABLE "resolusi" ADD COLUMN IF NOT EXISTS "ayat_kitab" INTEGER;
ALTER TABLE "resolusi" ADD COLUMN IF NOT EXISTS "ayat_bab" INTEGER;
ALTER TABLE "resolusi" ADD COLUMN IF NOT EXISTS "ayat_mulai" INTEGER;
ALTER TABLE "resolusi" ADD COLUMN IF NOT EXISTS "ayat_selesai" INTEGER;
