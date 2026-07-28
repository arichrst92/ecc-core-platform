-- ============================================================
-- Module 23: GROUP + GroupMember
-- Generic group container — terpisah dari Homecell (module 10).
-- Dipakai untuk import Shiftsoft Circle (family/ministry/community
-- grouping) + future organic community groups.
--
-- Table name: `church_group` (bukan `group` karena SQL reserved word).
-- Prisma `Group` model @@map ke `church_group`.
-- ============================================================

-- Enum jenis group
CREATE TYPE "group_jenis" AS ENUM (
  'FAMILY',         -- Unit keluarga
  'MINISTRY',       -- Tim pelayanan
  'COMMUNITY',      -- Fellowship group
  'HOMECELL_STYLE', -- Homecell-like tapi tidak strict PIC constraint
  'SYSTEM',         -- Internal system group
  'LAINNYA'         -- Fallback
);

-- Church group table (renamed to avoid SQL reserved keyword)
CREATE TABLE "church_group" (
  "id"                          UUID          NOT NULL DEFAULT gen_random_uuid(),
  "cabang_id"                   UUID          NOT NULL,
  "parent_id"                   UUID,
  "nama"                        VARCHAR(200)  NOT NULL,
  "deskripsi"                   TEXT,
  "jenis"                       "group_jenis" NOT NULL DEFAULT 'LAINNYA',
  "alamat"                      TEXT,
  "gps"                         VARCHAR(64),
  "hari"                        "hari_minggu",
  "jam"                         VARCHAR(5),
  "pic_jemaat_id"               UUID,
  "is_active"                   BOOLEAN       NOT NULL DEFAULT true,
  "legacy_shiftsoft_circle_id"  INTEGER,
  "created_at"                  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"                  TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "church_group_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "church_group"
  ADD CONSTRAINT "church_group_cabang_id_fkey"
    FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "church_group_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "church_group"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "church_group_pic_jemaat_id_fkey"
    FOREIGN KEY ("pic_jemaat_id") REFERENCES "jemaat"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "church_group_cabang_id_idx"      ON "church_group"("cabang_id");
CREATE INDEX "church_group_parent_id_idx"      ON "church_group"("parent_id");
CREATE INDEX "church_group_pic_jemaat_id_idx"  ON "church_group"("pic_jemaat_id");
CREATE INDEX "church_group_jenis_idx"          ON "church_group"("jenis");

-- Unique untuk idempotent Shiftsoft sync
CREATE UNIQUE INDEX "church_group_legacy_shiftsoft_circle_id_key"
  ON "church_group"("legacy_shiftsoft_circle_id");

-- GroupMember table
CREATE TABLE "group_member" (
  "id"                UUID          NOT NULL DEFAULT gen_random_uuid(),
  "group_id"          UUID          NOT NULL,
  "jemaat_id"         UUID          NOT NULL,
  "tanggal_bergabung" DATE          NOT NULL DEFAULT CURRENT_DATE,
  "tanggal_keluar"    DATE,
  "is_active"         BOOLEAN       NOT NULL DEFAULT true,
  "catatan"           TEXT,
  "created_at"        TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "group_member_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "group_member"
  ADD CONSTRAINT "group_member_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "church_group"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_member_jemaat_id_fkey"
    FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "group_member_group_id_jemaat_id_key"
  ON "group_member"("group_id", "jemaat_id");
CREATE INDEX "group_member_group_id_idx"  ON "group_member"("group_id");
CREATE INDEX "group_member_jemaat_id_idx" ON "group_member"("jemaat_id");
