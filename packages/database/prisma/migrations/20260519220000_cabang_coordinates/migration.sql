-- Koordinat lat/lng untuk plot di Globe (dashboard).
ALTER TABLE "cabang_gereja"
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

-- Backfill untuk seed-data 3 kota umum (kalau cabang dengan kode tsb ada).
UPDATE "cabang_gereja" SET latitude = -6.2088, longitude = 106.8456 WHERE kode = 'JKT';
UPDATE "cabang_gereja" SET latitude = -6.9175, longitude = 107.6191 WHERE kode = 'BDG';
UPDATE "cabang_gereja" SET latitude = -7.2575, longitude = 112.7521 WHERE kode = 'SBY';
