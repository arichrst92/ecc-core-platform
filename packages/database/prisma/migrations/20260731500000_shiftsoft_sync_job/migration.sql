-- ============================================================
-- Module 25: ShiftsoftSyncJob
--
-- Track sync job trigger dari portal Developer Tools (fitur Shiftsoft Sync UI).
-- Setiap POST /admin/shiftsoft-sync bikin row baru → spawn tsx script async →
-- update status + logTail + result JSON saat selesai.
-- ============================================================

CREATE TYPE "sync_phase" AS ENUM ('JEMAAT', 'GROUP', 'CLEANUP', 'SEED_CABANG');
CREATE TYPE "sync_status" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

CREATE TABLE "shiftsoft_sync_job" (
  "id"               UUID          NOT NULL,
  "phase"            "sync_phase"  NOT NULL,
  "tenant_slug"      VARCHAR(32)   NOT NULL,
  "options"          JSONB         NOT NULL DEFAULT '{}'::jsonb,
  "status"           "sync_status" NOT NULL DEFAULT 'RUNNING',
  "result"           JSONB,
  "log_tail"         TEXT,
  "error_message"    TEXT,
  "triggered_by_id"  UUID          NOT NULL,
  "started_at"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at"      TIMESTAMP(3),

  CONSTRAINT "shiftsoft_sync_job_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shiftsoft_sync_job_status_idx" ON "shiftsoft_sync_job"("status");
CREATE INDEX "shiftsoft_sync_job_tenant_slug_idx" ON "shiftsoft_sync_job"("tenant_slug");
CREATE INDEX "shiftsoft_sync_job_started_at_idx" ON "shiftsoft_sync_job"("started_at" DESC);

ALTER TABLE "shiftsoft_sync_job"
  ADD CONSTRAINT "shiftsoft_sync_job_triggered_by_id_fkey"
  FOREIGN KEY ("triggered_by_id") REFERENCES "jemaat"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- RBAC backfill — Fulltimer dapat FULL access menu 'shiftsoft-sync'.
-- ============================================================
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'shiftsoft-sync', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'shiftsoft-sync'
  );
