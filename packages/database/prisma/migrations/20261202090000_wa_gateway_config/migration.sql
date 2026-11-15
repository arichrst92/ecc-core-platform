-- Portal → WhatsApp Config → "Gateway & OTP": switch provider tanpa ubah .env.
-- Kredensial (token / API key) tetap di .env; di sini hanya saklar & pilihan.
-- NULL = ikuti .env (WA_PROVIDER_ORDER, OTP_EMAIL_COPY, ONBOARDING_SKIP_NOHP_OTP).
ALTER TABLE "app_config"
  ADD COLUMN "wa_provider_order"        VARCHAR(40),
  ADD COLUMN "wa_fonnte_enabled"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "wa_starsender_enabled"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "wa_resmi_otp_enabled"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "otp_email_copy"           VARCHAR(10),
  ADD COLUMN "onboarding_skip_nohp_otp" BOOLEAN;

-- Prioritas awal: Resmi.ID (OTP) → Fonnte → StarSender (paling akhir).
UPDATE "app_config" SET "wa_provider_order" = 'fonnte,starsender' WHERE "id" = 'global';
