-- ============================================================
-- App Version — Update check per platform untuk mobile
-- ============================================================

CREATE TYPE "app_platform" AS ENUM ('IOS', 'ANDROID');

CREATE TABLE "app_version" (
  "id"                       UUID NOT NULL,
  "platform"                 "app_platform" NOT NULL,
  "latest_version"           VARCHAR(20) NOT NULL,
  "min_supported_version"    VARCHAR(20) NOT NULL,
  "release_notes"            TEXT,
  "download_url"             TEXT NOT NULL,
  "is_published"             BOOLEAN NOT NULL DEFAULT false,
  "published_at"             TIMESTAMP(3),
  "published_by_user_id"     UUID,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_version_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_version_platform_is_published_idx"
  ON "app_version"("platform", "is_published");

-- RBAC backfill — Fulltimer dapat full access 'app-version'.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'app-version', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'app-version'
  );
