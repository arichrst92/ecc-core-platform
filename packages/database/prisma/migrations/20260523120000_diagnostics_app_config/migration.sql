-- ============================================================
-- Diagnostics + App Config — pilot rollout observability
-- ============================================================
-- Backend response untuk 2 mobile requests:
--   1. backend-request-face-confidence-threshold-and-telemetry.md
--   2. backend-request-diagnostics-error-endpoint.md
--
-- 3 tables baru:
--   * app_config        — singleton, tune-able config for mobile
--   * face_telemetry_event — pilot face login funnel + latency
--   * diagnostics_error_event — production runtime error reports

-- ============================================================
-- App Config singleton
-- ============================================================
CREATE TABLE "app_config" (
  "id"                              TEXT NOT NULL DEFAULT 'global',
  "face_match_threshold"            DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "low_confidence_warn_threshold"   DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  "telemetry_sampling_rate"         DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "error_reporting_enabled"         BOOLEAN NOT NULL DEFAULT true,
  "updated_by_user_id"              UUID,
  "created_at"                      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

-- Seed singleton row dengan defaults.
INSERT INTO "app_config" ("id", "updated_at") VALUES ('global', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- ============================================================
-- Face Telemetry Event
-- ============================================================
CREATE TABLE "face_telemetry_event" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id"      UUID NOT NULL,
  "no_hp"           VARCHAR(32),
  "event"           VARCHAR(64) NOT NULL,
  "flow"            VARCHAR(16),
  "outcome"         VARCHAR(16) NOT NULL,
  "failure_reason"  VARCHAR(64),
  "confidence"      DOUBLE PRECISION,
  "duration_ms"     JSONB,
  "device"          JSONB,
  "timestamp"       TIMESTAMPTZ NOT NULL,
  "received_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "face_telemetry_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_face_telemetry_event_timestamp"
  ON "face_telemetry_event"("event", "timestamp" DESC);
CREATE INDEX "idx_face_telemetry_session"
  ON "face_telemetry_event"("session_id");
CREATE INDEX "idx_face_telemetry_no_hp"
  ON "face_telemetry_event"("no_hp") WHERE "no_hp" IS NOT NULL;
CREATE INDEX "idx_face_telemetry_received_at"
  ON "face_telemetry_event"("received_at");

-- ============================================================
-- Diagnostics Error Event — dengan fingerprint generated column
-- ============================================================
CREATE TABLE "diagnostics_error_event" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "type"            VARCHAR(16) NOT NULL DEFAULT 'error',
  "release"         VARCHAR(64) NOT NULL,
  "platform"        VARCHAR(16) NOT NULL,
  "os_version"      VARCHAR(32),
  "app_version"     VARCHAR(32),
  "user_no_hp"      VARCHAR(32),
  "message"         TEXT NOT NULL,
  "stack"           TEXT,
  "error_name"      VARCHAR(64),
  "context"         JSONB,
  "breadcrumbs"     JSONB,
  "timestamp"       TIMESTAMPTZ NOT NULL,
  "received_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Generated column: md5 fingerprint untuk grouping Sentry-style.
  -- error_name + ':' + message → md5 → 32 char hex string.
  -- STORED = computed at insert + saved on disk (faster query, more space).
  "fingerprint"     VARCHAR(32) GENERATED ALWAYS AS (
    md5(COALESCE("error_name", '') || ':' || COALESCE("message", ''))
  ) STORED,
  CONSTRAINT "diagnostics_error_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_diag_error_fingerprint_release"
  ON "diagnostics_error_event"("fingerprint", "release");
CREATE INDEX "idx_diag_error_timestamp"
  ON "diagnostics_error_event"("timestamp" DESC);
CREATE INDEX "idx_diag_error_user_no_hp"
  ON "diagnostics_error_event"("user_no_hp") WHERE "user_no_hp" IS NOT NULL;
CREATE INDEX "idx_diag_error_release_platform"
  ON "diagnostics_error_event"("release", "platform");
CREATE INDEX "idx_diag_error_received_at"
  ON "diagnostics_error_event"("received_at");

-- ============================================================
-- RBAC backfill — Fulltimer dapat full access menu 'diagnostics'
-- ============================================================
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'diagnostics', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'diagnostics'
  );
