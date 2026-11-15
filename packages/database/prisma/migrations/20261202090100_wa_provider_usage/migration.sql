-- Fungsi tiap provider WhatsApp non-official: 'otp' | 'notif' | 'both'.
-- Prioritas tetap mengikuti urutan (Resmi.ID → Fonnte → StarSender);
-- provider dilewati untuk jenis pesan yang bukan fungsinya.
-- Resmi.ID selalu OTP saja (template Authentication).
ALTER TABLE "app_config"
  ADD COLUMN "wa_fonnte_usage"     VARCHAR(10) NOT NULL DEFAULT 'both',
  ADD COLUMN "wa_starsender_usage" VARCHAR(10) NOT NULL DEFAULT 'both';
