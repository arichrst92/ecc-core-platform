-- ============================================================
-- Jemaat: tambah kolom soft-delete metadata
-- ============================================================
-- isActive sudah ada — gate utama untuk login & access.
-- deactivated_at + deactivation_reason untuk audit trail saat
-- self-deactivation via DELETE /admin/me.
ALTER TABLE "jemaat" ADD COLUMN "deactivated_at"      TIMESTAMP(3);
ALTER TABLE "jemaat" ADD COLUMN "deactivation_reason" TEXT;
