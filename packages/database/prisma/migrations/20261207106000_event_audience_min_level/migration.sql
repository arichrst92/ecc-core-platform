-- Audiens event: level role pelayanan minimal (NULL = semua anggota pelayanan).
ALTER TABLE "event_audience_pelayanan" ADD COLUMN IF NOT EXISTS "min_level" INTEGER;
