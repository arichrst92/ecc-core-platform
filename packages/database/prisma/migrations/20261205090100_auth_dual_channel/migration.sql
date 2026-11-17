-- Login & daftar dua saluran (docs/plan-login-daftar-dua-saluran.md, Fase 1).

-- 1. OTP: nomor HP atau email, saluran pengirim, sasaran & pembuat kode admin.
ALTER TABLE "otp_verification"
  ALTER COLUMN "no_hp" DROP NOT NULL,
  ADD COLUMN "email"              VARCHAR(255),
  ADD COLUMN "provider"           VARCHAR(20),
  ADD COLUMN "jemaat_id"          UUID,
  ADD COLUMN "created_by_user_id" UUID;
ALTER TABLE "otp_verification"
  ADD CONSTRAINT "otp_verification_target_chk" CHECK ("no_hp" IS NOT NULL OR "email" IS NOT NULL);
CREATE INDEX "otp_verification_email_purpose_idx" ON "otp_verification" ("email", "purpose");
CREATE INDEX "otp_verification_provider_created_at_idx" ON "otp_verification" ("provider", "created_at");
CREATE INDEX "otp_verification_jemaat_id_purpose_idx" ON "otp_verification" ("jemaat_id", "purpose");

-- 2. Verifikasi kontak jemaat.
ALTER TABLE "jemaat"
  ADD COLUMN "email_verified_at" TIMESTAMP(3),
  ADD COLUMN "no_hp_source"      VARCHAR(16),
  ADD COLUMN "email_source"      VARCHAR(16);
UPDATE "jemaat" SET "no_hp_source" = 'LEGACY' WHERE "no_hp" IS NOT NULL;
UPDATE "jemaat" SET "email_source" = 'LEGACY' WHERE "email" IS NOT NULL;
-- Email yang pernah dipakai login magic link = terbukti milik jemaat.
UPDATE "jemaat" j SET "email_verified_at" = m.used_at
FROM (
  SELECT "jemaat_id", MIN("used_at") AS used_at
  FROM "magic_link_token" WHERE "used_at" IS NOT NULL GROUP BY "jemaat_id"
) m
WHERE j."id" = m."jemaat_id" AND j."email" IS NOT NULL;

-- 3. Saklar Portal.
ALTER TABLE "app_config"
  ADD COLUMN "otp_enroll_email_legacy" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "email_signup_enabled"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "wa_suspect_threshold"    INTEGER NOT NULL DEFAULT 8;

-- 4. Email huruf kecil — hanya baris yang tidak bentrok (email ganda dirapikan
--    manual lewat konsolidasi; baris bentrok dibiarkan apa adanya).
UPDATE "jemaat" j SET "email" = lower(trim(j."email"))
WHERE j."email" IS NOT NULL
  AND j."email" <> lower(trim(j."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "jemaat" o
    WHERE o."id" <> j."id" AND o."email" IS NOT NULL AND lower(trim(o."email")) = lower(trim(j."email"))
  );

-- 5. Kandidat akun ganda (pendaftar baru mirip data lama).
CREATE TABLE "duplicate_candidate" (
  "id"                  UUID         NOT NULL,
  "new_jemaat_id"       UUID         NOT NULL,
  "old_jemaat_id"       UUID         NOT NULL,
  "score"               DOUBLE PRECISION NOT NULL,
  "reason"              VARCHAR(160) NOT NULL,
  "status"              VARCHAR(12)  NOT NULL DEFAULT 'OPEN',
  "resolved_by_user_id" UUID,
  "resolved_at"         TIMESTAMP(3),
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "duplicate_candidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "duplicate_candidate_new_jemaat_id_old_jemaat_id_key" ON "duplicate_candidate" ("new_jemaat_id", "old_jemaat_id");
CREATE INDEX "duplicate_candidate_status_created_at_idx" ON "duplicate_candidate" ("status", "created_at");
