-- Bible 365: program baca Alkitab 365 hari
CREATE TYPE "Bible365Status" AS ENUM ('AKTIF', 'SELESAI', 'DIHENTIKAN');

CREATE TABLE "bible365_plan" (
    "id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "putaran" INTEGER NOT NULL DEFAULT 1,
    "start_date" DATE NOT NULL,
    "status" "Bible365Status" NOT NULL DEFAULT 'AKTIF',
    "completed_at" TIMESTAMP(3),
    "stopped_at" TIMESTAMP(3),
    "reminder_time" VARCHAR(5),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bible365_plan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "bible365_plan_jemaat_id_status_idx" ON "bible365_plan"("jemaat_id", "status");
CREATE INDEX "bible365_plan_status_idx" ON "bible365_plan"("status");
-- Paling banyak satu plan AKTIF per jemaat.
CREATE UNIQUE INDEX "bible365_plan_one_active" ON "bible365_plan"("jemaat_id") WHERE "status" = 'AKTIF';
ALTER TABLE "bible365_plan" ADD CONSTRAINT "bible365_plan_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "bible365_reading" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "book_id" INTEGER NOT NULL,
    "bab" INTEGER NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bible365_reading_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bible365_reading_plan_id_book_id_bab_key" ON "bible365_reading"("plan_id", "book_id", "bab");
CREATE INDEX "bible365_reading_plan_id_day_idx" ON "bible365_reading"("plan_id", "day");
ALTER TABLE "bible365_reading" ADD CONSTRAINT "bible365_reading_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "bible365_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "bible365_note" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "isi" TEXT NOT NULL,
    "ayat" VARCHAR(60),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bible365_note_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bible365_note_plan_id_day_key" ON "bible365_note"("plan_id", "day");
ALTER TABLE "bible365_note" ADD CONSTRAINT "bible365_note_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "bible365_plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Menu portal "Bible 365" (statistik): semua role portal boleh lihat.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'bible365', true, false, false, CURRENT_TIMESTAMP
FROM "role" r WHERE r."can_access_portal" = true
ON CONFLICT ("role_id", "menu_key") DO NOTHING;
