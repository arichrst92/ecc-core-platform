-- Notifikasi jadwal pelayanan (diatur pemegang otoritas dari app).
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'MINISTRY_DUTY_ASSIGNED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'MINISTRY_DUTY_REMOVED';
