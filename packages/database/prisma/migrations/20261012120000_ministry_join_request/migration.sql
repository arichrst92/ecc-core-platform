-- Ministry join approval (per backend-request-ministry-join-approval.md, 2026-10-12)
-- Manual SQL — hanya perubahan fitur ini. Apply via migrate deploy.

-- In-app notif types
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'MINISTRY_JOIN_REQUESTED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'MINISTRY_JOIN_APPROVED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'MINISTRY_JOIN_REJECTED';

-- Status enum
CREATE TYPE "pelayanan_join_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- Table
CREATE TABLE "pelayanan_join_request" (
    "id" UUID NOT NULL,
    "pelayanan_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "requested_role_id" UUID,
    "motivasi" TEXT,
    "status" "pelayanan_join_status" NOT NULL DEFAULT 'PENDING',
    "approved_role_id" UUID,
    "membership_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pelayanan_join_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pelayanan_join_request_pelayanan_id_status_created_at_idx" ON "pelayanan_join_request"("pelayanan_id", "status", "created_at");
CREATE INDEX "pelayanan_join_request_jemaat_id_pelayanan_id_created_at_idx" ON "pelayanan_join_request"("jemaat_id", "pelayanan_id", "created_at");
-- Maksimal 1 request PENDING per (jemaat, ministry) — cegah double submit.
CREATE UNIQUE INDEX "pelayanan_join_request_one_pending" ON "pelayanan_join_request"("jemaat_id", "pelayanan_id") WHERE "status" = 'PENDING';

ALTER TABLE "pelayanan_join_request" ADD CONSTRAINT "pelayanan_join_request_pelayanan_id_fkey" FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pelayanan_join_request" ADD CONSTRAINT "pelayanan_join_request_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pelayanan_join_request" ADD CONSTRAINT "pelayanan_join_request_requested_role_id_fkey" FOREIGN KEY ("requested_role_id") REFERENCES "pelayanan_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pelayanan_join_request" ADD CONSTRAINT "pelayanan_join_request_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- WA notif config (default nonaktif — aktifkan dari portal)
INSERT INTO "wa_notification_config"
  ("id", "type", "label", "description", "category", "is_enabled", "template", "placeholders", "updated_at")
VALUES
  (gen_random_uuid(), 'MINISTRY_JOIN_REQUESTED',
   'Permintaan Gabung Ministry',
   'Dikirim ke leader ministry saat ada jemaat mengajukan bergabung.',
   'MINISTRY', false,
   E'🙋 *Permintaan Bergabung*\n\nHalo {nama},\n\n*{pemohon}* ingin bergabung ke *{ministry_nama}* sebagai {posisi}.\n\nBuka Els App untuk menyetujui atau menolak.',
   ARRAY['nama','pemohon','ministry_nama','posisi'],
   CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MINISTRY_JOIN_APPROVED',
   'Gabung Ministry Disetujui',
   'Dikirim ke pemohon saat leader menyetujui permintaan bergabung.',
   'MINISTRY', false,
   E'🎉 *Selamat Bergabung*\n\nHalo {nama},\n\nPermintaan Anda bergabung ke *{ministry_nama}* disetujui. Peran Anda: *{posisi}*.',
   ARRAY['nama','ministry_nama','posisi'],
   CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'MINISTRY_JOIN_REJECTED',
   'Gabung Ministry Ditolak',
   'Dikirim ke pemohon saat leader menolak permintaan bergabung.',
   'MINISTRY', false,
   E'Halo {nama},\n\nPermintaan Anda bergabung ke *{ministry_nama}* belum dapat disetujui.{alasan}\n\nAnda dapat mengajukan kembali kapan saja.',
   ARRAY['nama','ministry_nama','alasan'],
   CURRENT_TIMESTAMP)
ON CONFLICT ("type") DO NOTHING;
