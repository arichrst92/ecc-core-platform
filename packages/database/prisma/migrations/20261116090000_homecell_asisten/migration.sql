-- Asisten homecell (2.4.7): ditunjuk PIC dari anggota aktif.
ALTER TABLE "homecell_member" ADD COLUMN "is_asisten" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'HOMECELL_ASISTEN_ASSIGNED';
