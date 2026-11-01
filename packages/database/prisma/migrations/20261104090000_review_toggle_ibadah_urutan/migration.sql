-- Rating & ulasan bisa dimatikan per ibadah/event + urutan tampil ibadah di app (2.4.5)
ALTER TABLE "ibadah" ADD COLUMN "allow_review" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ibadah" ADD COLUMN "urutan" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "event" ADD COLUMN "allow_review" BOOLEAN NOT NULL DEFAULT true;

-- Urutan awal per cabang = urutan lama (hari, jam mulai, nama) supaya tampilan app tidak berubah.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "cabang_id"
    ORDER BY CASE "hari" WHEN 'MINGGU' THEN 0 WHEN 'SENIN' THEN 1 WHEN 'SELASA' THEN 2 WHEN 'RABU' THEN 3
                        WHEN 'KAMIS' THEN 4 WHEN 'JUMAT' THEN 5 WHEN 'SABTU' THEN 6 ELSE 7 END,
             "jam_mulai", "nama"
  ) AS rn
  FROM "ibadah"
)
UPDATE "ibadah" i SET "urutan" = ranked.rn FROM ranked WHERE ranked."id" = i."id";
