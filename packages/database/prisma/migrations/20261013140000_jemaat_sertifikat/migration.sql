-- Sertifikat jemaat (2026-10-13). Manual SQL — hanya perubahan fitur ini.
CREATE TABLE "jemaat_sertifikat" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "nama" VARCHAR(200) NOT NULL,
    "tanggal" DATE NOT NULL,
    "file_url" TEXT,
    "file_mime" VARCHAR(100),
    "file_name" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jemaat_sertifikat_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "jemaat_sertifikat_jemaat_id_tanggal_idx" ON "jemaat_sertifikat"("jemaat_id", "tanggal");
ALTER TABLE "jemaat_sertifikat" ADD CONSTRAINT "jemaat_sertifikat_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
