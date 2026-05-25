-- ============================================================
-- Homecell Schedule + Attendance — pertemuan + QR scan absensi
-- ============================================================
-- Per request mobile (2026-05-24):
-- docs/backend-request-homecell-schedule-attendance.md
--
-- PIC homecell create jadwal pertemuan, scan QR member untuk absensi.
-- 2 tabel baru + 1 enum. Permission via assertCanManageHomecell helper
-- (PIC homecell / PIC area parent / admin fulltimer).

-- Enum: source absensi (QR_SCAN default, MANUAL untuk future)
CREATE TYPE "AttendanceSource" AS ENUM ('QR_SCAN', 'MANUAL');

-- Schedule pertemuan homecell
CREATE TABLE "homecell_schedule" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "homecell_id"  UUID NOT NULL,
  "tanggal"      DATE NOT NULL,
  "lokasi"       VARCHAR(500) NOT NULL,
  "catatan"      TEXT,
  "created_by"   UUID,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "homecell_schedule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homecell_schedule_homecell_id_fkey"
    FOREIGN KEY ("homecell_id") REFERENCES "homecell"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "homecell_schedule_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "homecell_schedule_homecell_id_tanggal_idx"
  ON "homecell_schedule"("homecell_id", "tanggal" DESC);

-- Attendance per schedule per jemaat (idempotent via unique constraint)
CREATE TABLE "homecell_attendance" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "schedule_id" UUID NOT NULL,
  "jemaat_id"   UUID NOT NULL,
  "scanned_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scanned_by"  UUID,
  "source"      "AttendanceSource" NOT NULL DEFAULT 'QR_SCAN',
  CONSTRAINT "homecell_attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "homecell_attendance_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "homecell_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "homecell_attendance_jemaat_id_fkey"
    FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "homecell_attendance_scanned_by_fkey"
    FOREIGN KEY ("scanned_by") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "homecell_attendance_schedule_id_jemaat_id_key"
  ON "homecell_attendance"("schedule_id", "jemaat_id");
CREATE INDEX "homecell_attendance_schedule_id_idx"
  ON "homecell_attendance"("schedule_id");
CREATE INDEX "homecell_attendance_jemaat_id_idx"
  ON "homecell_attendance"("jemaat_id");
