-- Ikon & warna aksen pelayanan (dipilih di Portal, tampil di app & Portal).
ALTER TABLE "pelayanan" ADD COLUMN IF NOT EXISTS "ikon" VARCHAR(40);
ALTER TABLE "pelayanan" ADD COLUMN IF NOT EXISTS "warna" VARCHAR(20);
