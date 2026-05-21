-- ============================================================
-- Movement — Event + EventParticipation
-- ============================================================

-- Enums
CREATE TYPE "event_tipe_bayar" AS ENUM ('GRATIS', 'NOMINAL_TETAP', 'NOMINAL_BEBAS');
CREATE TYPE "event_participation_status" AS ENUM (
  'DAFTAR',
  'MENUNGGU_VERIFIKASI',
  'BAYAR',
  'HADIR',
  'BATAL'
);

-- Event table
CREATE TABLE "event" (
  "id"              UUID NOT NULL,
  "judul"           VARCHAR(255) NOT NULL,
  "slug"            VARCHAR(280) NOT NULL,
  "ringkasan"       TEXT,
  "deskripsi"       TEXT NOT NULL,
  "hero_image_url"  TEXT,
  "video_url"       TEXT,
  "tanggal_mulai"   TIMESTAMP(3) NOT NULL,
  "tanggal_selesai" TIMESTAMP(3),
  "lokasi"          TEXT,
  "sinode_id"       UUID,
  "cabang_id"       UUID,
  "tipe_bayar"      "event_tipe_bayar" NOT NULL DEFAULT 'GRATIS',
  "nominal"         DECIMAL(15, 2),
  "qris_image_url"  TEXT,
  "bank_nama"       VARCHAR(100),
  "bank_nomor"      VARCHAR(100),
  "bank_atas_nama"  VARCHAR(255),
  "quota_peserta"   INTEGER,
  "tags"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "is_published"    BOOLEAN NOT NULL DEFAULT false,
  "published_at"    TIMESTAMP(3),
  "view_count"      INTEGER NOT NULL DEFAULT 0,
  "author_id"       UUID NOT NULL,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_slug_key" ON "event"("slug");
CREATE INDEX "event_cabang_id_idx" ON "event"("cabang_id");
CREATE INDEX "event_sinode_id_idx" ON "event"("sinode_id");
CREATE INDEX "event_tanggal_mulai_idx" ON "event"("tanggal_mulai");
CREATE INDEX "event_is_published_published_at_idx" ON "event"("is_published", "published_at");

ALTER TABLE "event"
  ADD CONSTRAINT "event_author_id_fkey"
  FOREIGN KEY ("author_id") REFERENCES "user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "event"
  ADD CONSTRAINT "event_sinode_id_fkey"
  FOREIGN KEY ("sinode_id") REFERENCES "sinode"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event"
  ADD CONSTRAINT "event_cabang_id_fkey"
  FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- EventParticipation table
CREATE TABLE "event_participation" (
  "id"                 UUID NOT NULL,
  "event_id"           UUID NOT NULL,
  "jemaat_id"          UUID NOT NULL,
  "status"             "event_participation_status" NOT NULL DEFAULT 'DAFTAR',
  "nominal_bayar"      DECIMAL(15, 2),
  "bukti_transfer_url" TEXT,
  "catatan"            TEXT,
  "registered_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paid_at"            TIMESTAMP(3),
  "attended_at"        TIMESTAMP(3),
  "cancelled_at"       TIMESTAMP(3),
  "approved_by"        UUID,
  "approved_at"        TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_participation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_participation_event_id_jemaat_id_key"
  ON "event_participation"("event_id", "jemaat_id");
CREATE INDEX "event_participation_event_id_idx" ON "event_participation"("event_id");
CREATE INDEX "event_participation_jemaat_id_idx" ON "event_participation"("jemaat_id");
CREATE INDEX "event_participation_status_idx" ON "event_participation"("status");

ALTER TABLE "event_participation"
  ADD CONSTRAINT "event_participation_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_participation"
  ADD CONSTRAINT "event_participation_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_participation"
  ADD CONSTRAINT "event_participation_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "jemaat"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
