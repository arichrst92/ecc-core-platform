-- ECC Worship (2026-10-20)
CREATE TYPE "worship_album_tipe" AS ENUM ('ALBUM', 'SINGLE');
CREATE TYPE "worship_mode" AS ENUM ('VOKAL', 'KARAOKE');
CREATE TYPE "worship_sync_status" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');
CREATE TYPE "worship_sync_quality" AS ENUM ('CEPAT', 'TELITI');

CREATE TABLE "worship_album" (
    "id" UUID NOT NULL,
    "tipe" "worship_album_tipe" NOT NULL DEFAULT 'ALBUM',
    "judul" VARCHAR(200) NOT NULL,
    "tahun" INTEGER,
    "deskripsi" TEXT,
    "cover_url" TEXT,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "worship_album_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "worship_album_tipe_is_published_urutan_idx" ON "worship_album"("tipe", "is_published", "urutan");

CREATE TABLE "worship_song" (
    "id" UUID NOT NULL,
    "album_id" UUID NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "ciptaan" VARCHAR(200),
    "tahun" INTEGER,
    "lirik" TEXT,
    "lirik_sinkron" JSONB,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "audio_file" VARCHAR(255),
    "audio_mime" VARCHAR(50),
    "audio_size" INTEGER,
    "durasi" DOUBLE PRECISION,
    "karaoke_file" VARCHAR(255),
    "karaoke_mime" VARCHAR(50),
    "karaoke_size" INTEGER,
    "karaoke_durasi" DOUBLE PRECISION,
    "plays_vokal" INTEGER NOT NULL DEFAULT 0,
    "plays_karaoke" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "worship_song_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "worship_song_album_id_urutan_idx" ON "worship_song"("album_id", "urutan");
ALTER TABLE "worship_song" ADD CONSTRAINT "worship_song_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "worship_album"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "worship_favorite" (
    "jemaat_id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "worship_favorite_pkey" PRIMARY KEY ("jemaat_id", "song_id")
);
CREATE INDEX "worship_favorite_song_id_idx" ON "worship_favorite"("song_id");
ALTER TABLE "worship_favorite" ADD CONSTRAINT "worship_favorite_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "worship_favorite" ADD CONSTRAINT "worship_favorite_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "worship_song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "worship_play" (
    "id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "jemaat_id" UUID,
    "mode" "worship_mode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "worship_play_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "worship_play_song_id_created_at_idx" ON "worship_play"("song_id", "created_at");
CREATE INDEX "worship_play_created_at_idx" ON "worship_play"("created_at");
ALTER TABLE "worship_play" ADD CONSTRAINT "worship_play_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "worship_song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "worship_download" (
    "id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "jemaat_id" UUID,
    "mode" "worship_mode" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "worship_download_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "worship_download_song_id_created_at_idx" ON "worship_download"("song_id", "created_at");
ALTER TABLE "worship_download" ADD CONSTRAINT "worship_download_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "worship_song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "worship_sync_job" (
    "id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "status" "worship_sync_status" NOT NULL DEFAULT 'QUEUED',
    "quality" "worship_sync_quality" NOT NULL DEFAULT 'CEPAT',
    "stage" VARCHAR(20),
    "progress" INTEGER NOT NULL DEFAULT 0,
    "processed_sec" DOUBLE PRECISION,
    "eta_sec" INTEGER,
    "threads" INTEGER,
    "preview" TEXT,
    "result" JSONB,
    "error" TEXT,
    "requested_by_id" UUID,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "worship_sync_job_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "worship_sync_job_status_created_at_idx" ON "worship_sync_job"("status", "created_at");
CREATE INDEX "worship_sync_job_song_id_created_at_idx" ON "worship_sync_job"("song_id", "created_at");
ALTER TABLE "worship_sync_job" ADD CONSTRAINT "worship_sync_job_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "worship_song"("id") ON DELETE CASCADE ON UPDATE CASCADE;
