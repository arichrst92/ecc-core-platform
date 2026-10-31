-- Ucapan ulang tahun memakai notification_log (dedup per jemaat per tahun).
-- Sebelumnya nilai enum ini belum ada → pencatatan gagal sebelum mengirim.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'BIRTHDAY_GREETING';

-- Bantu cek "nomor yang sama sudah menerima reminder" (dedup per nomor HP).
CREATE INDEX IF NOT EXISTS "notification_log_no_hp_idx" ON "notification_log" ("no_hp");
