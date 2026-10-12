-- RBAC backfill menu "Permintaan Volunteer" (ministry-join-requests).
-- Role Fulltimer otomatis dapat FULL access. Leader non-Fulltimer tetap
-- dibatasi API ke ministry yang dia pimpin.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'ministry-join-requests', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'ministry-join-requests'
  );
