-- Approval punya akses Role Access sendiri (2026-11). Data saja, tanpa ubah skema.
-- Supaya tidak ada yang kehilangan akses saat rilis, akses awal disalin dari menu induk
-- di level yang sama (Role / Sub Role / Status):
--   spiritual-journey-request ← spiritual-journey
--   event-payment             ← event   (hapus tidak dipakai)
-- Setelah rilis, keduanya bisa diatur terpisah di Developer Tools → Role Access.

INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "created_at", "updated_at")
SELECT gen_random_uuid(), "role_id", 'spiritual-journey-request', "can_read", "can_write", "can_delete", now(), now()
FROM "role_menu_access" WHERE "menu_key" = 'spiritual-journey'
ON CONFLICT ("role_id", "menu_key") DO NOTHING;

INSERT INTO "sub_role_menu_access" ("id", "sub_role_id", "menu_key", "can_read", "can_write", "can_delete", "created_at", "updated_at")
SELECT gen_random_uuid(), "sub_role_id", 'spiritual-journey-request', "can_read", "can_write", "can_delete", now(), now()
FROM "sub_role_menu_access" WHERE "menu_key" = 'spiritual-journey'
ON CONFLICT ("sub_role_id", "menu_key") DO NOTHING;

INSERT INTO "sub_role_status_menu_access" ("id", "sub_role_status_id", "menu_key", "can_read", "can_write", "can_delete", "created_at", "updated_at")
SELECT gen_random_uuid(), "sub_role_status_id", 'spiritual-journey-request', "can_read", "can_write", "can_delete", now(), now()
FROM "sub_role_status_menu_access" WHERE "menu_key" = 'spiritual-journey'
ON CONFLICT ("sub_role_status_id", "menu_key") DO NOTHING;

INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "created_at", "updated_at")
SELECT gen_random_uuid(), "role_id", 'event-payment', "can_read", "can_write", false, now(), now()
FROM "role_menu_access" WHERE "menu_key" = 'event'
ON CONFLICT ("role_id", "menu_key") DO NOTHING;

INSERT INTO "sub_role_menu_access" ("id", "sub_role_id", "menu_key", "can_read", "can_write", "can_delete", "created_at", "updated_at")
SELECT gen_random_uuid(), "sub_role_id", 'event-payment', "can_read", "can_write", false, now(), now()
FROM "sub_role_menu_access" WHERE "menu_key" = 'event'
ON CONFLICT ("sub_role_id", "menu_key") DO NOTHING;

INSERT INTO "sub_role_status_menu_access" ("id", "sub_role_status_id", "menu_key", "can_read", "can_write", "can_delete", "created_at", "updated_at")
SELECT gen_random_uuid(), "sub_role_status_id", 'event-payment', "can_read", "can_write", false, now(), now()
FROM "sub_role_status_menu_access" WHERE "menu_key" = 'event'
ON CONFLICT ("sub_role_status_id", "menu_key") DO NOTHING;

-- Permintaan Volunteer: dulu Fulltimer di Portal otomatis boleh MEMPROSES semua
-- permintaan (cukup bisa membuka halaman). Sekarang memproses = akses tulis.
-- Pertahankan perilaku lama: level di bawah role Fulltimer yang sudah bisa
-- membuka halaman ini diberi akses tulis (bisa dicabut lagi di Role Access).
UPDATE "role_menu_access" a SET "can_write" = true, "updated_at" = now()
FROM "role" r
WHERE a."role_id" = r."id" AND r."nama" = 'Fulltimer'
  AND a."menu_key" = 'ministry-join-requests' AND a."can_read" AND NOT a."can_write";

UPDATE "sub_role_menu_access" a SET "can_write" = true, "updated_at" = now()
FROM "sub_role" s JOIN "role" r ON r."id" = s."role_id"
WHERE a."sub_role_id" = s."id" AND r."nama" = 'Fulltimer'
  AND a."menu_key" = 'ministry-join-requests' AND a."can_read" AND NOT a."can_write";

UPDATE "sub_role_status_menu_access" a SET "can_write" = true, "updated_at" = now()
FROM "sub_role_status" st JOIN "sub_role" s ON s."id" = st."sub_role_id" JOIN "role" r ON r."id" = s."role_id"
WHERE a."sub_role_status_id" = st."id" AND r."nama" = 'Fulltimer'
  AND a."menu_key" = 'ministry-join-requests' AND a."can_read" AND NOT a."can_write";
