-- Event: wajib daftar (false = boleh langsung hadir tanpa daftar; self check-in & scan usher membuat partisipasi HADIR)
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "wajib_daftar" BOOLEAN NOT NULL DEFAULT true;
