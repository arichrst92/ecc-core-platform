-- ============================================================
-- Module 24: Magic Link Email Login + Jemaat onboarding state
-- ============================================================
-- Support alternative login path via email (magic link) untuk jemaat
-- legacy dengan noHp missing/invalid tapi email valid.
--
-- Plus track onboarding state di Jemaat.onboardedAt:
--   NULL = wizard belum selesai (first login → wizard)
--   NOT NULL = active user, main app normal
-- ============================================================

-- Add onboardedAt ke jemaat (default NULL — akan di-backfill di bawah)
ALTER TABLE "jemaat"
  ADD COLUMN "onboarded_at" TIMESTAMP(3);

-- Backfill:
--   Legacy jemaat (legacy_shiftsoft_id IS NOT NULL) → tetap NULL, perlu wizard.
--   Non-legacy jemaat (registered via app atau seed baseline) → set now(),
--     karena data mereka sudah lengkap dari register form.
UPDATE "jemaat"
   SET "onboarded_at" = now()
 WHERE "legacy_shiftsoft_id" IS NULL;

-- ============================================================
-- MagicLinkToken table
-- ============================================================
CREATE TABLE "magic_link_token" (
  "id"            UUID          NOT NULL DEFAULT gen_random_uuid(),
  "jemaat_id"     UUID          NOT NULL,
  "email"         VARCHAR(255)  NOT NULL,
  "token"         VARCHAR(64)   NOT NULL,
  "expires_at"    TIMESTAMP(3)  NOT NULL,
  "used_at"       TIMESTAMP(3),
  "requested_ip"  VARCHAR(64),
  "created_at"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "magic_link_token_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "magic_link_token"
  ADD CONSTRAINT "magic_link_token_jemaat_id_fkey"
    FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "magic_link_token_token_key"       ON "magic_link_token"("token");
CREATE INDEX        "magic_link_token_email_idx"       ON "magic_link_token"("email");
CREATE INDEX        "magic_link_token_jemaat_id_idx"   ON "magic_link_token"("jemaat_id");
CREATE INDEX        "magic_link_token_expires_at_idx"  ON "magic_link_token"("expires_at");

-- ============================================================
-- Extend OtpPurpose enum: ONBOARDING_ADD_NOHP
-- Untuk existing jemaat (logged via magic link) add + verify noHp baru.
-- Handler check jemaat sudah authenticated + set jemaat.noHp on verify.
-- ============================================================
ALTER TYPE "otp_purpose" ADD VALUE IF NOT EXISTS 'ONBOARDING_ADD_NOHP';
