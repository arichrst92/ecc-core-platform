-- Kategori tamu: VISITOR (berkunjung saja) | NEW_COMER (orang baru). NULL = belum ditentukan.
ALTER TABLE "jemaat" ADD COLUMN IF NOT EXISTS "tamu_kategori" VARCHAR(20);
ALTER TABLE "homecell_guest_request" ADD COLUMN IF NOT EXISTS "kategori" VARCHAR(20);
CREATE INDEX IF NOT EXISTS "jemaat_tamu_kategori_idx" ON "jemaat" ("tamu_kategori") WHERE "is_tamu" = true;
