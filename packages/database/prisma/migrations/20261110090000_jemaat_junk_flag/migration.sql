-- Potensial junk data (tandai "Bukan junk") + jejak edit Portal (proteksi sync Shiftsoft).
ALTER TABLE "jemaat" ADD COLUMN IF NOT EXISTS "junk_dismissed_at" TIMESTAMP(3);
ALTER TABLE "jemaat" ADD COLUMN IF NOT EXISTS "junk_dismissed_by_id" UUID;
ALTER TABLE "jemaat" ADD COLUMN IF NOT EXISTS "portal_edited_at" TIMESTAMP(3);

-- Jemaat yang pernah diubah admin lewat Portal sebelum kolom ini ada (dari audit log).
UPDATE "jemaat" j SET "portal_edited_at" = a.last_edit
FROM (
  SELECT "resource_id" AS id, MAX("created_at") AS last_edit
  FROM "audit_log"
  WHERE "resource" = 'jemaat' AND "action" = 'UPDATE' AND "resource_id" IS NOT NULL
  GROUP BY "resource_id"
) a
WHERE j."id" = a.id AND j."portal_edited_at" IS NULL;
