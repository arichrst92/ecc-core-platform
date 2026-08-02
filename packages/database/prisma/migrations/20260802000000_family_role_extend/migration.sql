-- ============================================================
-- Extend FamilyRole enum: tambah GUARDIAN + OTHER
--
-- Sebelumnya: SPOUSE, CHILD, PARENT, SIBLING (4 role).
-- Sekarang: +GUARDIAN (Wali), +OTHER (Lainnya).
--
-- Additive — no data migration, existing rows tetap valid.
-- ============================================================

ALTER TYPE "family_role" ADD VALUE IF NOT EXISTS 'GUARDIAN';
ALTER TYPE "family_role" ADD VALUE IF NOT EXISTS 'OTHER';
