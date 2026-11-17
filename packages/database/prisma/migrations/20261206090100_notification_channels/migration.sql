-- Saluran notifikasi per jenis (In-app / WhatsApp / Email). Tanpa baris = default
-- katalog di kode (perilaku lama tidak berubah).
CREATE TABLE "notification_channel_config" (
  "type"               VARCHAR(64)  NOT NULL,
  "in_app"             BOOLEAN      NOT NULL,
  "email"              BOOLEAN      NOT NULL DEFAULT false,
  "wa_fallback_email"  BOOLEAN      NOT NULL DEFAULT false,
  "updated_by_user_id" UUID,
  "updated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_channel_config_pkey" PRIMARY KEY ("type")
);

CREATE TABLE "notification_dedup" (
  "dedup_key"  VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_dedup_pkey" PRIMARY KEY ("dedup_key")
);
CREATE INDEX "notification_dedup_created_at_idx" ON "notification_dedup" ("created_at");
