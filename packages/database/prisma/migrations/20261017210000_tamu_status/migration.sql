-- Status tindak lanjut tamu (diatur admin di portal).
ALTER TABLE "jemaat"
  ADD COLUMN "tamu_status" VARCHAR(20),
  ADD COLUMN "tamu_status_updated_at" TIMESTAMP(3),
  ADD COLUMN "tamu_status_updated_by_id" UUID,
  ADD COLUMN "tamu_catatan" TEXT;
