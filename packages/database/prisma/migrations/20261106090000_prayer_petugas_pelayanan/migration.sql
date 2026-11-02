-- Petugas doa dari ministry (pelayanan), selain dari role.
CREATE TABLE "prayer_petugas_pelayanan" (
    "id" UUID NOT NULL,
    "pelayanan_id" UUID NOT NULL,
    "pelayanan_role_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prayer_petugas_pelayanan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prayer_petugas_pelayanan_pelayanan_id_pelayanan_role_id_key" ON "prayer_petugas_pelayanan"("pelayanan_id", "pelayanan_role_id");
ALTER TABLE "prayer_petugas_pelayanan" ADD CONSTRAINT "prayer_petugas_pelayanan_pelayanan_id_fkey" FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prayer_petugas_pelayanan" ADD CONSTRAINT "prayer_petugas_pelayanan_pelayanan_role_id_fkey" FOREIGN KEY ("pelayanan_role_id") REFERENCES "pelayanan_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
