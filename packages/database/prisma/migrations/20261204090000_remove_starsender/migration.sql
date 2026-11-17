-- StarSender tidak dipakai lagi. Gateway WhatsApp: Resmi.ID (OTP) → Fonnte.
-- Urutan provider (Fonnte/StarSender) ikut dihapus karena tinggal satu provider teks.
ALTER TABLE "app_config"
  DROP COLUMN IF EXISTS "wa_starsender_enabled",
  DROP COLUMN IF EXISTS "wa_starsender_usage",
  DROP COLUMN IF EXISTS "wa_provider_order";

-- Announcement yang memilih StarSender → otomatis (Fonnte).
UPDATE "announcement" SET "wa_provider" = 'auto' WHERE "wa_provider" = 'starsender';
