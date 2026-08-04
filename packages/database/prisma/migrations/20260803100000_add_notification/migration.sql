-- Modul 30 — In-App Notification Feed
-- Terpisah dari notification_log (queue outbound WA).

CREATE TYPE "in_app_notif_type" AS ENUM (
  'CKIDS_CHECKIN',
  'CKIDS_PICKUP',
  'GIFT_REDEEMED',
  'POINT_EARNED',
  'POINT_ADJUSTED',
  'FAMILY_LINKED'
);

CREATE TABLE IF NOT EXISTS "notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "jemaat_id" UUID NOT NULL,
  "type" "in_app_notif_type" NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" TEXT NOT NULL,
  "action_url" VARCHAR(500),
  "metadata" JSONB,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_jemaat_id_created_at_idx"
  ON "notification"("jemaat_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "notification_jemaat_id_read_at_idx"
  ON "notification"("jemaat_id", "read_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notification_jemaat_id_fkey'
  ) THEN
    ALTER TABLE "notification"
      ADD CONSTRAINT "notification_jemaat_id_fkey"
      FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
