-- Onboarding Config: role otomatis saat daftar/onboarding di app (sebelumnya hardcode).
CREATE TABLE "onboarding_role_rule" (
    "id" UUID NOT NULL,
    "jenis" VARCHAR(20) NOT NULL,
    "role_id" UUID NOT NULL,
    "sub_role_id" UUID NOT NULL,
    "sub_role_status_id" UUID,
    "urutan" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "onboarding_role_rule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "onboarding_role_rule_jenis_idx" ON "onboarding_role_rule"("jenis");
ALTER TABLE "onboarding_role_rule" ADD CONSTRAINT "onboarding_role_rule_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_role_rule" ADD CONSTRAINT "onboarding_role_rule_sub_role_id_fkey" FOREIGN KEY ("sub_role_id") REFERENCES "sub_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "onboarding_role_rule" ADD CONSTRAINT "onboarding_role_rule_sub_role_status_id_fkey" FOREIGN KEY ("sub_role_status_id") REFERENCES "sub_role_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Isi awal = perilaku lama: Jemaat → Jemaat Tetap / Jemaat → New Comer.
INSERT INTO "onboarding_role_rule" ("id", "jenis", "role_id", "sub_role_id", "urutan", "updated_at")
SELECT gen_random_uuid(), x.jenis, r."id", sr."id", 1, CURRENT_TIMESTAMP
FROM (VALUES ('JEMAAT_TETAP', 'jemaat tetap'), ('NEW_COMER', 'new comer')) AS x(jenis, sub)
JOIN "role" r ON r."nama" = 'Jemaat' AND r."is_active" = true
JOIN "sub_role" sr ON sr."role_id" = r."id" AND LOWER(sr."nama") = x.sub AND sr."is_active" = true;

-- Menu Portal "Onboarding Config" (App Settings): akses penuh untuk Fulltimer.
-- Role lain bisa diberi akses lewat Portal → Role Access.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'onboarding-config', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (SELECT 1 FROM "role_menu_access" a WHERE a."role_id" = r."id" AND a."menu_key" = 'onboarding-config');
