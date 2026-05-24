-- ============================================================
-- Guest Mode Public Endpoints — schema additions
-- ============================================================
-- Backend response untuk 2 mobile requests (2026-05-24):
--   1. backend-request-public-endpoints-for-guest.md (M24+M25)
--   2. backend-request-signup-role-assignment.md (M23.2 revised)
--
-- Changes:
--   * ALTER ibadah   ADD is_public BOOLEAN DEFAULT true
--   * ALTER event    ADD is_public BOOLEAN DEFAULT true
--   * Seed sub_role "New Comer" under role Jemaat (idempotent)

-- ============================================================
-- 1. Ibadah — is_public flag untuk guest browse
-- ============================================================
ALTER TABLE "ibadah" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true;

-- Index untuk public query yg filter isActive + isPublic (covered partial).
CREATE INDEX "idx_ibadah_public_browse"
  ON "ibadah"("cabang_id", "tanggal_mulai")
  WHERE "is_active" = true AND "is_public" = true;

-- ============================================================
-- 2. Event — is_public flag untuk guest browse
-- ============================================================
ALTER TABLE "event" ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true;

-- Index untuk public query yg filter published + active + public + future.
CREATE INDEX "idx_event_public_browse"
  ON "event"("cabang_id", "tanggal_mulai" DESC)
  WHERE "is_active" = true AND "is_public" = true AND "is_published" = true;

-- ============================================================
-- 3. Seed sub_role "New Comer" untuk role Jemaat
-- ============================================================
-- Untuk POST /auth/register dengan field `jenisJemaat=NEW_COMER`.
-- Idempotent — kalau sub_role nama 'New Comer' under role 'Jemaat' sudah ada,
-- skip. Pakai INSERT...SELECT...WHERE NOT EXISTS pattern (unique constraint
-- di sub_role table belum tentu ada, jadi pakai conditional insert).
INSERT INTO "sub_role" ("id", "role_id", "nama", "deskripsi", "is_active", "updated_at")
SELECT
  gen_random_uuid(),
  r."id",
  'New Comer',
  'Jemaat baru yang belum tetap. Otomatis di-assign saat signup dengan jenisJemaat=NEW_COMER. Bisa di-promote ke Jemaat Tetap oleh admin cabang.',
  true,
  CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'jemaat'
  AND NOT EXISTS (
    SELECT 1 FROM "sub_role" sr
    WHERE sr."role_id" = r."id" AND LOWER(sr."nama") = 'new comer'
  );

-- Seed sub_role "Jemaat Tetap" juga (kalau belum ada — defensive).
INSERT INTO "sub_role" ("id", "role_id", "nama", "deskripsi", "is_active", "updated_at")
SELECT
  gen_random_uuid(),
  r."id",
  'Jemaat Tetap',
  'Jemaat tetap cabang. Default sub-role untuk signup dengan jenisJemaat=JEMAAT_TETAP (atau backwards-compat tanpa field).',
  true,
  CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'jemaat'
  AND NOT EXISTS (
    SELECT 1 FROM "sub_role" sr
    WHERE sr."role_id" = r."id" AND LOWER(sr."nama") = 'jemaat tetap'
  );
