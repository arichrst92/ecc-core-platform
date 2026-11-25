-- Kategori WA config harus huruf besar (Portal mengelompokkan per kategori).
UPDATE "wa_notification_config" SET "category" = UPPER("category") WHERE "category" <> UPPER("category");
