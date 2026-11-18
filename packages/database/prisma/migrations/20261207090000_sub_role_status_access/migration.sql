-- Role Access level ketiga: Status (di bawah Sub-role).
-- Tambah kolom nullable + tabel baru saja → data & perilaku lama tidak berubah
-- (NULL / tanpa baris = mewarisi Sub-role → Role).
ALTER TABLE "sub_role_status" ADD COLUMN "can_access_portal" BOOLEAN;

CREATE TABLE "sub_role_status_menu_access" (
  "id"                 UUID NOT NULL,
  "sub_role_status_id" UUID NOT NULL,
  "menu_key"           VARCHAR(50) NOT NULL,
  "can_read"           BOOLEAN NOT NULL DEFAULT true,
  "can_write"          BOOLEAN NOT NULL DEFAULT false,
  "can_delete"         BOOLEAN NOT NULL DEFAULT false,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sub_role_status_menu_access_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sub_role_status_menu_access_sub_role_status_id_menu_key_key"
  ON "sub_role_status_menu_access"("sub_role_status_id", "menu_key");
CREATE INDEX "sub_role_status_menu_access_sub_role_status_id_idx"
  ON "sub_role_status_menu_access"("sub_role_status_id");

ALTER TABLE "sub_role_status_menu_access"
  ADD CONSTRAINT "sub_role_status_menu_access_sub_role_status_id_fkey"
  FOREIGN KEY ("sub_role_status_id") REFERENCES "sub_role_status"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
