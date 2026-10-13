-- Hero image group + pengumuman & voting homecell (2026-10-13). Manual SQL.

ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'HOMECELL_ANNOUNCEMENT';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'HOMECELL_POLL_CREATED';

ALTER TABLE "church_group" ADD COLUMN "hero_image_url" TEXT;

CREATE TABLE "homecell_announcement" (
    "id" UUID NOT NULL,
    "homecell_id" UUID NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "isi" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "homecell_announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "homecell_announcement_homecell_id_is_pinned_created_at_idx" ON "homecell_announcement"("homecell_id", "is_pinned", "created_at");
ALTER TABLE "homecell_announcement" ADD CONSTRAINT "homecell_announcement_homecell_id_fkey" FOREIGN KEY ("homecell_id") REFERENCES "homecell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_announcement" ADD CONSTRAINT "homecell_announcement_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "homecell_poll" (
    "id" UUID NOT NULL,
    "homecell_id" UUID NOT NULL,
    "pertanyaan" VARCHAR(300) NOT NULL,
    "deskripsi" TEXT,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "closes_at" TIMESTAMP(3),
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "homecell_poll_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "homecell_poll_homecell_id_created_at_idx" ON "homecell_poll"("homecell_id", "created_at");
ALTER TABLE "homecell_poll" ADD CONSTRAINT "homecell_poll_homecell_id_fkey" FOREIGN KEY ("homecell_id") REFERENCES "homecell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_poll" ADD CONSTRAINT "homecell_poll_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "homecell_poll_option" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "homecell_poll_option_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "homecell_poll_option_poll_id_idx" ON "homecell_poll_option"("poll_id");
ALTER TABLE "homecell_poll_option" ADD CONSTRAINT "homecell_poll_option_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "homecell_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "homecell_poll_vote" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "homecell_poll_vote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "homecell_poll_vote_poll_id_option_id_jemaat_id_key" ON "homecell_poll_vote"("poll_id", "option_id", "jemaat_id");
CREATE INDEX "homecell_poll_vote_poll_id_jemaat_id_idx" ON "homecell_poll_vote"("poll_id", "jemaat_id");
ALTER TABLE "homecell_poll_vote" ADD CONSTRAINT "homecell_poll_vote_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "homecell_poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_poll_vote" ADD CONSTRAINT "homecell_poll_vote_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "homecell_poll_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_poll_vote" ADD CONSTRAINT "homecell_poll_vote_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
