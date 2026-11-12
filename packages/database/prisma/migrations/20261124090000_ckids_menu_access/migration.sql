-- Akses menu aplikasi CKids per pelayanan / role.
CREATE TABLE "ckids_menu_access" (
    "id" UUID NOT NULL,
    "menu_key" VARCHAR(40) NOT NULL,
    "pelayanan_id" UUID,
    "role_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ckids_menu_access_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ckids_menu_access_menu_key_pelayanan_id_key" ON "ckids_menu_access"("menu_key", "pelayanan_id");
CREATE UNIQUE INDEX "ckids_menu_access_menu_key_role_id_key" ON "ckids_menu_access"("menu_key", "role_id");
CREATE INDEX "ckids_menu_access_pelayanan_id_idx" ON "ckids_menu_access"("pelayanan_id");
CREATE INDEX "ckids_menu_access_role_id_idx" ON "ckids_menu_access"("role_id");
ALTER TABLE "ckids_menu_access" ADD CONSTRAINT "ckids_menu_access_pelayanan_id_fkey"
    FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ckids_menu_access" ADD CONSTRAINT "ckids_menu_access_role_id_fkey"
    FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
