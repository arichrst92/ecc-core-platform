-- Konseling (2026-12)
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'KONSELING_ASSIGNED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'KONSELING_SCHEDULED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'KONSELING_UPDATED';

CREATE TABLE "konseling_request" (
  "id" UUID NOT NULL,
  "jemaat_id" UUID NOT NULL,
  "cabang_id" UUID,
  "pokok_masalah" TEXT NOT NULL,
  "harapan" TEXT NOT NULL,
  "jadwal_usulan" TIMESTAMP(3),
  "catatan_jadwal" TEXT,
  "preferensi_gender" VARCHAR(4) NOT NULL DEFAULT 'ANY',
  "kontak_no_hp" VARCHAR(20),
  "kontak_email" VARCHAR(255),
  "kontak_disetujui_at" TIMESTAMP(3) NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'BARU',
  "konselor_id" UUID,
  "assigned_by_id" UUID,
  "assigned_at" TIMESTAMP(3),
  "jadwal_final" TIMESTAMP(3),
  "catatan_konselor" TEXT,
  "selesai_at" TIMESTAMP(3),
  "dibatalkan_at" TIMESTAMP(3),
  "dibatalkan_oleh" VARCHAR(10),
  "alasan_batal" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "konseling_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "konseling_request_jemaat_id_idx" ON "konseling_request"("jemaat_id");
CREATE INDEX "konseling_request_konselor_id_status_idx" ON "konseling_request"("konselor_id", "status");
CREATE INDEX "konseling_request_status_created_at_idx" ON "konseling_request"("status", "created_at");
CREATE INDEX "konseling_request_cabang_id_idx" ON "konseling_request"("cabang_id");

CREATE TABLE "konseling_konselor_pelayanan" (
  "id" UUID NOT NULL,
  "pelayanan_id" UUID NOT NULL,
  "pelayanan_role_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "konseling_konselor_pelayanan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "konseling_konselor_pelayanan_pelayanan_id_pelayanan_role_id_key" ON "konseling_konselor_pelayanan"("pelayanan_id", "pelayanan_role_id");
