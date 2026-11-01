-- Catatan saya (catatan khotbah pribadi) — 2.4.5
CREATE TABLE "catatan_saya" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "isi" TEXT NOT NULL,
    "ayat" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pengkhotbah" VARCHAR(120),
    "tanggal" DATE NOT NULL,
    "ibadah_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "catatan_saya_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "catatan_saya_jemaat_id_tanggal_idx" ON "catatan_saya"("jemaat_id", "tanggal" DESC);
ALTER TABLE "catatan_saya" ADD CONSTRAINT "catatan_saya_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
