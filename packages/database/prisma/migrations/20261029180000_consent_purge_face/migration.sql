-- No.2: bukti persetujuan S&K + Kebijakan Privasi
CREATE TABLE "user_consent" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "terms_version" VARCHAR(20) NOT NULL,
    "privacy_version" VARCHAR(20) NOT NULL,
    "sensitive_data" BOOLEAN NOT NULL DEFAULT false,
    "age_group" VARCHAR(24),
    "source" VARCHAR(20) NOT NULL,
    "language" VARCHAR(5),
    "platform" VARCHAR(20),
    "app_version" VARCHAR(20),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_consent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "user_consent_jemaat_id_accepted_at_idx" ON "user_consent"("jemaat_id", "accepted_at");
ALTER TABLE "user_consent" ADD CONSTRAINT "user_consent_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No.5/14: penanda data pribadi sudah dihapus/disamarkan permanen
ALTER TABLE "jemaat" ADD COLUMN "data_purged_at" TIMESTAMP(3);

-- No.13: hapus permanen seluruh data wajah (fitur login wajah dihentikan)
UPDATE "user"
   SET "face_descriptor" = NULL,
       "face_enrolled_at" = NULL,
       "face_model_version" = NULL,
       "face_metadata" = NULL
 WHERE "face_descriptor" IS NOT NULL
    OR "face_enrolled_at" IS NOT NULL
    OR "face_metadata" IS NOT NULL;
DELETE FROM "face_telemetry_event";
