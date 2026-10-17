-- Cara check-in untuk laporan kehadiran (2026-10-17).
-- SCAN | SELF | WALK_IN | MANUAL ; NULL = data sebelum kolom ini ada.
ALTER TABLE "reservasi" ADD COLUMN "checkin_method" VARCHAR(20);
ALTER TABLE "event_participation" ADD COLUMN "checkin_method" VARCHAR(20);

-- Backfill yang bisa dipastikan: tamu walk-in.
UPDATE "reservasi" SET "checkin_method" = 'WALK_IN' WHERE "guest_source" = 'WALK_IN' AND "status" = 'JOIN';
UPDATE "event_participation" SET "checkin_method" = 'WALK_IN' WHERE "guest_source" = 'WALK_IN' AND "status" = 'HADIR';
