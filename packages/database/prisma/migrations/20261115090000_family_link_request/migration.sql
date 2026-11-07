-- Permintaan hubungan keluarga (2.4.7): menambah jemaat berakun harus disetujui.
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'FAMILY_LINK_REQUESTED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'FAMILY_LINK_APPROVED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'FAMILY_LINK_REJECTED';

CREATE TYPE "family_link_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "family_link_request" (
    "id" UUID NOT NULL,
    "requester_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "tipe_relasi_id" UUID NOT NULL,
    "via" VARCHAR(20) NOT NULL,
    "status" "family_link_request_status" NOT NULL DEFAULT 'PENDING',
    "alasan_tolak" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "family_link_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "family_link_request_approver_id_status_idx" ON "family_link_request"("approver_id", "status");
CREATE INDEX "family_link_request_requester_id_status_idx" ON "family_link_request"("requester_id", "status");
CREATE INDEX "family_link_request_target_id_idx" ON "family_link_request"("target_id");
ALTER TABLE "family_link_request" ADD CONSTRAINT "family_link_request_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_link_request" ADD CONSTRAINT "family_link_request_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_link_request" ADD CONSTRAINT "family_link_request_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "family_link_request" ADD CONSTRAINT "family_link_request_tipe_relasi_id_fkey" FOREIGN KEY ("tipe_relasi_id") REFERENCES "tipe_relasi_keluarga"("id") ON DELETE CASCADE ON UPDATE CASCADE;
