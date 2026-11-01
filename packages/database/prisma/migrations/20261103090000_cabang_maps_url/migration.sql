-- Cabang: link Google Maps (koordinat diisi dari link, seperti ibadah) — 2.4.5
ALTER TABLE "cabang_gereja" ADD COLUMN "maps_url" TEXT;

-- Cabang lama yang sudah punya koordinat → dibuatkan link ke titik yang sama.
UPDATE "cabang_gereja"
SET "maps_url" = 'https://www.google.com/maps/search/?api=1&query=' || "latitude"::text || ',' || "longitude"::text
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "maps_url" IS NULL;
