-- ============================================================
-- Credential — vault untuk simpan third-party credentials
-- ============================================================

CREATE TABLE "credential" (
  "id"                  UUID NOT NULL,
  "nama"                VARCHAR(255) NOT NULL,
  "email"               VARCHAR(255),
  "username"            VARCHAR(255),
  "no_hp_terdaftar"     VARCHAR(100),
  "link_akses"          TEXT,
  "recovery_email"      VARCHAR(255),
  "catatan"             TEXT,
  "created_by_user_id"  UUID,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "credential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credential_nama_idx" ON "credential"("nama");

-- RBAC backfill — Fulltimer dapat full access menu 'credential'.
-- Tambahan layer master-password gate di portal (di luar RBAC).
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'credential', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'credential'
  );
