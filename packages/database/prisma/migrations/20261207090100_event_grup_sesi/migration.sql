-- Grup sesi event (mis. 3 sesi Natal di hari yang sama): satu jemaat hanya boleh
-- terdaftar aktif di satu event dalam grup. NULL = tanpa grup (perilaku lama).
ALTER TABLE "event" ADD COLUMN "grup_sesi" VARCHAR(80);
CREATE INDEX "event_grup_sesi_idx" ON "event"("grup_sesi");
