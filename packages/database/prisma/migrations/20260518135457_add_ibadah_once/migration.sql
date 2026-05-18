-- CreateEnum
CREATE TYPE "reservasi_status" AS ENUM ('RESERVE', 'JOIN', 'CANCEL');

-- AlterEnum
ALTER TYPE "tipe_jadwal" ADD VALUE 'ONCE';

-- CreateTable
CREATE TABLE "reservasi" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "ibadah_id" UUID NOT NULL,
    "tanggal_ibadah" DATE NOT NULL,
    "status" "reservasi_status" NOT NULL DEFAULT 'RESERVE',
    "kode" VARCHAR(20) NOT NULL,
    "reserved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "catatan" TEXT,
    "checked_in_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservasi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reservasi_kode_key" ON "reservasi"("kode");

-- CreateIndex
CREATE INDEX "reservasi_ibadah_id_tanggal_ibadah_idx" ON "reservasi"("ibadah_id", "tanggal_ibadah");

-- CreateIndex
CREATE INDEX "reservasi_jemaat_id_idx" ON "reservasi"("jemaat_id");

-- CreateIndex
CREATE INDEX "reservasi_status_idx" ON "reservasi"("status");

-- CreateIndex
CREATE INDEX "reservasi_kode_idx" ON "reservasi"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "reservasi_jemaat_id_ibadah_id_tanggal_ibadah_key" ON "reservasi"("jemaat_id", "ibadah_id", "tanggal_ibadah");

-- AddForeignKey
ALTER TABLE "reservasi" ADD CONSTRAINT "reservasi_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservasi" ADD CONSTRAINT "reservasi_ibadah_id_fkey" FOREIGN KEY ("ibadah_id") REFERENCES "ibadah"("id") ON DELETE CASCADE ON UPDATE CASCADE;
