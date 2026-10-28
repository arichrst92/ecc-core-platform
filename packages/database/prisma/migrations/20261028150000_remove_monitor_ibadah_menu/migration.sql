-- Menu "Monitor Ibadah" dihapus dari portal (diganti layar /monitor dengan kode akses).
-- Bersihkan akses lama di Role Access (role & sub role).
DELETE FROM "role_menu_access" WHERE "menu_key" = 'monitor-ibadah';
DELETE FROM "sub_role_menu_access" WHERE "menu_key" = 'monitor-ibadah';
