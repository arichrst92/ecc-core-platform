-- ============================================================
-- SinodeApiKey: sinode_id nullable.
-- ============================================================
-- API key sekarang default global (lintas sinode). Kolom sinode_id
-- masih di-keep untuk backward-compat — kalau diisi, key scoped ke
-- sinode tersebut. NULL = global.

ALTER TABLE "sinode_api_key"
  ALTER COLUMN "sinode_id" DROP NOT NULL;
