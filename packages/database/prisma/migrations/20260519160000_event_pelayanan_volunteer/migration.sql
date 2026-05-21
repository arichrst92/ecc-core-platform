-- ============================================================
-- EventPelayanan: junction Event ↔ Pelayanan (ministry yg bertugas)
-- ============================================================

CREATE TABLE "event_pelayanan" (
  "id"           UUID NOT NULL,
  "event_id"     UUID NOT NULL,
  "pelayanan_id" UUID NOT NULL,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_pelayanan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_pelayanan_event_id_pelayanan_id_key"
  ON "event_pelayanan"("event_id", "pelayanan_id");
CREATE INDEX "event_pelayanan_event_id_idx" ON "event_pelayanan"("event_id");
CREATE INDEX "event_pelayanan_pelayanan_id_idx" ON "event_pelayanan"("pelayanan_id");

ALTER TABLE "event_pelayanan"
  ADD CONSTRAINT "event_pelayanan_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_pelayanan"
  ADD CONSTRAINT "event_pelayanan_pelayanan_id_fkey"
  FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- EventPelayananPetugas: volunteer + canScanAttendance flag.
-- ============================================================

CREATE TABLE "event_pelayanan_petugas" (
  "id"                   UUID NOT NULL,
  "event_pelayanan_id"   UUID NOT NULL,
  "jemaat_id"            UUID NOT NULL,
  "pelayanan_role_id"    UUID NOT NULL,
  "can_scan_attendance"  BOOLEAN NOT NULL DEFAULT false,
  "catatan"              TEXT,
  "created_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_pelayanan_petugas_pkey" PRIMARY KEY ("id")
);

-- Pakai naming convention Prisma default (tabel_kolom1_kolom2_key/idx)
-- supaya `prisma migrate dev` tidak generate rename migration tambahan.
CREATE UNIQUE INDEX "event_pelayanan_petugas_event_pelayanan_id_jemaat_id_key"
  ON "event_pelayanan_petugas"("event_pelayanan_id", "jemaat_id");
CREATE INDEX "event_pelayanan_petugas_event_pelayanan_id_idx"
  ON "event_pelayanan_petugas"("event_pelayanan_id");
CREATE INDEX "event_pelayanan_petugas_jemaat_id_idx"
  ON "event_pelayanan_petugas"("jemaat_id");
CREATE INDEX "event_pelayanan_petugas_can_scan_attendance_idx"
  ON "event_pelayanan_petugas"("can_scan_attendance");

ALTER TABLE "event_pelayanan_petugas"
  ADD CONSTRAINT "event_pelayanan_petugas_event_pelayanan_id_fkey"
  FOREIGN KEY ("event_pelayanan_id") REFERENCES "event_pelayanan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_pelayanan_petugas"
  ADD CONSTRAINT "event_pelayanan_petugas_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_pelayanan_petugas"
  ADD CONSTRAINT "event_pelayanan_petugas_pelayanan_role_id_fkey"
  FOREIGN KEY ("pelayanan_role_id") REFERENCES "pelayanan_role"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
