-- Jendela registrasi & self check-in per ibadah / event (NULL = aturan bawaan:
-- daftar tutup saat mulai, self check-in 15 menit sebelum mulai s.d. 30 menit setelah selesai).
ALTER TABLE "ibadah" ADD COLUMN IF NOT EXISTS "registrasi_tutup_menit" INTEGER;
ALTER TABLE "ibadah" ADD COLUMN IF NOT EXISTS "checkin_buka_menit" INTEGER;
ALTER TABLE "ibadah" ADD COLUMN IF NOT EXISTS "checkin_tutup_menit" INTEGER;
ALTER TABLE "ibadah" ADD COLUMN IF NOT EXISTS "checkin_tutup_acuan" VARCHAR(5);
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "registrasi_tutup_menit" INTEGER;
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "checkin_buka_menit" INTEGER;
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "checkin_tutup_menit" INTEGER;
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "checkin_tutup_acuan" VARCHAR(5);
