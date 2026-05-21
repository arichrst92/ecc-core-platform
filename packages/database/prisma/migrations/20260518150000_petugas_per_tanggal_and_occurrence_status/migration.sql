-- ============================================================
-- 1. Petugas per-tanggal: tambah kolom tanggal_ibadah (nullable)
--    + perbaiki unique constraint supaya support row default
--    (tanggal_ibadah IS NULL) maupun override per-tanggal.
-- ============================================================

ALTER TABLE "ibadah_pelayanan_petugas"
  ADD COLUMN "tanggal_ibadah" DATE;

-- Drop unique key lama yang hanya (link, jemaat); akan diganti dengan
-- composite (link, jemaat, tanggal). Plus partial unique untuk default.
DROP INDEX "ibadah_pelayanan_petugas_ibadah_pelayanan_id_jemaat_id_key";

-- Composite unique: 1 jemaat hanya boleh muncul sekali per (link, tanggal).
-- Karena Postgres treats NULL as distinct, ini secara teknis tidak mencegah
-- duplikat saat tanggal = NULL → ditangani partial unique di bawah.
CREATE UNIQUE INDEX "ibadah_pelayanan_petugas_link_jemaat_tanggal_key"
  ON "ibadah_pelayanan_petugas" ("ibadah_pelayanan_id", "jemaat_id", "tanggal_ibadah");

-- Partial unique untuk row default (tanggal_ibadah IS NULL): 1 jemaat hanya
-- boleh punya 1 row default per link.
CREATE UNIQUE INDEX "ibadah_pelayanan_petugas_link_jemaat_default_key"
  ON "ibadah_pelayanan_petugas" ("ibadah_pelayanan_id", "jemaat_id")
  WHERE "tanggal_ibadah" IS NULL;

-- Index untuk query "petugas pada tanggal X"
CREATE INDEX "ibadah_pelayanan_petugas_link_tanggal_idx"
  ON "ibadah_pelayanan_petugas" ("ibadah_pelayanan_id", "tanggal_ibadah");

-- ============================================================
-- 2. Occurrence override: tandai tanggal tertentu dari ibadah recurring
--    sebagai DITIADAKAN.
-- ============================================================

CREATE TYPE "occurrence_status" AS ENUM ('CANCELLED');

CREATE TABLE "ibadah_occurrence_status" (
  "id"             UUID NOT NULL,
  "ibadah_id"      UUID NOT NULL,
  "tanggal_ibadah" DATE NOT NULL,
  "status"         "occurrence_status" NOT NULL,
  "catatan"        TEXT,
  "created_by"     UUID,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ibadah_occurrence_status_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ibadah_occurrence_status_ibadah_id_tanggal_ibadah_key"
  ON "ibadah_occurrence_status" ("ibadah_id", "tanggal_ibadah");

CREATE INDEX "ibadah_occurrence_status_ibadah_id_idx"
  ON "ibadah_occurrence_status" ("ibadah_id");

CREATE INDEX "ibadah_occurrence_status_tanggal_ibadah_idx"
  ON "ibadah_occurrence_status" ("tanggal_ibadah");

ALTER TABLE "ibadah_occurrence_status"
  ADD CONSTRAINT "ibadah_occurrence_status_ibadah_id_fkey"
  FOREIGN KEY ("ibadah_id") REFERENCES "ibadah"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
