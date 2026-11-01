-- Koordinat disimpan 7 angka di belakang koma (±1 cm). Bulatkan data lama.
UPDATE "cabang_gereja" SET "latitude" = ROUND("latitude"::numeric, 7)::double precision, "longitude" = ROUND("longitude"::numeric, 7)::double precision
WHERE "latitude" IS NOT NULL OR "longitude" IS NOT NULL;
UPDATE "ibadah" SET "latitude" = ROUND("latitude"::numeric, 7)::double precision, "longitude" = ROUND("longitude"::numeric, 7)::double precision
WHERE "latitude" IS NOT NULL OR "longitude" IS NOT NULL;
UPDATE "event" SET "latitude" = ROUND("latitude"::numeric, 7)::double precision, "longitude" = ROUND("longitude"::numeric, 7)::double precision
WHERE "latitude" IS NOT NULL OR "longitude" IS NOT NULL;
UPDATE "homecell" SET "latitude" = ROUND("latitude"::numeric, 7)::double precision, "longitude" = ROUND("longitude"::numeric, 7)::double precision
WHERE "latitude" IS NOT NULL OR "longitude" IS NOT NULL;
-- Link cabang hasil migrasi sebelumnya (dari koordinat) disamakan dengan koordinat yang sudah dibulatkan.
UPDATE "cabang_gereja"
SET "maps_url" = 'https://www.google.com/maps/search/?api=1&query=' || "latitude"::text || ',' || "longitude"::text
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL
  AND "maps_url" ~ '^https://www\.google\.com/maps/search/\?api=1&query=-?[0-9.]+,-?[0-9.]+$';
