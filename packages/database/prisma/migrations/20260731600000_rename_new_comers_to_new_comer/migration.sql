-- ============================================================
-- Fix: rename SubRole 'New Comers' (plural) → 'New Comer' (singular)
--
-- Bug ditemukan 2026-07-28: auth.ts /register match SubRole "New Comer"
-- (singular) tapi seed.ts pakai "New Comers" (plural dengan S).
-- Impact: user pilih jenisJemaat=NEW_COMER di mobile signup → sub-role
-- lookup fail → jemaat ter-create tanpa role assignment.
--
-- Standardize ke singular sesuai auth.ts (source of truth API).
--
-- Idempotent: WHERE nama = 'New Comers' → kalau sudah ke-rename sebelumnya,
-- 0 row affected (safe rerun). Duplicate guard via NOT EXISTS supaya
-- kalau ada 'New Comer' baru di-seed manual, tidak collide unique index.
-- ============================================================

UPDATE "sub_role"
SET "nama" = 'New Comer', "updated_at" = CURRENT_TIMESTAMP
WHERE "role_id" IN (SELECT "id" FROM "role" WHERE LOWER("nama") = 'jemaat')
  AND "nama" = 'New Comers'
  AND NOT EXISTS (
    SELECT 1 FROM "sub_role" sr2
    WHERE sr2."role_id" = "sub_role"."role_id"
      AND sr2."nama" = 'New Comer'
      AND sr2."id" != "sub_role"."id"
  );
