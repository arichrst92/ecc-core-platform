-- ============================================================
-- RBAC: canAccessPortal di Role/SubRole + tabel menu-access.
-- ============================================================

-- Role.canAccessPortal
ALTER TABLE "role"
  ADD COLUMN "can_access_portal" BOOLEAN NOT NULL DEFAULT false;

-- SubRole.canAccessPortal (nullable = inherit dari role)
ALTER TABLE "sub_role"
  ADD COLUMN "can_access_portal" BOOLEAN;

-- Backfill: role bernama 'Fulltimer' otomatis dapat akses portal.
-- (Sebelum patch ini, gate Fulltimer-only di-enforce di code. Sekarang
-- gate berubah ke canAccessPortal supaya konsisten.)
UPDATE "role" SET "can_access_portal" = true WHERE LOWER("nama") = 'fulltimer';

-- ============================================================
-- RoleMenuAccess
-- ============================================================

CREATE TABLE "role_menu_access" (
  "id"         UUID NOT NULL,
  "role_id"    UUID NOT NULL,
  "menu_key"   VARCHAR(50) NOT NULL,
  "can_read"   BOOLEAN NOT NULL DEFAULT true,
  "can_write"  BOOLEAN NOT NULL DEFAULT false,
  "can_delete" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_menu_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_menu_access_role_id_menu_key_key"
  ON "role_menu_access"("role_id", "menu_key");
CREATE INDEX "role_menu_access_role_id_idx" ON "role_menu_access"("role_id");

ALTER TABLE "role_menu_access"
  ADD CONSTRAINT "role_menu_access_role_id_fkey"
  FOREIGN KEY ("role_id") REFERENCES "role"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: Role 'Fulltimer' dapat FULL access (canRead+canWrite+canDelete)
-- untuk SEMUA menu yang ada di catalog. Daftar key di sini harus sinkron
-- dengan packages/shared-types/src/schemas/menu-catalog.ts.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", k.menu_key, true, true, true, CURRENT_TIMESTAMP
FROM "role" r
CROSS JOIN (VALUES
  ('dashboard'),
  ('sinode'),
  ('cabang'),
  ('jemaat'),
  ('role-jemaat'),
  ('tipe-relasi'),
  ('ibadah'),
  ('kategori-ibadah'),
  ('pelayanan'),
  ('kehadiran'),
  ('homecell-area'),
  ('homecell'),
  ('event'),
  ('news'),
  ('renungan'),
  ('api-key'),
  ('audit-log'),
  ('role-access')
) AS k(menu_key)
WHERE LOWER(r."nama") = 'fulltimer';

-- ============================================================
-- SubRoleMenuAccess
-- ============================================================

CREATE TABLE "sub_role_menu_access" (
  "id"         UUID NOT NULL,
  "sub_role_id" UUID NOT NULL,
  "menu_key"   VARCHAR(50) NOT NULL,
  "can_read"   BOOLEAN NOT NULL DEFAULT true,
  "can_write"  BOOLEAN NOT NULL DEFAULT false,
  "can_delete" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sub_role_menu_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sub_role_menu_access_sub_role_id_menu_key_key"
  ON "sub_role_menu_access"("sub_role_id", "menu_key");
CREATE INDEX "sub_role_menu_access_sub_role_id_idx" ON "sub_role_menu_access"("sub_role_id");

ALTER TABLE "sub_role_menu_access"
  ADD CONSTRAINT "sub_role_menu_access_sub_role_id_fkey"
  FOREIGN KEY ("sub_role_id") REFERENCES "sub_role"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
