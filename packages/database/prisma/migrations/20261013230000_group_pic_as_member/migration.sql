-- Backfill: PIC group otomatis jadi anggota aktif (2026-10-13).
-- Sebelumnya group yang dibuat di mobile hanya mengisi pic_jemaat_id tanpa
-- baris group_member, sehingga tidak muncul di "My Groups" pembuatnya.

-- 1. PIC yang pernah jadi anggota tapi nonaktif → aktifkan lagi.
UPDATE "group_member" gm
SET "is_active" = true, "tanggal_keluar" = NULL, "updated_at" = CURRENT_TIMESTAMP
FROM "church_group" g
WHERE gm."group_id" = g."id"
  AND gm."jemaat_id" = g."pic_jemaat_id"
  AND gm."is_active" = false;

-- 2. PIC yang belum punya baris anggota → tambahkan.
INSERT INTO "group_member" ("id", "group_id", "jemaat_id", "tanggal_bergabung", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), g."id", g."pic_jemaat_id", COALESCE(g."created_at"::date, CURRENT_DATE), true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "church_group" g
WHERE g."pic_jemaat_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "group_member" gm
    WHERE gm."group_id" = g."id" AND gm."jemaat_id" = g."pic_jemaat_id"
  );
