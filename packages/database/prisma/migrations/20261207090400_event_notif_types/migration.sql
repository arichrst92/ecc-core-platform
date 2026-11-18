-- Notifikasi event: bukti bayar ditolak & pendaftaran dibatalkan admin.
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'EVENT_PAYMENT_REJECTED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'EVENT_CANCELLED_BY_ADMIN';
