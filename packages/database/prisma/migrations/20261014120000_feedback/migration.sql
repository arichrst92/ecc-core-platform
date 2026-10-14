-- Kritik & Saran jemaat (2026-10-14). Manual SQL.

ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'FEEDBACK_REPLIED';

CREATE TYPE "feedback_tipe" AS ENUM ('KRITIK', 'SARAN');
CREATE TYPE "feedback_status" AS ENUM ('BARU', 'DIPROSES', 'SELESAI');

CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "cabang_id" UUID,
    "tipe" "feedback_tipe" NOT NULL,
    "kategori" VARCHAR(30) NOT NULL,
    "isi" TEXT NOT NULL,
    "status" "feedback_status" NOT NULL DEFAULT 'BARU',
    "app_info" VARCHAR(200),
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unread_for_user" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "feedback_status_last_activity_at_idx" ON "feedback"("status", "last_activity_at");
CREATE INDEX "feedback_jemaat_id_created_at_idx" ON "feedback"("jemaat_id", "created_at");
CREATE INDEX "feedback_cabang_id_idx" ON "feedback"("cabang_id");
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "feedback_reply" (
    "id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "author_jemaat_id" UUID,
    "from_admin" BOOLEAN NOT NULL,
    "isi" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_reply_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "feedback_reply_feedback_id_created_at_idx" ON "feedback_reply"("feedback_id", "created_at");
ALTER TABLE "feedback_reply" ADD CONSTRAINT "feedback_reply_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "feedback"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_reply" ADD CONSTRAINT "feedback_reply_author_jemaat_id_fkey" FOREIGN KEY ("author_jemaat_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
