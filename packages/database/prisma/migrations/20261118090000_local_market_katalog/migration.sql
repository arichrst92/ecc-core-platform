-- Local Market katalog (2.4.7): item produk/jasa, kontak admin, username sosmed, batas global.
ALTER TABLE "app_config" ADD COLUMN "local_market_max_items" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "local_business" ADD COLUMN "wa_admin" VARCHAR(20);
ALTER TABLE "local_business" ADD COLUMN "email" VARCHAR(255);
ALTER TABLE "local_business" ADD COLUMN "social_usernames" JSONB;

CREATE TYPE "local_item_jenis" AS ENUM ('PRODUK', 'JASA');
CREATE TYPE "local_harga_tipe" AS ENUM ('TETAP', 'MULAI_DARI', 'NEGO');

CREATE TABLE "local_business_item" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "jenis" "local_item_jenis" NOT NULL DEFAULT 'PRODUK',
    "nama" VARCHAR(150) NOT NULL,
    "deskripsi" TEXT,
    "harga_tipe" "local_harga_tipe" NOT NULL DEFAULT 'TETAP',
    "harga" DECIMAL(14,2),
    "mata_uang" VARCHAR(3) NOT NULL DEFAULT 'IDR',
    "satuan" VARCHAR(30),
    "foto_urls" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_hidden_by_admin" BOOLEAN NOT NULL DEFAULT false,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "local_business_item_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "local_business_item_business_id_urutan_idx" ON "local_business_item"("business_id", "urutan");
ALTER TABLE "local_business_item" ADD CONSTRAINT "local_business_item_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "local_business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
