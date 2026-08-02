-- ============================================================
-- Drop FamilyRelation model + FamilyRole enum
--
-- Mobile /admin/me/family/* endpoints sudah di-refactor pakai jemaat_relasi
-- + tipe_relasi_keluarga (portal admin master data granular). FamilyRelation
-- table + FamilyRole enum tidak lagi digunakan.
--
-- Data migration: TIDAK diperlukan — user confirm belum ada data di
-- family_relation di production per 2026-08-02.
--
-- Semi-safe: DROP TABLE cascades ke constraints tapi kita drop FK dulu.
-- ============================================================

DROP TABLE IF EXISTS "family_relation";
DROP TYPE IF EXISTS "family_role";
