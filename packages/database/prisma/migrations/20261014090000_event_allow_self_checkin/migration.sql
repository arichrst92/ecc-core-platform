-- Event: izinkan peserta self check-in dari aplikasi (2026-10-14).
ALTER TABLE "event" ADD COLUMN "allow_self_checkin" BOOLEAN NOT NULL DEFAULT false;
