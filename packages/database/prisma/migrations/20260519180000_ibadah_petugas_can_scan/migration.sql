-- ============================================================
-- IbadahPelayananPetugas.can_scan_attendance
-- Tandai volunteer yang berwenang scan QR kode jemaat untuk check-in.
-- ============================================================

ALTER TABLE "ibadah_pelayanan_petugas"
  ADD COLUMN "can_scan_attendance" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "ibadah_pelayanan_petugas_can_scan_attendance_idx"
  ON "ibadah_pelayanan_petugas"("can_scan_attendance");
