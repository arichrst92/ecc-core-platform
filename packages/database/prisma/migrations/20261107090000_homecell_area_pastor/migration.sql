-- Pastor zona (homecell area): banyak pastor per zona, satu pastor banyak zona.
CREATE TABLE "homecell_area_pastor" (
    "id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "jemaat_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "homecell_area_pastor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "homecell_area_pastor_area_id_jemaat_id_key" ON "homecell_area_pastor"("area_id", "jemaat_id");
CREATE INDEX "homecell_area_pastor_jemaat_id_idx" ON "homecell_area_pastor"("jemaat_id");
ALTER TABLE "homecell_area_pastor" ADD CONSTRAINT "homecell_area_pastor_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "homecell_area"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homecell_area_pastor" ADD CONSTRAINT "homecell_area_pastor_jemaat_id_fkey" FOREIGN KEY ("jemaat_id") REFERENCES "jemaat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
