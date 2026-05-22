-- ============================================================
-- Movement — Visit (peer-to-peer pertemuan antar jemaat via scan QR)
-- ============================================================

CREATE TABLE "visit" (
  "id"                    UUID NOT NULL,
  "initiator_jemaat_id"   UUID NOT NULL,
  "target_jemaat_id"      UUID NOT NULL,
  "judul"                 VARCHAR(255) NOT NULL,
  "lokasi"                TEXT,
  "note_dari_initiator"   TEXT,
  "note_dari_target"      TEXT,
  "tanggal_visit"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "visit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "visit_initiator_jemaat_id_idx" ON "visit"("initiator_jemaat_id");
CREATE INDEX "visit_target_jemaat_id_idx"    ON "visit"("target_jemaat_id");
CREATE INDEX "visit_tanggal_visit_idx"       ON "visit"("tanggal_visit");

ALTER TABLE "visit"
  ADD CONSTRAINT "visit_initiator_jemaat_id_fkey"
  FOREIGN KEY ("initiator_jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "visit"
  ADD CONSTRAINT "visit_target_jemaat_id_fkey"
  FOREIGN KEY ("target_jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- RBAC backfill — semua role 'Fulltimer' dapat full access menu 'visit'.
-- Konsisten dengan pola di 20260519200000_rbac_menu_access.
-- ============================================================
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'visit', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'visit'
  );
