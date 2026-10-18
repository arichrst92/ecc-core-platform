-- Prayer Request ("Doa") & Resolusi Tahunan (2026-10-18)
-- Manual SQL — hanya perubahan fitur ini. Apply via migrate deploy.

ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'PRAYER_ASSIGNED';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'PRAYER_PRAYED';

CREATE TYPE "prayer_status" AS ENUM ('BARU', 'DITUGASKAN', 'SUDAH_DIDOAKAN');
CREATE TYPE "prayer_target" AS ENUM ('DIRI_SENDIRI', 'KELUARGA', 'ORANG_LAIN');

CREATE TABLE "prayer_request" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "cabang_id" UUID,
    "kategori" VARCHAR(30) NOT NULL,
    "untuk" "prayer_target" NOT NULL DEFAULT 'DIRI_SENDIRI',
    "untuk_nama" VARCHAR(150),
    "untuk_jemaat_id" UUID,
    "isi" TEXT NOT NULL,
    "is_anonim" BOOLEAN NOT NULL DEFAULT false,
    "status" "prayer_status" NOT NULL DEFAULT 'BARU',
    "petugas_id" UUID,
    "assigned_by_id" UUID,
    "assigned_at" TIMESTAMP(3),
    "didoakan_at" TIMESTAMP(3),
    "didoakan_by_id" UUID,
    "catatan_petugas" TEXT,
    "terjawab_at" TIMESTAMP(3),
    "kesaksian" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prayer_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prayer_request_jemaat_id_created_at_idx" ON "prayer_request"("jemaat_id", "created_at");
CREATE INDEX "prayer_request_petugas_id_status_idx" ON "prayer_request"("petugas_id", "status");
CREATE INDEX "prayer_request_status_created_at_idx" ON "prayer_request"("status", "created_at");
CREATE INDEX "prayer_request_cabang_id_idx" ON "prayer_request"("cabang_id");
ALTER TABLE "prayer_request" ADD CONSTRAINT "prayer_request_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prayer_request" ADD CONSTRAINT "prayer_request_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prayer_request" ADD CONSTRAINT "prayer_request_untuk_jemaat_id_fkey" FOREIGN KEY ("untuk_jemaat_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prayer_request" ADD CONSTRAINT "prayer_request_petugas_id_fkey" FOREIGN KEY ("petugas_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prayer_request" ADD CONSTRAINT "prayer_request_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prayer_request" ADD CONSTRAINT "prayer_request_didoakan_by_id_fkey" FOREIGN KEY ("didoakan_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "prayer_petugas_role" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "sub_role_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prayer_petugas_role_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prayer_petugas_role_role_id_sub_role_id_key" ON "prayer_petugas_role"("role_id", "sub_role_id");
ALTER TABLE "prayer_petugas_role" ADD CONSTRAINT "prayer_petugas_role_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prayer_petugas_role" ADD CONSTRAINT "prayer_petugas_role_sub_role_id_fkey" FOREIGN KEY ("sub_role_id") REFERENCES "sub_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "resolusi" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "tahun" INTEGER NOT NULL,
    "judul" VARCHAR(200) NOT NULL,
    "catatan" TEXT,
    "kategori" VARCHAR(30) NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "done_at" TIMESTAMP(3),
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "resolusi_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "resolusi_jemaat_id_tahun_urutan_idx" ON "resolusi"("jemaat_id", "tahun", "urutan");
ALTER TABLE "resolusi" ADD CONSTRAINT "resolusi_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Menu portal "Prayer Request": untuk sekarang semua role portal boleh lihat
-- (pembagian akses menyusul via Role Access). Tulis/hapus diatur admin.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'prayer-request', true, false, false, CURRENT_TIMESTAMP
FROM "role" r WHERE r."can_access_portal" = true
ON CONFLICT ("role_id", "menu_key") DO NOTHING;

-- WA notif config (aktif)
INSERT INTO "wa_notification_config"
  ("id", "type", "label", "description", "category", "is_enabled", "template", "placeholders", "updated_at")
VALUES
  (gen_random_uuid(), 'PRAYER_ASSIGNED',
   'Prayer Request Ditugaskan',
   'Dikirim ke petugas doa saat admin menugaskan prayer request.',
   'DOA', true,
   E'🙏 *Prayer Request Baru*\n\nHalo {nama},\n\nAnda ditugaskan mendoakan pokok doa dari *{pengirim}* ({kategori}):\n\n"{isi}"\n\nBuka Els App → Doa → Ditugaskan ke Saya untuk menandai sudah didoakan.',
   ARRAY['nama','pengirim','kategori','isi'],
   CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'PRAYER_PRAYED',
   'Prayer Request Sudah Didoakan',
   'Dikirim ke jemaat saat pokok doanya sudah didoakan petugas.',
   'DOA', true,
   E'🙏 *Doa Anda Sudah Didoakan*\n\nHalo {nama},\n\nPokok doa Anda ({kategori}) sudah didoakan oleh tim ECC.{catatan}\n\nTuhan Yesus memberkati. Jika doa Anda sudah terjawab, tandai di Els App → Doa.',
   ARRAY['nama','kategori','catatan'],
   CURRENT_TIMESTAMP)
ON CONFLICT ("type") DO NOTHING;
