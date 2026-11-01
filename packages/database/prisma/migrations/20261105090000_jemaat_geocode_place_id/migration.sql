-- Google place_id untuk tautan Google Maps jemaat; batas 50 km dari cabang dilepas
-- (hasil "terlalu jauh" lama diproses ulang).
ALTER TABLE "jemaat_geocode" ADD COLUMN "place_id" VARCHAR(255);
UPDATE "jemaat_geocode" SET "status" = 'NOT_FOUND', "provider" = 'reset' WHERE "status" IN ('TOO_FAR', 'NO_CABANG');
