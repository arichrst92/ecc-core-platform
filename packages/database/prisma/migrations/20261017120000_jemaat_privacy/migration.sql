-- Pengaturan privasi data pribadi jemaat (mobile).
CREATE TABLE "jemaat_privacy" (
    "jemaat_id" UUID NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "discoverable_by_phone" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "jemaat_privacy_pkey" PRIMARY KEY ("jemaat_id")
);

ALTER TABLE "jemaat_privacy" ADD CONSTRAINT "jemaat_privacy_jemaat_id_fkey"
    FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
