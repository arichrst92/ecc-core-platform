-- 2.5.0: Kategori → Tugas petugas pelayanan.
CREATE TABLE "pelayanan_tugas_kategori" (
  "id"           UUID NOT NULL,
  "pelayanan_id" UUID NOT NULL,
  "nama"         VARCHAR(60) NOT NULL,
  "ikon"         VARCHAR(40),
  "urutan"       INTEGER NOT NULL DEFAULT 0,
  "is_active"    BOOLEAN NOT NULL DEFAULT true,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pelayanan_tugas_kategori_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pelayanan_tugas_kategori_pelayanan_id_nama_key" ON "pelayanan_tugas_kategori"("pelayanan_id", "nama");
CREATE INDEX "pelayanan_tugas_kategori_pelayanan_id_idx" ON "pelayanan_tugas_kategori"("pelayanan_id");
ALTER TABLE "pelayanan_tugas_kategori" ADD CONSTRAINT "pelayanan_tugas_kategori_pelayanan_id_fkey"
  FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "pelayanan_tugas" (
  "id"          UUID NOT NULL,
  "kategori_id" UUID NOT NULL,
  "nama"        VARCHAR(80) NOT NULL,
  "urutan"      INTEGER NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pelayanan_tugas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pelayanan_tugas_kategori_id_nama_key" ON "pelayanan_tugas"("kategori_id", "nama");
CREATE INDEX "pelayanan_tugas_kategori_id_idx" ON "pelayanan_tugas"("kategori_id");
ALTER TABLE "pelayanan_tugas" ADD CONSTRAINT "pelayanan_tugas_kategori_id_fkey"
  FOREIGN KEY ("kategori_id") REFERENCES "pelayanan_tugas_kategori"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ibadah_pelayanan_petugas" ADD COLUMN "tugas" JSONB;
ALTER TABLE "event_pelayanan_petugas" ADD COLUMN "tugas" JSONB;
