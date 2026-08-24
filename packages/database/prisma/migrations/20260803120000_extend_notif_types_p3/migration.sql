-- Modul 30 addendum P3 — extend InAppNotifType dgn 3 event tambahan.
-- Idempotent ADD VALUE IF NOT EXISTS.

ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'EVENT_REGISTERED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'HOMECELL_ATTENDED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'VISIT_RECORDED';
