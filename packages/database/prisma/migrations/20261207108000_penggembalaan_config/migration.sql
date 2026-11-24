-- Pelayanan penggembalaan dikenali dari ID (boleh di-rename). Diisi otomatis dari nama bawaan.
ALTER TABLE "app_config" ADD COLUMN IF NOT EXISTS "penggembalaan_pelayanan_id" UUID;
ALTER TABLE "app_config" ADD COLUMN IF NOT EXISTS "zone_leader_role_id" UUID;
ALTER TABLE "app_config" ADD COLUMN IF NOT EXISTS "homecell_leader_role_id" UUID;
ALTER TABLE "app_config" ADD COLUMN IF NOT EXISTS "pastor_role_id" UUID;

-- Isi dari nama saat ini (sebelum ada yang di-rename).
INSERT INTO "app_config" ("id", "updated_at") VALUES ('global', NOW()) ON CONFLICT ("id") DO NOTHING;
UPDATE "app_config" ac SET
  "penggembalaan_pelayanan_id" = COALESCE(ac."penggembalaan_pelayanan_id", p.id),
  "zone_leader_role_id" = COALESCE(ac."zone_leader_role_id", (SELECT r.id FROM "pelayanan_role" r WHERE r.pelayanan_id = p.id AND lower(r.nama) = 'zone leader' LIMIT 1)),
  "homecell_leader_role_id" = COALESCE(ac."homecell_leader_role_id", (SELECT r.id FROM "pelayanan_role" r WHERE r.pelayanan_id = p.id AND lower(r.nama) = 'homecell leader' LIMIT 1)),
  "pastor_role_id" = COALESCE(ac."pastor_role_id", (SELECT r.id FROM "pelayanan_role" r WHERE r.pelayanan_id = p.id AND lower(r.nama) = 'pastor' LIMIT 1))
FROM (SELECT id FROM "pelayanan" WHERE lower(nama) = 'penggembalaan' ORDER BY created_at LIMIT 1) p
WHERE ac.id = 'global';
