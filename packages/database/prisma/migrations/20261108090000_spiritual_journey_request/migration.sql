-- Request update Spiritual Journey dari app (2.4.6) + notifikasi hasilnya.
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'SPIRITUAL_JOURNEY_APPROVED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'SPIRITUAL_JOURNEY_REJECTED';

CREATE TYPE "spiritual_journey_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "spiritual_journey_request" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "catatan" TEXT,
    "status" "spiritual_journey_request_status" NOT NULL DEFAULT 'PENDING',
    "alasan_tolak" TEXT,
    "reviewed_by_jemaat_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spiritual_journey_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "spiritual_journey_request_status_created_at_idx" ON "spiritual_journey_request"("status", "created_at");
CREATE INDEX "spiritual_journey_request_jemaat_id_idx" ON "spiritual_journey_request"("jemaat_id");
ALTER TABLE "spiritual_journey_request" ADD CONSTRAINT "spiritual_journey_request_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spiritual_journey_request" ADD CONSTRAINT "spiritual_journey_request_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "spiritual_journey_step"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "spiritual_journey_request" ADD CONSTRAINT "spiritual_journey_request_reviewed_by_jemaat_id_fkey" FOREIGN KEY ("reviewed_by_jemaat_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
