-- Token API pribadi untuk Team IT Minister (Developer Tools → API Access).
CREATE TABLE "personal_access_token" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      UUID NOT NULL,
  "nama"         VARCHAR(120) NOT NULL,
  "key_prefix"   VARCHAR(20) NOT NULL,
  "key_hash"     VARCHAR(255) NOT NULL,
  "last_used_at" TIMESTAMP(3),
  "last_used_ip" VARCHAR(64),
  "expires_at"   TIMESTAMP(3),
  "revoked_at"   TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personal_access_token_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "personal_access_token_key_prefix_key" ON "personal_access_token"("key_prefix");
CREATE INDEX "personal_access_token_user_id_idx" ON "personal_access_token"("user_id");
ALTER TABLE "personal_access_token"
  ADD CONSTRAINT "personal_access_token_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Role Team IT Minister yang boleh membuat token (default: Head IT Minister saja).
ALTER TABLE "app_config"
  ADD COLUMN "api_access_it_roles" "it_minister_role"[] NOT NULL DEFAULT ARRAY['HEAD_IT_MINISTER']::"it_minister_role"[];
