-- Titik lokasi ibadah & event + radius self check-in (2026-10-14).
-- self_checkin_radius_m NULL = self check-in boleh di mana saja.
ALTER TABLE "ibadah" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "ibadah" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "ibadah" ADD COLUMN "maps_url" TEXT;
ALTER TABLE "event" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "event" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "event" ADD COLUMN "maps_url" TEXT;
ALTER TABLE "ibadah" ADD COLUMN "self_checkin_radius_m" INTEGER;
ALTER TABLE "event" ADD COLUMN "self_checkin_radius_m" INTEGER;
