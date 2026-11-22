-- Teks app (override label Els App tanpa build baru).
ALTER TABLE "app_config" ADD COLUMN IF NOT EXISTS "app_text_overrides" JSONB;
