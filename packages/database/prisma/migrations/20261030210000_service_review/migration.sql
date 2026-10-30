-- Ulasan & rating jemaat untuk ibadah / event (dari tiket)
CREATE TABLE "service_review" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "reservasi_id" UUID,
    "participation_id" UUID,
    "ibadah_id" UUID,
    "tanggal" DATE,
    "event_id" UUID,
    "jemaat_id" UUID NOT NULL,
    "cabang_id" UUID,
    "rating" INTEGER NOT NULL,
    "komentar" TEXT,
    "is_anonim" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "service_review_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX "service_review_reservasi_id_key" ON "service_review"("reservasi_id");
CREATE UNIQUE INDEX "service_review_participation_id_key" ON "service_review"("participation_id");
CREATE INDEX "service_review_ibadah_id_tanggal_idx" ON "service_review"("ibadah_id", "tanggal");
CREATE INDEX "service_review_event_id_idx" ON "service_review"("event_id");
CREATE INDEX "service_review_created_at_idx" ON "service_review"("created_at");
ALTER TABLE "service_review" ADD CONSTRAINT "service_review_reservasi_id_fkey" FOREIGN KEY ("reservasi_id") REFERENCES "reservasi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_review" ADD CONSTRAINT "service_review_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "event_participation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_review" ADD CONSTRAINT "service_review_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
