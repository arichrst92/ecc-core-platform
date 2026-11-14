-- RBAC backfill menu Developer Tools baru: 'dev-download' (Download dokumentasi)
-- dan 'api-access' (token API pribadi Team IT Minister). Default: role Fulltimer.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", k.menu_key, true, true, true, CURRENT_TIMESTAMP
FROM "role" r
CROSS JOIN (VALUES ('dev-download'), ('api-access')) AS k(menu_key)
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = k.menu_key
  );
