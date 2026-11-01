-- Perkiraan titik rumah jemaat dari alamat (peta sebaran Map View) — 2.4.5
CREATE TABLE "jemaat_geocode" (
    "jemaat_id" UUID NOT NULL,
    "alamat_hash" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'nominatim',
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "jemaat_geocode_pkey" PRIMARY KEY ("jemaat_id")
);
CREATE INDEX "jemaat_geocode_status_idx" ON "jemaat_geocode"("status");
ALTER TABLE "jemaat_geocode" ADD CONSTRAINT "jemaat_geocode_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
