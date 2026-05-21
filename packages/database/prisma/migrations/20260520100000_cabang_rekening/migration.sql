-- ============================================================
-- CabangRekening — multi-rekening per cabang dengan purpose + QRIS.
-- ============================================================

CREATE TABLE "cabang_rekening" (
  "id"             UUID NOT NULL,
  "cabang_id"      UUID NOT NULL,
  "purpose"        VARCHAR(255) NOT NULL,
  "bank_nama"      VARCHAR(100) NOT NULL,
  "bank_nomor"     VARCHAR(100) NOT NULL,
  "bank_atas_nama" VARCHAR(255) NOT NULL,
  "qris_image_url" TEXT,
  "catatan"        TEXT,
  "is_active"      BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cabang_rekening_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cabang_rekening_cabang_id_idx" ON "cabang_rekening"("cabang_id");

ALTER TABLE "cabang_rekening"
  ADD CONSTRAINT "cabang_rekening_cabang_id_fkey"
  FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
