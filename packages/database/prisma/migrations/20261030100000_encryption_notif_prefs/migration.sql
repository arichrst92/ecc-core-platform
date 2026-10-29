-- No.11: kolom rahasia Credential disimpan terenkripsi → butuh TEXT
ALTER TABLE "credential" ALTER COLUMN "email" TYPE TEXT;
ALTER TABLE "credential" ALTER COLUMN "username" TYPE TEXT;
ALTER TABLE "credential" ALTER COLUMN "no_hp_terdaftar" TYPE TEXT;
ALTER TABLE "credential" ALTER COLUMN "recovery_email" TYPE TEXT;

-- No.19: preferensi pesan WhatsApp non-wajib per jemaat
ALTER TABLE "jemaat_privacy" ADD COLUMN "wa_reminders" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "jemaat_privacy" ADD COLUMN "wa_greetings" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "jemaat_privacy" ADD COLUMN "wa_updates" BOOLEAN NOT NULL DEFAULT true;
