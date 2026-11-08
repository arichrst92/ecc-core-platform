-- Local Market (2.4.7): partner usaha (undangan → diterima, hak sama dengan pemilik).
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'BUSINESS_PARTNER_INVITED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'BUSINESS_PARTNER_ACCEPTED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'BUSINESS_PARTNER_REJECTED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'BUSINESS_PARTNER_REMOVED';

CREATE TYPE "local_partner_status" AS ENUM ('PENDING', 'ACCEPTED');

CREATE TABLE "local_business_partner" (
    "id" UUID NOT NULL,
    "business_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "status" "local_partner_status" NOT NULL DEFAULT 'PENDING',
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "local_business_partner_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "local_business_partner_business_id_jemaat_id_key" ON "local_business_partner"("business_id", "jemaat_id");
CREATE INDEX "local_business_partner_jemaat_id_status_idx" ON "local_business_partner"("jemaat_id", "status");

ALTER TABLE "local_business_partner" ADD CONSTRAINT "local_business_partner_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "local_business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "local_business_partner" ADD CONSTRAINT "local_business_partner_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "local_business_partner" ADD CONSTRAINT "local_business_partner_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
