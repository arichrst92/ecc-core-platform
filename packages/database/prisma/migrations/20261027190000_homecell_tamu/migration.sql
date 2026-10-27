-- Tamu homecell (dicatat pemimpin homecell dari app)
CREATE TABLE "homecell_tamu" (
    "id" UUID NOT NULL,
    "homecell_id" UUID NOT NULL,
    "tamu_id" UUID NOT NULL,
    "added_by_id" UUID,
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "homecell_tamu_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "homecell_tamu_homecell_id_tamu_id_key" ON "homecell_tamu"("homecell_id", "tamu_id");
CREATE INDEX "homecell_tamu_tamu_id_idx" ON "homecell_tamu"("tamu_id");
ALTER TABLE "homecell_tamu" ADD CONSTRAINT "homecell_tamu_homecell_id_fkey" FOREIGN KEY ("homecell_id") REFERENCES "homecell"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_tamu" ADD CONSTRAINT "homecell_tamu_tamu_id_fkey" FOREIGN KEY ("tamu_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_tamu" ADD CONSTRAINT "homecell_tamu_added_by_id_fkey" FOREIGN KEY ("added_by_id") REFERENCES "jemaat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
