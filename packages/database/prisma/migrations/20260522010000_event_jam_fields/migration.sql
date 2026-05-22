-- ============================================================
-- Event: add jam_mulai / jam_selesai untuk display time range
-- ============================================================
-- Patch 2026-05-22 per request mobile (backend-request-event-time-fields.md).
-- Event butuh display "09:00 - 12:00 WIB" untuk acara dengan jadwal jam
-- spesifik. Sebelumnya tanggalMulai/tanggalSelesai DateTime tapi admin portal
-- cuma input date (no time picker) — jam selalu T00:00:00.
--
-- Pendekatan: pisahkan time dari date supaya:
--   1. Konsisten dengan Ibadah model (jamMulai/jamSelesai string HH:mm)
--   2. Timezone-safe (pure HH:mm string, no UTC conversion ambiguity)
--   3. Nullable: event tanpa jadwal jam spesifik (festival 3 hari) tetap valid
--
-- Backward compat: existing events (jam_mulai NULL) → mobile fallback ke parse
-- ISO dari tanggalMulai (helper formatTimeRange existing).
-- ============================================================

ALTER TABLE "event"
  ADD COLUMN "jam_mulai" VARCHAR(5),
  ADD COLUMN "jam_selesai" VARCHAR(5);

-- Note: no backfill — existing events biarkan NULL. Admin bisa edit per event
-- untuk add jam kalau perlu.
