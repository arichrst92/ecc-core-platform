-- ============================================================
-- NotificationLog — outbound WA reminder dedup + audit
-- ============================================================

CREATE TYPE "notification_type" AS ENUM ('IBADAH_REMINDER', 'EVENT_REMINDER');
CREATE TYPE "notification_status" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "notification_log" (
  "id"            UUID NOT NULL,
  "jemaat_id"     UUID,
  "no_hp"         VARCHAR(20) NOT NULL,
  "type"          "notification_type" NOT NULL,
  "dedup_key"     VARCHAR(255) NOT NULL,
  "status"        "notification_status" NOT NULL DEFAULT 'PENDING',
  "message_body"  TEXT,
  "message_id"    VARCHAR(100),
  "error_reason"  TEXT,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "sent_at"       TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_log_dedup_key_key" ON "notification_log"("dedup_key");
CREATE INDEX "notification_log_jemaat_id_idx"        ON "notification_log"("jemaat_id");
CREATE INDEX "notification_log_type_status_idx"     ON "notification_log"("type", "status");
CREATE INDEX "notification_log_created_at_idx"      ON "notification_log"("created_at");

ALTER TABLE "notification_log"
  ADD CONSTRAINT "notification_log_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- RBAC backfill — Fulltimer dapat full access 'maintenance' menu.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'maintenance', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'maintenance'
  );
