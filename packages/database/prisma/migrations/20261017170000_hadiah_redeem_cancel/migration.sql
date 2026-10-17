-- Pembatalan penukaran hadiah CKids (point & stok dikembalikan).
ALTER TYPE "point_source" ADD VALUE IF NOT EXISTS 'REDEEM_CANCEL';

ALTER TABLE "hadiah_redeem"
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_by_id" UUID,
  ADD COLUMN "cancel_reason" TEXT,
  ADD COLUMN "replaced_by_redeem_id" UUID;

ALTER TABLE "hadiah_redeem" ADD CONSTRAINT "hadiah_redeem_cancelled_by_id_fkey"
  FOREIGN KEY ("cancelled_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
