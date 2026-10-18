-- Event NOMINAL_BEBAS: donasi tambahan berkali-kali (2026-10-18)
ALTER TABLE "event_donation" ADD COLUMN IF NOT EXISTS "tambahan" BOOLEAN NOT NULL DEFAULT false;
