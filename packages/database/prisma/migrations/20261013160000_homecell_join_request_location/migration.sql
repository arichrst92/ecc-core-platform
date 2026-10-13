-- Homecell: lokasi (Google Maps) + permintaan bergabung dari app (2026-10-13)
-- Manual SQL — hanya perubahan fitur ini. Apply via migrate deploy.

ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'HOMECELL_JOIN_REQUESTED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'HOMECELL_JOIN_APPROVED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'HOMECELL_JOIN_REJECTED';

ALTER TABLE "homecell" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "homecell" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "homecell" ADD COLUMN "maps_url" TEXT;

CREATE TYPE "homecell_join_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "homecell_join_request" (
    "id" UUID NOT NULL,
    "homecell_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "pesan" VARCHAR(500),
    "status" "homecell_join_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homecell_join_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "homecell_join_request_homecell_id_status_created_at_idx" ON "homecell_join_request"("homecell_id", "status", "created_at");
CREATE INDEX "homecell_join_request_jemaat_id_status_idx" ON "homecell_join_request"("jemaat_id", "status");
-- Maksimal 1 request PENDING per (jemaat, homecell) — cegah double submit.
CREATE UNIQUE INDEX "homecell_join_request_one_pending" ON "homecell_join_request"("jemaat_id", "homecell_id") WHERE "status" = 'PENDING';

ALTER TABLE "homecell_join_request" ADD CONSTRAINT "homecell_join_request_homecell_id_fkey" FOREIGN KEY ("homecell_id") REFERENCES "homecell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_join_request" ADD CONSTRAINT "homecell_join_request_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_join_request" ADD CONSTRAINT "homecell_join_request_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
