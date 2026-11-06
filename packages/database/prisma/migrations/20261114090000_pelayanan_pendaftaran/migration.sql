-- Buka / tutup pendaftaran pelayanan per cabang.
CREATE TABLE "pelayanan_pendaftaran" (
    "id" UUID NOT NULL,
    "pelayanan_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "is_open" BOOLEAN NOT NULL,
    "catatan" TEXT,
    "tutup_otomatis" DATE,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pelayanan_pendaftaran_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pelayanan_pendaftaran_pelayanan_id_cabang_id_key" ON "pelayanan_pendaftaran"("pelayanan_id", "cabang_id");
CREATE INDEX "pelayanan_pendaftaran_cabang_id_idx" ON "pelayanan_pendaftaran"("cabang_id");
ALTER TABLE "pelayanan_pendaftaran" ADD CONSTRAINT "pelayanan_pendaftaran_pelayanan_id_fkey" FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pelayanan_pendaftaran" ADD CONSTRAINT "pelayanan_pendaftaran_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
