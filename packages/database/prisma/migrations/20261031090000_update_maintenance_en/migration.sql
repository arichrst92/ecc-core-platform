-- Teks bahasa Inggris untuk popup update & layar maintenance di app
ALTER TABLE "maintenance_mode" ADD COLUMN IF NOT EXISTS "message_en" TEXT;
ALTER TABLE "app_version" ADD COLUMN IF NOT EXISTS "release_notes_en" TEXT;
