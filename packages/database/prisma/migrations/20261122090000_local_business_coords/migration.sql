-- Local Market: titik lokasi usaha (dari link Google Maps) untuk Map View.
ALTER TABLE "local_business" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "local_business" ADD COLUMN "longitude" DOUBLE PRECISION;
