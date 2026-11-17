-- Pengingat ibadah/event & ucapan ulang tahun bisa tampil di feed app.
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'IBADAH_REMINDER';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'EVENT_REMINDER';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'BIRTHDAY_GREETING';
