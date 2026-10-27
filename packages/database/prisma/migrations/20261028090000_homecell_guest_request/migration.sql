-- Permintaan bergabung homecell dari mode tamu (tanpa akun)
CREATE TABLE "homecell_guest_request" (
    "id" UUID NOT NULL,
    "homecell_id" UUID NOT NULL,
    "nama" VARCHAR(255) NOT NULL,
    "no_hp" VARCHAR(20) NOT NULL,
    "jenis_kelamin" "jenis_kelamin",
    "usia" INTEGER,
    "pesan" VARCHAR(500),
    "status" "homecell_join_status" NOT NULL DEFAULT 'PENDING',
    "token_hash" VARCHAR(64) NOT NULL,
    "tamu_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reject_reason" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "homecell_guest_request_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "homecell_guest_request_token_hash_key" ON "homecell_guest_request"("token_hash");
CREATE INDEX "homecell_guest_request_homecell_id_status_created_at_idx" ON "homecell_guest_request"("homecell_id", "status", "created_at");
CREATE INDEX "homecell_guest_request_no_hp_status_idx" ON "homecell_guest_request"("no_hp", "status");
ALTER TABLE "homecell_guest_request" ADD CONSTRAINT "homecell_guest_request_homecell_id_fkey" FOREIGN KEY ("homecell_id") REFERENCES "homecell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_guest_request" ADD CONSTRAINT "homecell_guest_request_tamu_id_fkey" FOREIGN KEY ("tamu_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "homecell_guest_request" ADD CONSTRAINT "homecell_guest_request_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
