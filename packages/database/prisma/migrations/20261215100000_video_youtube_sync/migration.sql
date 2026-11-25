-- Video Channel: sinkron channel YouTube ECC (2026-12)
ALTER TABLE "video" ADD COLUMN "sumber" VARCHAR(10) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "video" ADD COLUMN "source_playlist_id" VARCHAR(64);
ALTER TABLE "video" ADD COLUMN "yt_unavailable_at" TIMESTAMP(3);
CREATE INDEX "video_sumber_source_playlist_id_idx" ON "video"("sumber", "source_playlist_id");

CREATE TABLE "video_youtube_source" (
    "id" UUID NOT NULL,
    "channel_key" VARCHAR(20) NOT NULL,
    "channel_id" VARCHAR(64) NOT NULL,
    "playlist_id" VARCHAR(64) NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "thumbnail_url" TEXT,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "is_uploads" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "kategori_id" UUID,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "last_synced_at" TIMESTAMP(3),
    "missing_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "video_youtube_source_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "video_youtube_source_playlist_id_key" ON "video_youtube_source"("playlist_id");
CREATE INDEX "video_youtube_source_is_enabled_urutan_idx" ON "video_youtube_source"("is_enabled", "urutan");

CREATE TABLE "video_youtube_ignore" (
    "youtube_id" VARCHAR(20) NOT NULL,
    "judul" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_youtube_ignore_pkey" PRIMARY KEY ("youtube_id")
);

CREATE TABLE "video_sync_run" (
    "id" UUID NOT NULL,
    "trigger" VARCHAR(10) NOT NULL,
    "status" VARCHAR(10) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "added" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "hidden" INTEGER NOT NULL DEFAULT 0,
    "playlists" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "by_id" UUID,
    CONSTRAINT "video_sync_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "video_sync_run_started_at_idx" ON "video_sync_run"("started_at");
