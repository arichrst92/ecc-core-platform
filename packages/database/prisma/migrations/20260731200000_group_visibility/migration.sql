-- ============================================================
-- Module 23 extension: Group visibility + invitation join code
-- ============================================================
-- Add isPublic + joinCode fields untuk workflow:
--   isPublic=true  → browse-able + direct join (default untuk 314 imported)
--   isPublic=false → hidden dari listing + join cuma via joinCode
--                    (QR scan di mobile atau input manual)
--
-- Plus extend NotificationType enum untuk workflow notif WA.
-- ============================================================

-- Add fields ke church_group
ALTER TABLE "church_group"
  ADD COLUMN "is_public"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "join_code"  VARCHAR(20);

-- Unique index untuk join code (nullable — NULL boleh banyak)
CREATE UNIQUE INDEX "church_group_join_code_key"
  ON "church_group"("join_code");

-- Backfill: semua 314 group existing → isPublic=true (default sudah true,
-- ini eksplisit untuk clarity). joinCode tetap NULL.
-- (Sudah handled oleh DEFAULT true di ADD COLUMN)

-- ============================================================
-- Extend NotificationType enum
-- ============================================================
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'GROUP_MEMBER_ADDED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'GROUP_MEMBER_REMOVED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'GROUP_DISMISSED';
