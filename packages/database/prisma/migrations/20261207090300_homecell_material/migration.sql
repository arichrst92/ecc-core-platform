-- Homecell Material: materi pertemuan untuk Pastor zona, Zone Leader, PIC & Asisten homecell.
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'HOMECELL_MATERIAL';

CREATE TABLE "homecell_material" (
  "id"             UUID NOT NULL,
  "judul"          VARCHAR(200) NOT NULL,
  "keterangan"     TEXT,
  "file_url"       TEXT NOT NULL,
  "file_mime"      VARCHAR(120) NOT NULL,
  "file_name"      VARCHAR(255),
  "file_size"      INTEGER NOT NULL,
  "berlaku_mulai"  DATE NOT NULL,
  "berlaku_sampai" DATE,
  "is_published"   BOOLEAN NOT NULL DEFAULT false,
  "notify_leaders" BOOLEAN NOT NULL DEFAULT true,
  "notified_at"    TIMESTAMP(3),
  "created_by_id"  UUID,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "homecell_material_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "homecell_material_is_published_berlaku_mulai_idx" ON "homecell_material"("is_published", "berlaku_mulai");
ALTER TABLE "homecell_material" ADD CONSTRAINT "homecell_material_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "homecell_material_cabang" (
  "material_id" UUID NOT NULL,
  "cabang_id"   UUID NOT NULL,
  CONSTRAINT "homecell_material_cabang_pkey" PRIMARY KEY ("material_id", "cabang_id")
);
CREATE INDEX "homecell_material_cabang_cabang_id_idx" ON "homecell_material_cabang"("cabang_id");
ALTER TABLE "homecell_material_cabang" ADD CONSTRAINT "homecell_material_cabang_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "homecell_material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_material_cabang" ADD CONSTRAINT "homecell_material_cabang_cabang_id_fkey"
  FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "homecell_material_download" (
  "id"          UUID NOT NULL,
  "material_id" UUID NOT NULL,
  "jemaat_id"   UUID NOT NULL,
  "count"       INTEGER NOT NULL DEFAULT 1,
  "first_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "homecell_material_download_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "homecell_material_download_material_id_jemaat_id_key" ON "homecell_material_download"("material_id", "jemaat_id");
CREATE INDEX "homecell_material_download_jemaat_id_idx" ON "homecell_material_download"("jemaat_id");
ALTER TABLE "homecell_material_download" ADD CONSTRAINT "homecell_material_download_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "homecell_material"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_material_download" ADD CONSTRAINT "homecell_material_download_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
