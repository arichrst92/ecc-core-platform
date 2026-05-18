-- CreateTable
CREATE TABLE "homecell_area" (
    "id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "deskripsi" TEXT,
    "pic_jemaat_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homecell_area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homecell" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "nama" VARCHAR(150) NOT NULL,
    "deskripsi" TEXT,
    "alamat" TEXT,
    "hari" "hari_minggu",
    "jam" VARCHAR(5),
    "pic_jemaat_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homecell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homecell_member" (
    "id" UUID NOT NULL,
    "homecell_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "tanggal_bergabung" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tanggal_keluar" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homecell_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "homecell_area_cabang_id_idx" ON "homecell_area"("cabang_id");

-- CreateIndex
CREATE INDEX "homecell_area_pic_jemaat_id_idx" ON "homecell_area"("pic_jemaat_id");

-- CreateIndex
CREATE UNIQUE INDEX "homecell_area_cabang_id_nama_key" ON "homecell_area"("cabang_id", "nama");

-- CreateIndex
CREATE INDEX "homecell_area_id_idx" ON "homecell"("area_id");

-- CreateIndex
CREATE INDEX "homecell_pic_jemaat_id_idx" ON "homecell"("pic_jemaat_id");

-- CreateIndex
CREATE INDEX "homecell_member_homecell_id_idx" ON "homecell_member"("homecell_id");

-- CreateIndex
CREATE INDEX "homecell_member_jemaat_id_idx" ON "homecell_member"("jemaat_id");

-- CreateIndex
CREATE UNIQUE INDEX "homecell_member_homecell_id_jemaat_id_key" ON "homecell_member"("homecell_id", "jemaat_id");

-- AddForeignKey
ALTER TABLE "homecell_area" ADD CONSTRAINT "homecell_area_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homecell_area" ADD CONSTRAINT "homecell_area_pic_jemaat_id_fkey" FOREIGN KEY ("pic_jemaat_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homecell" ADD CONSTRAINT "homecell_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "homecell_area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homecell" ADD CONSTRAINT "homecell_pic_jemaat_id_fkey" FOREIGN KEY ("pic_jemaat_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homecell_member" ADD CONSTRAINT "homecell_member_homecell_id_fkey" FOREIGN KEY ("homecell_id") REFERENCES "homecell"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homecell_member" ADD CONSTRAINT "homecell_member_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
