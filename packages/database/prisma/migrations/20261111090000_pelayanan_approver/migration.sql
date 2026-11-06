-- Otoritas approval request bergabung pelayanan per cabang.
CREATE TABLE "pelayanan_approver" (
    "id" UUID NOT NULL,
    "pelayanan_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "cabang_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pelayanan_approver_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pelayanan_approver_pelayanan_id_jemaat_id_cabang_id_key" ON "pelayanan_approver"("pelayanan_id", "jemaat_id", "cabang_id");
CREATE INDEX "pelayanan_approver_jemaat_id_idx" ON "pelayanan_approver"("jemaat_id");
CREATE INDEX "pelayanan_approver_pelayanan_id_cabang_id_idx" ON "pelayanan_approver"("pelayanan_id", "cabang_id");
ALTER TABLE "pelayanan_approver" ADD CONSTRAINT "pelayanan_approver_pelayanan_id_fkey" FOREIGN KEY ("pelayanan_id") REFERENCES "pelayanan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pelayanan_approver" ADD CONSTRAINT "pelayanan_approver_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pelayanan_approver" ADD CONSTRAINT "pelayanan_approver_cabang_id_fkey" FOREIGN KEY ("cabang_id") REFERENCES "cabang_gereja"("id") ON DELETE CASCADE ON UPDATE CASCADE;
