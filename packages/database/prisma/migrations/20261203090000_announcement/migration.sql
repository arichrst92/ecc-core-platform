-- Announcement (Portal → Broadcast → Announcement): pengumuman ke jemaat lewat
-- In App (popup + daftar notifikasi), WhatsApp (bertahap), dan Email.
-- Manual SQL.

ALTER TYPE "in_app_notif_type" ADD VALUE IF NOT EXISTS 'ANNOUNCEMENT';

CREATE TABLE "announcement" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "slug"            VARCHAR(220) NOT NULL,
  "judul"           VARCHAR(200) NOT NULL,
  "isi"             TEXT         NOT NULL,
  "banner_url"      TEXT,
  -- [{ "label": "...", "url": "https://..." }]
  "links"           JSONB        NOT NULL DEFAULT '[]',
  -- ALL = semua jemaat; FILTER = saring (cabang/area/homecell/jemaat)
  "audience_mode"   VARCHAR(10)  NOT NULL DEFAULT 'ALL',
  -- OR = salah satu saringan; AND = semua saringan
  "combine"         VARCHAR(5)   NOT NULL DEFAULT 'OR',
  "cabang_ids"      UUID[]       NOT NULL DEFAULT '{}',
  "area_ids"        UUID[]       NOT NULL DEFAULT '{}',
  "homecell_ids"    UUID[]       NOT NULL DEFAULT '{}',
  "jemaat_ids"      UUID[]       NOT NULL DEFAULT '{}',
  -- IN_APP | WHATSAPP | EMAIL
  "channels"        VARCHAR(10)[] NOT NULL DEFAULT '{IN_APP}',
  -- auto | fonnte | starsender
  "wa_provider"     VARCHAR(20)  NOT NULL DEFAULT 'auto',
  -- DRAFT | SCHEDULED | SENDING | SENT | CANCELLED
  "status"          VARCHAR(12)  NOT NULL DEFAULT 'DRAFT',
  "scheduled_at"    TIMESTAMP(3),
  "started_at"      TIMESTAMP(3),
  "completed_at"    TIMESTAMP(3),
  "recipient_count" INTEGER      NOT NULL DEFAULT 0,
  "created_by_id"   UUID,
  "updated_by_id"   UUID,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "announcement_slug_key" ON "announcement"("slug");
CREATE INDEX "announcement_status_scheduled_at_idx" ON "announcement"("status", "scheduled_at");

CREATE TABLE "announcement_recipient" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "announcement_id" UUID         NOT NULL,
  "jemaat_id"       UUID         NOT NULL,
  -- status per kanal: PENDING | SENT | FAILED | SKIPPED (NULL = kanal tidak dipakai)
  "in_app_status"   VARCHAR(10),
  "wa_status"       VARCHAR(10),
  "wa_error"        TEXT,
  "wa_at"           TIMESTAMP(3),
  "email_status"    VARCHAR(10),
  "email_error"     TEXT,
  "email_at"        TIMESTAMP(3),
  -- dibuka (popup / detail) & popup ditutup
  "read_at"         TIMESTAMP(3),
  "dismissed_at"    TIMESTAMP(3),
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcement_recipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "announcement_recipient_announcement_id_jemaat_id_key" ON "announcement_recipient"("announcement_id", "jemaat_id");
CREATE INDEX "announcement_recipient_announcement_id_wa_status_idx" ON "announcement_recipient"("announcement_id", "wa_status");
CREATE INDEX "announcement_recipient_announcement_id_email_status_idx" ON "announcement_recipient"("announcement_id", "email_status");
CREATE INDEX "announcement_recipient_jemaat_id_dismissed_at_idx" ON "announcement_recipient"("jemaat_id", "dismissed_at");
ALTER TABLE "announcement_recipient" ADD CONSTRAINT "announcement_recipient_announcement_id_fkey"
  FOREIGN KEY ("announcement_id") REFERENCES "announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_recipient" ADD CONSTRAINT "announcement_recipient_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RBAC: menu baru 'announcement' — default role Fulltimer.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'announcement', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (SELECT 1 FROM "role_menu_access" rma WHERE rma."role_id" = r."id" AND rma."menu_key" = 'announcement');
