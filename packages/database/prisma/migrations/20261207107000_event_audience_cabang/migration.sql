-- Audiens event: pelayanan per cabang (NULL = semua cabang). Satu pelayanan boleh
-- muncul beberapa kali dengan cabang/level berbeda → unique (event, pelayanan) dilepas.
ALTER TABLE "event_audience_pelayanan" ADD COLUMN IF NOT EXISTS "cabang_id" UUID;
DO $$ BEGIN
  ALTER TABLE "event_audience_pelayanan" ADD CONSTRAINT "event_audience_pelayanan_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP INDEX IF EXISTS "event_audience_pelayanan_event_id_pelayanan_id_key";
CREATE INDEX IF NOT EXISTS "event_audience_pelayanan_event_id_idx" ON "event_audience_pelayanan" ("event_id");
