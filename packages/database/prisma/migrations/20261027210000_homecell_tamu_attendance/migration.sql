-- Kehadiran tamu per pertemuan homecell (terpisah dari kehadiran anggota)
CREATE TABLE "homecell_tamu_attendance" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "tamu_id" UUID NOT NULL,
    "marked_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "homecell_tamu_attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "homecell_tamu_attendance_schedule_id_tamu_id_key" ON "homecell_tamu_attendance"("schedule_id", "tamu_id");
CREATE INDEX "homecell_tamu_attendance_tamu_id_idx" ON "homecell_tamu_attendance"("tamu_id");
ALTER TABLE "homecell_tamu_attendance" ADD CONSTRAINT "homecell_tamu_attendance_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "homecell_schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_tamu_attendance" ADD CONSTRAINT "homecell_tamu_attendance_tamu_id_fkey" FOREIGN KEY ("tamu_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_tamu_attendance" ADD CONSTRAINT "homecell_tamu_attendance_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
