-- Persetujuan pembuatan group: group dari Els App menunggu persetujuan admin
-- (Role Access menu Group). Group yang sudah ada = APPROVED.
DO $$ BEGIN
  CREATE TYPE "group_approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "church_group" ADD COLUMN IF NOT EXISTS "approval_status" "group_approval_status" NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "church_group" ADD COLUMN IF NOT EXISTS "approval_note" VARCHAR(300);
ALTER TABLE "church_group" ADD COLUMN IF NOT EXISTS "approval_by_id" UUID;
ALTER TABLE "church_group" ADD COLUMN IF NOT EXISTS "approval_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "church_group_approval_status_idx" ON "church_group" ("approval_status");
