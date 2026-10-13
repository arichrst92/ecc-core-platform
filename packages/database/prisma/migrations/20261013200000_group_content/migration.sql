-- Konten group: file, pengumuman, voting (2026-10-13). Manual SQL.

ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'GROUP_ANNOUNCEMENT';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'GROUP_POLL_CREATED';

CREATE TABLE "group_file" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "nama" VARCHAR(200) NOT NULL,
    "deskripsi" TEXT,
    "file_url" TEXT NOT NULL,
    "file_mime" VARCHAR(150) NOT NULL,
    "file_name" VARCHAR(255),
    "file_size" INTEGER,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "group_file_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "group_file_group_id_created_at_idx" ON "group_file"("group_id", "created_at");
ALTER TABLE "group_file" ADD CONSTRAINT "group_file_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "church_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_file" ADD CONSTRAINT "group_file_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "group_announcement" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "isi" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "group_announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "group_announcement_group_id_is_pinned_created_at_idx" ON "group_announcement"("group_id", "is_pinned", "created_at");
ALTER TABLE "group_announcement" ADD CONSTRAINT "group_announcement_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "church_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_announcement" ADD CONSTRAINT "group_announcement_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "group_poll" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "pertanyaan" VARCHAR(300) NOT NULL,
    "deskripsi" TEXT,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "closes_at" TIMESTAMP(3),
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "group_poll_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "group_poll_group_id_created_at_idx" ON "group_poll"("group_id", "created_at");
ALTER TABLE "group_poll" ADD CONSTRAINT "group_poll_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "church_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_poll" ADD CONSTRAINT "group_poll_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "group_poll_option" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "group_poll_option_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "group_poll_option_poll_id_idx" ON "group_poll_option"("poll_id");
ALTER TABLE "group_poll_option" ADD CONSTRAINT "group_poll_option_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "group_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "group_poll_vote" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_poll_vote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "group_poll_vote_poll_id_option_id_jemaat_id_key" ON "group_poll_vote"("poll_id", "option_id", "jemaat_id");
CREATE INDEX "group_poll_vote_poll_id_jemaat_id_idx" ON "group_poll_vote"("poll_id", "jemaat_id");
ALTER TABLE "group_poll_vote" ADD CONSTRAINT "group_poll_vote_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "group_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_poll_vote" ADD CONSTRAINT "group_poll_vote_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "group_poll_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_poll_vote" ADD CONSTRAINT "group_poll_vote_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
