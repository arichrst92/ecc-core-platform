-- Spiritual Journey: tahap berurutan dengan syarat role / sub role / status.
CREATE TABLE "spiritual_journey_step" (
    "id" UUID NOT NULL,
    "judul" VARCHAR(150) NOT NULL,
    "deskripsi" TEXT,
    "cara_mendapatkan" TEXT,
    "ikon" VARCHAR(16),
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "role_id" UUID NOT NULL,
    "sub_role_id" UUID,
    "sub_role_status_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "spiritual_journey_step_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "spiritual_journey_step_urutan_idx" ON "spiritual_journey_step"("urutan");
ALTER TABLE "spiritual_journey_step" ADD CONSTRAINT "spiritual_journey_step_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spiritual_journey_step" ADD CONSTRAINT "spiritual_journey_step_sub_role_id_fkey"
    FOREIGN KEY ("sub_role_id") REFERENCES "sub_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "spiritual_journey_step" ADD CONSTRAINT "spiritual_journey_step_sub_role_status_id_fkey"
    FOREIGN KEY ("sub_role_status_id") REFERENCES "sub_role_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;
