-- Local Market (2.4.7): link toko/produk di marketplace & link Google Maps usaha.
ALTER TABLE "local_business" ADD COLUMN "marketplace_links" JSONB;
ALTER TABLE "local_business" ADD COLUMN "maps_url" TEXT;
ALTER TABLE "local_business_item" ADD COLUMN "marketplace_links" JSONB;
