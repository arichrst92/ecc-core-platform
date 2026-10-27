-- Homecell: kategori (single/couple) + rentang usia anggota (opsional)
CREATE TYPE "HomecellKategori" AS ENUM ('SINGLE', 'COUPLE');
ALTER TABLE "homecell"
  ADD COLUMN "kategori" "HomecellKategori",
  ADD COLUMN "usia_min" INTEGER,
  ADD COLUMN "usia_max" INTEGER;
