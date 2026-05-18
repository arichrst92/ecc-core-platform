-- CreateTable
CREATE TABLE "ibadah_pelayanan_petugas" (
    "id" UUID NOT NULL,
    "ibadah_pelayanan_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "pelayanan_role_id" UUID NOT NULL,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ibadah_pelayanan_petugas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ibadah_pelayanan_petugas_ibadah_pelayanan_id_idx" ON "ibadah_pelayanan_petugas"("ibadah_pelayanan_id");

-- CreateIndex
CREATE INDEX "ibadah_pelayanan_petugas_jemaat_id_idx" ON "ibadah_pelayanan_petugas"("jemaat_id");

-- CreateIndex
CREATE UNIQUE INDEX "ibadah_pelayanan_petugas_ibadah_pelayanan_id_jemaat_id_key" ON "ibadah_pelayanan_petugas"("ibadah_pelayanan_id", "jemaat_id");

-- AddForeignKey
ALTER TABLE "ibadah_pelayanan_petugas" ADD CONSTRAINT "ibadah_pelayanan_petugas_ibadah_pelayanan_id_fkey" FOREIGN KEY ("ibadah_pelayanan_id") REFERENCES "ibadah_pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ibadah_pelayanan_petugas" ADD CONSTRAINT "ibadah_pelayanan_petugas_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ibadah_pelayanan_petugas" ADD CONSTRAINT "ibadah_pelayanan_petugas_pelayanan_role_id_fkey" FOREIGN KEY ("pelayanan_role_id") REFERENCES "pelayanan_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
