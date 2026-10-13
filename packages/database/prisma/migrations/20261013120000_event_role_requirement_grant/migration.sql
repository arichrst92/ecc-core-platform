-- Event: syarat role untuk mendaftar + role yang diberikan otomatis ke peserta (2026-10-13)
-- Manual SQL — hanya perubahan fitur ini. Apply via migrate deploy.

-- Event: role yang diberikan
ALTER TABLE "event" ADD COLUMN "grant_role_id" UUID;
ALTER TABLE "event" ADD COLUMN "grant_sub_role_id" UUID;
ALTER TABLE "event" ADD COLUMN "grant_sub_role_status_id" UUID;
ALTER TABLE "event" ADD CONSTRAINT "event_grant_role_id_fkey" FOREIGN KEY ("grant_role_id") REFERENCES "role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event" ADD CONSTRAINT "event_grant_sub_role_id_fkey" FOREIGN KEY ("grant_sub_role_id") REFERENCES "sub_role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event" ADD CONSTRAINT "event_grant_sub_role_status_id_fkey" FOREIGN KEY ("grant_sub_role_status_id") REFERENCES "sub_role_status"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JemaatRole: asal event (untuk pencabutan saat BATAL)
ALTER TABLE "jemaat_role" ADD COLUMN "source_event_id" UUID;
CREATE INDEX "jemaat_role_source_event_id_idx" ON "jemaat_role"("source_event_id");
ALTER TABLE "jemaat_role" ADD CONSTRAINT "jemaat_role_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Syarat role
CREATE TABLE "event_role_requirement" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "sub_role_id" UUID,
    "sub_role_status_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_role_requirement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "event_role_requirement_event_id_idx" ON "event_role_requirement"("event_id");
ALTER TABLE "event_role_requirement" ADD CONSTRAINT "event_role_requirement_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_role_requirement" ADD CONSTRAINT "event_role_requirement_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_role_requirement" ADD CONSTRAINT "event_role_requirement_sub_role_id_fkey" FOREIGN KEY ("sub_role_id") REFERENCES "sub_role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_role_requirement" ADD CONSTRAINT "event_role_requirement_sub_role_status_id_fkey" FOREIGN KEY ("sub_role_status_id") REFERENCES "sub_role_status"("id") ON DELETE CASCADE ON UPDATE CASCADE;
