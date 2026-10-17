-- Petugas follow-up tamu (diatur admin portal).
ALTER TABLE "jemaat"
  ADD COLUMN "tamu_followup_by_id" UUID,
  ADD COLUMN "tamu_followup_at" TIMESTAMP(3);

ALTER TABLE "jemaat" ADD CONSTRAINT "jemaat_tamu_followup_by_id_fkey"
  FOREIGN KEY ("tamu_followup_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "jemaat_tamu_followup_by_id_idx" ON "jemaat"("tamu_followup_by_id");
