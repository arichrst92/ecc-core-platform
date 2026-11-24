-- Ibadah anak: orang tua / wali boleh self check-in anaknya (default aktif).
ALTER TABLE "ibadah" ADD COLUMN IF NOT EXISTS "allow_kids_self_checkin" BOOLEAN NOT NULL DEFAULT true;
