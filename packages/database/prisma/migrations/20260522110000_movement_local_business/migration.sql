-- ============================================================
-- Movement — Local Market (Bisnis Jemaat / UMKM directory)
-- ============================================================

-- Enum tipe bisnis
CREATE TYPE "tipe_bisnis" AS ENUM ('B2C', 'B2B', 'B2B2C');

-- Tabel local_business
CREATE TABLE "local_business" (
  "id"                  UUID NOT NULL,
  "owner_jemaat_id"     UUID NOT NULL,
  "nama"                VARCHAR(255) NOT NULL,
  "deskripsi"           TEXT,
  "hero_image_url"      TEXT,
  "industri"            VARCHAR(100),
  "tipe_bisnis"         "tipe_bisnis" NOT NULL,
  "is_online"           BOOLEAN NOT NULL DEFAULT false,
  "lokasi"              TEXT,
  "website_url"         TEXT,
  "whatsapp_url"        TEXT,
  "company_profile_url" TEXT,
  -- social_links: JSONB array of { platform: string, url: string }
  "social_links"        JSONB,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "local_business_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "local_business_owner_jemaat_id_idx" ON "local_business"("owner_jemaat_id");
CREATE INDEX "local_business_nama_idx"            ON "local_business"("nama");
CREATE INDEX "local_business_industri_idx"        ON "local_business"("industri");
CREATE INDEX "local_business_tipe_bisnis_idx"     ON "local_business"("tipe_bisnis");

ALTER TABLE "local_business"
  ADD CONSTRAINT "local_business_owner_jemaat_id_fkey"
  FOREIGN KEY ("owner_jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- RBAC backfill — Fulltimer dapat full access 'local-business'.
-- ============================================================
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'local-business', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'local-business'
  );
