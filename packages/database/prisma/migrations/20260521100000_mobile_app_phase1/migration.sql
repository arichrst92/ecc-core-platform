-- ============================================================
-- Mobile App Phase 1 — Family, Branch Change, Self-Onboarding
-- ============================================================
-- Migration ini mendukung gap-analysis feedback tim mobile app (2026-05-19):
--   * M5 Family management: model FamilyRelation
--   * M6 Branch change request: model BranchChangeRequest
--   * M1 Self-registration: kolom audit primaryGuardianId + registeredViaJemaatId di Jemaat
--
-- noHp sudah nullable di schema sebelumnya (`String?`), jadi tidak perlu
-- ALTER COLUMN.
-- ============================================================

-- ----------------------------------------------
-- Jemaat: kolom guardian + self-onboarding audit
-- ----------------------------------------------
ALTER TABLE "jemaat"
  ADD COLUMN "primary_guardian_id"     UUID,
  ADD COLUMN "registered_via_jemaat_id" UUID;

ALTER TABLE "jemaat"
  ADD CONSTRAINT "jemaat_primary_guardian_id_fkey"
  FOREIGN KEY ("primary_guardian_id") REFERENCES "jemaat"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "jemaat"
  ADD CONSTRAINT "jemaat_registered_via_jemaat_id_fkey"
  FOREIGN KEY ("registered_via_jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "jemaat_primary_guardian_id_idx" ON "jemaat"("primary_guardian_id");

-- ----------------------------------------------
-- FamilyRelation
-- ----------------------------------------------
CREATE TYPE "family_role" AS ENUM ('SPOUSE', 'CHILD', 'PARENT', 'SIBLING');

CREATE TABLE "family_relation" (
  "id"           UUID NOT NULL,
  "jemaat_a_id"  UUID NOT NULL,
  "jemaat_b_id"  UUID NOT NULL,
  "role"         "family_role" NOT NULL,
  "is_verified"  BOOLEAN NOT NULL DEFAULT true,
  "created_by"   UUID,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "family_relation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "family_relation_jemaat_a_id_jemaat_b_id_key"
  ON "family_relation"("jemaat_a_id", "jemaat_b_id");
CREATE INDEX "family_relation_jemaat_a_id_idx" ON "family_relation"("jemaat_a_id");
CREATE INDEX "family_relation_jemaat_b_id_idx" ON "family_relation"("jemaat_b_id");

ALTER TABLE "family_relation"
  ADD CONSTRAINT "family_relation_jemaat_a_id_fkey"
  FOREIGN KEY ("jemaat_a_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "family_relation"
  ADD CONSTRAINT "family_relation_jemaat_b_id_fkey"
  FOREIGN KEY ("jemaat_b_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------
-- BranchChangeRequest
-- ----------------------------------------------
CREATE TYPE "branch_change_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "branch_change_request" (
  "id"                UUID NOT NULL,
  "jemaat_id"         UUID NOT NULL,
  "current_cabang_id" UUID NOT NULL,
  "target_cabang_id"  UUID NOT NULL,
  "reason"            TEXT,
  "status"            "branch_change_status" NOT NULL DEFAULT 'PENDING',
  "reviewed_by"       UUID,
  "reviewed_at"       TIMESTAMP(3),
  "review_note"       TEXT,
  "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "branch_change_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "branch_change_request_jemaat_id_idx" ON "branch_change_request"("jemaat_id");
CREATE INDEX "branch_change_request_status_idx" ON "branch_change_request"("status");

ALTER TABLE "branch_change_request"
  ADD CONSTRAINT "branch_change_request_jemaat_id_fkey"
  FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_change_request"
  ADD CONSTRAINT "branch_change_request_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "jemaat"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
