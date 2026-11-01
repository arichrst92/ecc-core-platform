-- RBAC menu "Map View" (map-view) — peta cabang & homecell di Portal.
-- Role/sub role yang sudah boleh membaca menu Cabang atau Homecell otomatis
-- boleh membuka Map View (baca saja). Role Fulltimer: akses penuh.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'map-view', true, LOWER(r."nama") = 'fulltimer', LOWER(r."nama") = 'fulltimer', CURRENT_TIMESTAMP
FROM "role" r
WHERE (
    LOWER(r."nama") = 'fulltimer'
    OR EXISTS (
      SELECT 1 FROM "role_menu_access" x
      WHERE x."role_id" = r."id" AND x."menu_key" IN ('cabang', 'homecell', 'homecell-area') AND x."can_read" = true
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma WHERE rma."role_id" = r."id" AND rma."menu_key" = 'map-view'
  );

INSERT INTO "sub_role_menu_access" ("id", "sub_role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), sr."id", 'map-view', true, false, false, CURRENT_TIMESTAMP
FROM "sub_role" sr
WHERE EXISTS (
    SELECT 1 FROM "sub_role_menu_access" x
    WHERE x."sub_role_id" = sr."id" AND x."menu_key" IN ('cabang', 'homecell', 'homecell-area') AND x."can_read" = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM "sub_role_menu_access" srma WHERE srma."sub_role_id" = sr."id" AND srma."menu_key" = 'map-view'
  );
