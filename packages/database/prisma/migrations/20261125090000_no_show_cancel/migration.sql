-- Alasan pembatalan otomatis: NO_SHOW = tiket tidak dipakai sampai self
-- check-in ditutup (30 menit setelah ibadah/event selesai).
ALTER TABLE "reservasi" ADD COLUMN "cancel_reason" VARCHAR(20);
ALTER TABLE "event_participation" ADD COLUMN "cancel_reason" VARCHAR(20);
