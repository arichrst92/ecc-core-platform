-- Audiens event level pelayanan: event hanya untuk anggota pelayanan tertentu.
CREATE TABLE IF NOT EXISTS "event_audience_pelayanan" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "pelayanan_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_audience_pelayanan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_audience_pelayanan_event_id_pelayanan_id_key" ON "event_audience_pelayanan" ("event_id", "pelayanan_id");
CREATE INDEX IF NOT EXISTS "event_audience_pelayanan_pelayanan_id_idx" ON "event_audience_pelayanan" ("pelayanan_id");
DO $$ BEGIN
  ALTER TABLE "event_audience_pelayanan" ADD CONSTRAINT "event_audience_pelayanan_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "event_audience_pelayanan" ADD CONSTRAINT "event_audience_pelayanan_pelayanan_id_fkey" FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
