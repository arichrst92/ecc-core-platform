-- place_id Google untuk alamat jalan bisa lebih dari 255 karakter.
ALTER TABLE "jemaat_geocode" ALTER COLUMN "place_id" TYPE TEXT;
