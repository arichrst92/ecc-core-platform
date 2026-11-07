-- Local Market (2.4.7): jumlah kunjungan usaha & item katalog.
ALTER TABLE "local_business" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "local_business_item" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
