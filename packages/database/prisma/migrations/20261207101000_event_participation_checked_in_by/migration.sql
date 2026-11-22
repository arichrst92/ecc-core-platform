-- Petugas yang scan / mencatat walk-in peserta event (userId).
ALTER TABLE "event_participation" ADD COLUMN IF NOT EXISTS "checked_in_by" UUID;
