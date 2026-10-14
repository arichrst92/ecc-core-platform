-- Tamu (bukan anggota, tanpa akun) untuk event & ibadah (2026-10-14).

ALTER TABLE "jemaat" ADD COLUMN "is_tamu" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "jemaat_is_tamu_idx" ON "jemaat"("is_tamu") WHERE "is_tamu" = true;

ALTER TABLE "event_participation" ADD COLUMN "invited_by_jemaat_id" UUID;
ALTER TABLE "event_participation" ADD COLUMN "guest_source" VARCHAR(20);

ALTER TABLE "reservasi" ADD COLUMN "invited_by_jemaat_id" UUID;
ALTER TABLE "reservasi" ADD COLUMN "guest_source" VARCHAR(20);

CREATE TABLE "jemaat_tamu" (
    "id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "tamu_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jemaat_tamu_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "jemaat_tamu_inviter_id_tamu_id_key" ON "jemaat_tamu"("inviter_id", "tamu_id");
CREATE INDEX "jemaat_tamu_tamu_id_idx" ON "jemaat_tamu"("tamu_id");
ALTER TABLE "jemaat_tamu" ADD CONSTRAINT "jemaat_tamu_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "jemaat_tamu" ADD CONSTRAINT "jemaat_tamu_tamu_id_fkey" FOREIGN KEY ("tamu_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
