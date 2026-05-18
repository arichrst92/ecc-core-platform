-- CreateEnum
CREATE TYPE "konten_tipe" AS ENUM ('NEWS', 'RENUNGAN');

-- CreateTable
CREATE TABLE "konten" (
    "id" UUID NOT NULL,
    "tipe" "konten_tipe" NOT NULL,
    "judul" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(280) NOT NULL,
    "ringkasan" TEXT,
    "konten" TEXT NOT NULL,
    "hero_image_url" TEXT,
    "sinode_id" UUID,
    "cabang_id" UUID,
    "tanggal" DATE,
    "ayat_alkitab" VARCHAR(255),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "author_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "konten_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "konten_slug_key" ON "konten"("slug");

-- CreateIndex
CREATE INDEX "konten_tipe_idx" ON "konten"("tipe");

-- CreateIndex
CREATE INDEX "konten_sinode_id_idx" ON "konten"("sinode_id");

-- CreateIndex
CREATE INDEX "konten_cabang_id_idx" ON "konten"("cabang_id");

-- CreateIndex
CREATE INDEX "konten_is_published_published_at_idx" ON "konten"("is_published", "published_at");

-- CreateIndex
CREATE INDEX "konten_tanggal_idx" ON "konten"("tanggal");

-- CreateIndex
CREATE INDEX "konten_slug_idx" ON "konten"("slug");

-- AddForeignKey
ALTER TABLE "konten" ADD CONSTRAINT "konten_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "konten" ADD CONSTRAINT "konten_sinode_id_fkey" FOREIGN KEY ("sinode_id") REFERENCES "sinode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "konten" ADD CONSTRAINT "konten_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
