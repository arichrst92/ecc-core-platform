-- ============================================================
-- Legacy Shiftsoft migration: field baru di Jemaat untuk import
-- data dari sistem lama (shiftsoft.org multi-tenant).
--
-- Semua kolom baru NULLABLE — safe untuk existing data. Backfill
-- terjadi via `scripts/migrate-shiftsoft/run.ts` (opt-in per cabang).
-- ============================================================

ALTER TABLE "jemaat"
  ADD COLUMN "tanggal_bergabung_gereja"    DATE,
  ADD COLUMN "pendidikan_terakhir"         VARCHAR(100),
  ADD COLUMN "status_pekerjaan"            VARCHAR(100),
  ADD COLUMN "nama_kantor"                 VARCHAR(255),
  ADD COLUMN "alamat_kantor"               TEXT,
  ADD COLUMN "status_pernikahan"           VARCHAR(50),
  ADD COLUMN "tanggal_pernikahan"          DATE,
  ADD COLUMN "sudah_baptis_air"            BOOLEAN,
  ADD COLUMN "tanggal_baptis_air"          DATE,
  ADD COLUMN "sudah_baptis_roh_kudus"      BOOLEAN,
  ADD COLUMN "tanggal_baptis_roh_kudus"    DATE,
  ADD COLUMN "spiritual_journey_level"     VARCHAR(100),
  ADD COLUMN "bapa_rohani_jemaat_id"       UUID,
  ADD COLUMN "legacy_shiftsoft_id"         INTEGER;

-- Self-relation FK: bapa rohani (nullable, SetNull on delete).
ALTER TABLE "jemaat"
  ADD CONSTRAINT "jemaat_bapa_rohani_jemaat_id_fkey"
  FOREIGN KEY ("bapa_rohani_jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Unique index untuk idempotent re-sync. NULL boleh banyak (Postgres treats
-- NULLs as distinct di UNIQUE index by default), jadi jemaat organic tanpa
-- legacy tetap OK.
CREATE UNIQUE INDEX "jemaat_legacy_shiftsoft_id_key"
  ON "jemaat"("legacy_shiftsoft_id");
