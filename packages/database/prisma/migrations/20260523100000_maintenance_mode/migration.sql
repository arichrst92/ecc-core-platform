-- ============================================================
-- Maintenance Mode — singleton row untuk global on/off flag
-- ============================================================

CREATE TABLE "maintenance_mode" (
  -- TEXT (bukan VARCHAR(50)) supaya match Prisma compile output untuk
  -- `id String @id @default("global")` tanpa @db qualifier. Avoid drift
  -- + auto-generated ALTER migration saat dev run prisma migrate.
  "id"                  TEXT NOT NULL DEFAULT 'global',
  "is_enabled"          BOOLEAN NOT NULL DEFAULT false,
  "message"             TEXT,
  "started_at"          TIMESTAMP(3),
  "estimated_end_at"    TIMESTAMP(3),
  "updated_by_user_id"  UUID,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "maintenance_mode_pkey" PRIMARY KEY ("id")
);

-- Seed singleton row dengan id='global'. Selanjutnya admin upsert
-- by id='global'. Idempotent — kalau row sudah ada (re-run migration di
-- fresh DB yg sudah ada data lain), skip.
INSERT INTO "maintenance_mode" ("id", "is_enabled", "message", "updated_at")
VALUES ('global', false, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- RBAC backfill — Fulltimer dapat full access menu 'maintenance-mode'.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'maintenance-mode', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'maintenance-mode'
  );
