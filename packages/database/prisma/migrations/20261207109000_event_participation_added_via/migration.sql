-- Peserta event yang didaftarkan langsung oleh admin di Portal (ditandai walk-in).
ALTER TABLE "event_participation" ADD COLUMN IF NOT EXISTS "added_via" VARCHAR(20);
