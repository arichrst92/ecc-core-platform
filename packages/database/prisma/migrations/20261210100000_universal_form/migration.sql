-- Universal Form (2026-12)
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'FORM_REMINDER';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'FORM_NEEDS_FIX';
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'FORM_REJECTED';

CREATE TABLE "universal_form" (
  "id" UUID NOT NULL,
  "judul" VARCHAR(200) NOT NULL,
  "deskripsi" TEXT,
  "status" VARCHAR(10) NOT NULL DEFAULT 'DRAFT',
  "anonim" BOOLEAN NOT NULL DEFAULT false,
  "buka_at" TIMESTAMP(3),
  "tutup_at" TIMESTAMP(3),
  "multi_response" BOOLEAN NOT NULL DEFAULT false,
  "allow_edit" BOOLEAN NOT NULL DEFAULT true,
  "kuota" INTEGER,
  "pesan_terima_kasih" TEXT,
  "created_by_id" UUID,
  "updated_by_id" UUID,
  "files_purged_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "universal_form_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "universal_form_status_idx" ON "universal_form"("status");

CREATE TABLE "universal_form_field" (
  "id" UUID NOT NULL,
  "form_id" UUID NOT NULL,
  "urutan" INTEGER NOT NULL DEFAULT 0,
  "tipe" VARCHAR(12) NOT NULL,
  "label" VARCHAR(300) NOT NULL,
  "petunjuk" TEXT,
  "wajib" BOOLEAN NOT NULL DEFAULT false,
  "opsi" JSONB NOT NULL DEFAULT '[]',
  "validasi" JSONB NOT NULL DEFAULT '{}',
  "autofill" VARCHAR(20),
  "gaya" VARCHAR(10),
  "isi" TEXT,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "universal_form_field_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "universal_form_field_form_id_urutan_idx" ON "universal_form_field"("form_id", "urutan");
ALTER TABLE "universal_form_field" ADD CONSTRAINT "universal_form_field_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "universal_form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "universal_form_embed" (
  "id" UUID NOT NULL,
  "form_id" UUID NOT NULL,
  "source_type" VARCHAR(12) NOT NULL,
  "source_id" UUID NOT NULL,
  "batas_at" TIMESTAMP(3),
  "auto_cancel" BOOLEAN NOT NULL DEFAULT false,
  "urutan" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "universal_form_embed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "universal_form_embed_form_id_source_type_source_id_key" ON "universal_form_embed"("form_id", "source_type", "source_id");
CREATE INDEX "universal_form_embed_source_type_source_id_idx" ON "universal_form_embed"("source_type", "source_id");
ALTER TABLE "universal_form_embed" ADD CONSTRAINT "universal_form_embed_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "universal_form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "universal_form_response" (
  "id" UUID NOT NULL,
  "form_id" UUID NOT NULL,
  "embed_id" UUID,
  "source_type" VARCHAR(12),
  "source_id" UUID,
  "jemaat_id" UUID NOT NULL,
  "subjek_jemaat_id" UUID NOT NULL,
  "client_kind" VARCHAR(10) NOT NULL DEFAULT 'app',
  "app_version" VARCHAR(40),
  "ip" VARCHAR(64),
  "status" VARCHAR(12) NOT NULL DEFAULT 'SUBMITTED',
  "status_alasan" TEXT,
  "perbaiki_sebelum" TIMESTAMP(3),
  "status_by_id" UUID,
  "status_at" TIMESTAMP(3),
  "jawaban" JSONB NOT NULL DEFAULT '{}',
  "autofill" JSONB NOT NULL DEFAULT '{}',
  "jawaban_hash" VARCHAR(64) NOT NULL,
  "edit_count" INTEGER NOT NULL DEFAULT 0,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "universal_form_response_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "universal_form_response_form_id_source_type_source_id_idx" ON "universal_form_response"("form_id", "source_type", "source_id");
CREATE INDEX "universal_form_response_jemaat_id_idx" ON "universal_form_response"("jemaat_id");
CREATE INDEX "universal_form_response_subjek_jemaat_id_idx" ON "universal_form_response"("subjek_jemaat_id");
CREATE INDEX "universal_form_response_embed_id_idx" ON "universal_form_response"("embed_id");
ALTER TABLE "universal_form_response" ADD CONSTRAINT "universal_form_response_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "universal_form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "universal_form_file" (
  "id" UUID NOT NULL,
  "form_id" UUID NOT NULL,
  "field_id" UUID NOT NULL,
  "response_id" UUID,
  "uploader_jemaat_id" UUID NOT NULL,
  "kind" VARCHAR(10) NOT NULL DEFAULT 'FILE',
  "storage_name" VARCHAR(200) NOT NULL,
  "original_name" VARCHAR(255) NOT NULL,
  "mime" VARCHAR(120) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "meta" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "universal_form_file_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "universal_form_file_response_id_idx" ON "universal_form_file"("response_id");
CREATE INDEX "universal_form_file_form_id_idx" ON "universal_form_file"("form_id");
ALTER TABLE "universal_form_file" ADD CONSTRAINT "universal_form_file_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "universal_form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "universal_form_file" ADD CONSTRAINT "universal_form_file_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "universal_form_response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "universal_form_reminder" (
  "id" UUID NOT NULL,
  "embed_id" UUID NOT NULL,
  "subjek_jemaat_id" UUID NOT NULL,
  "kind" VARCHAR(5) NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "universal_form_reminder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "universal_form_reminder_embed_id_subjek_jemaat_id_kind_key" ON "universal_form_reminder"("embed_id", "subjek_jemaat_id", "kind");

-- Template WhatsApp pengingat isi formulir (bisa diubah di Portal → Notifikasi WhatsApp).
INSERT INTO "wa_notification_config" ("id", "type", "label", "description", "category", "is_enabled", "template", "placeholders", "updated_at", "created_at")
VALUES (gen_random_uuid(), 'FORM_REMINDER', 'Pengingat isi formulir', 'Dikirim H-3, H-1, dan 3 jam sebelum batas pengisian formulir (Universal Form) bagi peserta yang belum mengisi / belum memperbaiki.', 'event', true,
'Shalom {nama}, formulir *{form}* untuk {peserta} ({konten}) belum {aksi}. Batas: {batas}. Isi di sini: {link}{catatan}',
ARRAY['nama','form','peserta','konten','aksi','batas','link','catatan'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("type") DO NOTHING;
