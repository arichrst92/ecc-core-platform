-- CreateTable
CREATE TABLE "pelayanan" (
    "id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "deskripsi" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pelayanan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pelayanan_role" (
    "id" UUID NOT NULL,
    "pelayanan_id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "deskripsi" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pelayanan_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jemaat_pelayanan" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "pelayanan_id" UUID NOT NULL,
    "pelayanan_role_id" UUID NOT NULL,
    "tanggal_mulai" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tanggal_selesai" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jemaat_pelayanan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ibadah_pelayanan" (
    "id" UUID NOT NULL,
    "ibadah_id" UUID NOT NULL,
    "pelayanan_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ibadah_pelayanan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pelayanan_nama_key" ON "pelayanan"("nama");

-- CreateIndex
CREATE INDEX "pelayanan_role_pelayanan_id_idx" ON "pelayanan_role"("pelayanan_id");

-- CreateIndex
CREATE UNIQUE INDEX "pelayanan_role_pelayanan_id_nama_key" ON "pelayanan_role"("pelayanan_id", "nama");

-- CreateIndex
CREATE INDEX "jemaat_pelayanan_jemaat_id_idx" ON "jemaat_pelayanan"("jemaat_id");

-- CreateIndex
CREATE INDEX "jemaat_pelayanan_pelayanan_id_idx" ON "jemaat_pelayanan"("pelayanan_id");

-- CreateIndex
CREATE INDEX "jemaat_pelayanan_is_active_idx" ON "jemaat_pelayanan"("is_active");

-- CreateIndex
CREATE INDEX "ibadah_pelayanan_ibadah_id_idx" ON "ibadah_pelayanan"("ibadah_id");

-- CreateIndex
CREATE INDEX "ibadah_pelayanan_pelayanan_id_idx" ON "ibadah_pelayanan"("pelayanan_id");

-- CreateIndex
CREATE UNIQUE INDEX "ibadah_pelayanan_ibadah_id_pelayanan_id_key" ON "ibadah_pelayanan"("ibadah_id", "pelayanan_id");

-- AddForeignKey
ALTER TABLE "pelayanan_role" ADD CONSTRAINT "pelayanan_role_pelayanan_id_fkey" FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_pelayanan" ADD CONSTRAINT "jemaat_pelayanan_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_pelayanan" ADD CONSTRAINT "jemaat_pelayanan_pelayanan_id_fkey" FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jemaat_pelayanan" ADD CONSTRAINT "jemaat_pelayanan_pelayanan_role_id_fkey" FOREIGN KEY ("pelayanan_role_id") REFERENCES "pelayanan_role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ibadah_pelayanan" ADD CONSTRAINT "ibadah_pelayanan_ibadah_id_fkey" FOREIGN KEY ("ibadah_id") REFERENCES "ibadah"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ibadah_pelayanan" ADD CONSTRAINT "ibadah_pelayanan_pelayanan_id_fkey" FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
