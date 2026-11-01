-- Titik rumah jemaat harus dekat cabangnya. Titik lama yang > 50 km dari
-- cabang (mis. jemaat Bandung terpetakan di Jakarta) langsung disembunyikan;
-- semua alamat tetap diproses ulang bertahap dengan aturan baru (nominatim-v2).
UPDATE "jemaat_geocode" g
SET "status" = 'TOO_FAR', "latitude" = NULL, "longitude" = NULL
FROM "jemaat" j
JOIN "cabang_gereja" c ON c."id" = j."cabang_id"
WHERE g."jemaat_id" = j."id"
  AND g."status" = 'OK'
  AND (
    c."latitude" IS NULL OR c."longitude" IS NULL
    OR 6371 * 2 * ASIN(SQRT(
         POWER(SIN(RADIANS(g."latitude" - c."latitude") / 2), 2)
         + COS(RADIANS(c."latitude")) * COS(RADIANS(g."latitude"))
           * POWER(SIN(RADIANS(g."longitude" - c."longitude") / 2), 2)
       )) > 50
  );
