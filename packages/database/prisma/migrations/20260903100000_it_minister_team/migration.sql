-- ============================================================
-- IT Minister Team — assignment jemaat ke divisi + role
-- Per Protokol Departemen IT ECC v0.3 (2026-09-02).
-- ============================================================

CREATE TYPE "it_minister_divisi" AS ENUM (
  'HEAD',
  'COORDINATOR',
  'PRODUCT',
  'DATA',
  'OPERATION'
);

CREATE TYPE "it_minister_role" AS ENUM (
  'HEAD_IT_MINISTER',
  'IT_COORDINATOR',
  'HEAD_PRODUCT',
  'SPECIFIC_PRODUCT',
  'HEAD_DATA',
  'DATA_MEMBER',
  'HEAD_OPERATION',
  'OPERATION_L0',
  'OPERATION_L1',
  'OPERATION_L2'
);

CREATE TABLE "it_minister_team" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "divisi" "it_minister_divisi" NOT NULL,
    "role_title" "it_minister_role" NOT NULL,
    "cabang_id" UUID,
    "product_area" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "it_minister_team_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "it_minister_team_divisi_is_active_idx"
  ON "it_minister_team"("divisi", "is_active");
CREATE INDEX "it_minister_team_jemaat_id_is_active_idx"
  ON "it_minister_team"("jemaat_id", "is_active");
CREATE INDEX "it_minister_team_role_title_is_active_idx"
  ON "it_minister_team"("role_title", "is_active");

ALTER TABLE "it_minister_team"
  ADD CONSTRAINT "it_minister_team_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "it_minister_team"
  ADD CONSTRAINT "it_minister_team_cabang_id_fkey"
  FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
