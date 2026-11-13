-- Akses CKids sampai posisi di dalam pelayanan (mis. Multimedia → Sound System).
ALTER TABLE "ckids_menu_access" ADD COLUMN "pelayanan_role_id" UUID;
CREATE UNIQUE INDEX "ckids_menu_access_menu_key_pelayanan_role_id_key" ON "ckids_menu_access"("menu_key", "pelayanan_role_id");
CREATE INDEX "ckids_menu_access_pelayanan_role_id_idx" ON "ckids_menu_access"("pelayanan_role_id");
ALTER TABLE "ckids_menu_access" ADD CONSTRAINT "ckids_menu_access_pelayanan_role_id_fkey"
    FOREIGN KEY ("pelayanan_role_id") REFERENCES "pelayanan_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
