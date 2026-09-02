-- ============================================================
-- Ministry Schedule / Roster tables (M31)
-- Per backend-request-ministry-schedule-roster.md (2026-09-02).
--
-- pelayanan_schedule            : 1 row per (pelayanan, tanggal, ibadah?)
-- pelayanan_schedule_assignment : peserta jemaat + posisi per schedule
-- ============================================================

CREATE TABLE "pelayanan_schedule" (
    "id" UUID NOT NULL,
    "pelayanan_id" UUID NOT NULL,
    "ibadah_id" UUID,
    "tanggal" DATE NOT NULL,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pelayanan_schedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pelayanan_schedule_pelayanan_id_tanggal_idx"
  ON "pelayanan_schedule"("pelayanan_id", "tanggal");
CREATE INDEX "pelayanan_schedule_tanggal_idx"
  ON "pelayanan_schedule"("tanggal");
CREATE INDEX "pelayanan_schedule_ibadah_id_idx"
  ON "pelayanan_schedule"("ibadah_id");

ALTER TABLE "pelayanan_schedule"
  ADD CONSTRAINT "pelayanan_schedule_pelayanan_id_fkey"
  FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pelayanan_schedule"
  ADD CONSTRAINT "pelayanan_schedule_ibadah_id_fkey"
  FOREIGN KEY ("ibadah_id") REFERENCES "ibadah"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================

CREATE TABLE "pelayanan_schedule_assignment" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "pelayanan_role_id" UUID NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pelayanan_schedule_assignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pelayanan_schedule_assignment_schedule_id_jemaat_id_key"
  ON "pelayanan_schedule_assignment"("schedule_id", "jemaat_id");
CREATE INDEX "pelayanan_schedule_assignment_jemaat_id_idx"
  ON "pelayanan_schedule_assignment"("jemaat_id");
CREATE INDEX "pelayanan_schedule_assignment_schedule_id_idx"
  ON "pelayanan_schedule_assignment"("schedule_id");

ALTER TABLE "pelayanan_schedule_assignment"
  ADD CONSTRAINT "pelayanan_schedule_assignment_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "pelayanan_schedule"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pelayanan_schedule_assignment"
  ADD CONSTRAINT "pelayanan_schedule_assignment_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pelayanan_schedule_assignment"
  ADD CONSTRAINT "pelayanan_schedule_assignment_pelayanan_role_id_fkey"
  FOREIGN KEY ("pelayanan_role_id") REFERENCES "pelayanan_role"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
