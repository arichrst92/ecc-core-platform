-- ============================================================
-- EventDonation — sub-table multi-payment per participation
-- ============================================================
-- Patch 2026-05-21l (per request mobile multi-donation untuk fundraising).
--
-- Existing EventParticipation tetap (backward-compat), tabel baru ini
-- untuk track setiap giving secara terpisah supaya support multi-donation.
-- Untuk row existing dengan nominalBayar/buktiTransferUrl, di-backfill
-- 1 EventDonation row per participation supaya datanya tetap queryable
-- via /donations endpoint.
-- ============================================================

-- ----------------------------------------------
-- Enum
-- ----------------------------------------------
CREATE TYPE "event_donation_status" AS ENUM ('MENUNGGU_VERIFIKASI', 'BAYAR', 'BATAL');

-- ----------------------------------------------
-- Table
-- ----------------------------------------------
CREATE TABLE "event_donation" (
  "id"               UUID NOT NULL,
  "participation_id" UUID NOT NULL,
  "nominal_bayar"    DECIMAL(15, 2) NOT NULL,
  "bukti_transfer_url" TEXT,
  "status"           "event_donation_status" NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
  "catatan"          TEXT,
  "paid_at"          TIMESTAMP(3),
  "approved_by"      UUID,
  "approved_at"      TIMESTAMP(3),
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_donation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_donation_participation_id_idx" ON "event_donation"("participation_id");
CREATE INDEX "event_donation_status_idx" ON "event_donation"("status");
CREATE INDEX "event_donation_paid_at_idx" ON "event_donation"("paid_at");

ALTER TABLE "event_donation"
  ADD CONSTRAINT "event_donation_participation_id_fkey"
  FOREIGN KEY ("participation_id") REFERENCES "event_participation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_donation"
  ADD CONSTRAINT "event_donation_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "jemaat"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------
-- Backfill: untuk setiap EventParticipation yang punya payment data
-- (nominal_bayar OR bukti_transfer_url not null, OR status MENUNGGU/BAYAR),
-- buat 1 EventDonation row.
-- ----------------------------------------------
INSERT INTO "event_donation" (
  "id", "participation_id", "nominal_bayar", "bukti_transfer_url",
  "status", "catatan", "paid_at", "approved_by", "approved_at",
  "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  ep.id,
  COALESCE(ep.nominal_bayar, 0),
  ep.bukti_transfer_url,
  CASE
    WHEN ep.status = 'BAYAR' THEN 'BAYAR'::"event_donation_status"
    WHEN ep.status = 'MENUNGGU_VERIFIKASI' THEN 'MENUNGGU_VERIFIKASI'::"event_donation_status"
    WHEN ep.status = 'BATAL' THEN 'BATAL'::"event_donation_status"
    ELSE 'MENUNGGU_VERIFIKASI'::"event_donation_status"
  END,
  NULL,
  ep.paid_at,
  ep.approved_by,
  ep.approved_at,
  ep.created_at,
  ep.updated_at
FROM "event_participation" ep
WHERE
  (ep.nominal_bayar IS NOT NULL AND ep.nominal_bayar > 0)
  OR ep.bukti_transfer_url IS NOT NULL
  OR ep.status IN ('MENUNGGU_VERIFIKASI', 'BAYAR');
