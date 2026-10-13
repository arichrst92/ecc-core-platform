-- File materi jadwal homecell + approval join group (2026-10-13)
-- Manual SQL — hanya perubahan fitur ini. Apply via migrate deploy.

ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'GROUP_JOIN_REQUESTED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'GROUP_JOIN_APPROVED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'GROUP_JOIN_REJECTED';

-- File materi pertemuan homecell
CREATE TABLE "homecell_schedule_file" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "nama" VARCHAR(200) NOT NULL,
    "deskripsi" TEXT,
    "file_url" TEXT NOT NULL,
    "file_mime" VARCHAR(150) NOT NULL,
    "file_name" VARCHAR(255),
    "file_size" INTEGER,
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homecell_schedule_file_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "homecell_schedule_file_schedule_id_idx" ON "homecell_schedule_file"("schedule_id");
ALTER TABLE "homecell_schedule_file" ADD CONSTRAINT "homecell_schedule_file_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "homecell_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_schedule_file" ADD CONSTRAINT "homecell_schedule_file_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Permintaan bergabung group
CREATE TYPE "group_join_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TABLE "group_join_request" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "via" VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
    "pesan" VARCHAR(500),
    "status" "group_join_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_join_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "group_join_request_group_id_status_created_at_idx" ON "group_join_request"("group_id", "status", "created_at");
CREATE INDEX "group_join_request_jemaat_id_status_idx" ON "group_join_request"("jemaat_id", "status");
CREATE UNIQUE INDEX "group_join_request_one_pending" ON "group_join_request"("jemaat_id", "group_id") WHERE "status" = 'PENDING';
ALTER TABLE "group_join_request" ADD CONSTRAINT "group_join_request_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "church_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_join_request" ADD CONSTRAINT "group_join_request_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_join_request" ADD CONSTRAINT "group_join_request_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
