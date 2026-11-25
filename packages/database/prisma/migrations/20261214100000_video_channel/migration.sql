-- Video Channel (2026-12)
CREATE TABLE "video_kategori" (
    "id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "video_kategori_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "video_kategori_is_active_urutan_idx" ON "video_kategori"("is_active", "urutan");

CREATE TABLE "video" (
    "id" UUID NOT NULL,
    "youtube_id" VARCHAR(20) NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "deskripsi" TEXT,
    "kategori_id" UUID,
    "channel_nama" VARCHAR(150),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "tayang_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "video_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "video_youtube_id_key" ON "video"("youtube_id");
CREATE INDEX "video_is_published_tayang_at_idx" ON "video"("is_published", "tayang_at");
CREATE INDEX "video_kategori_id_idx" ON "video"("kategori_id");
ALTER TABLE "video" ADD CONSTRAINT "video_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "video_kategori"("id") ON DELETE SET NULL ON UPDATE CASCADE;
