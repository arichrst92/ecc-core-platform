-- ============================================================
-- 1. Jemaat.kode (unique, nullable) — QR statis untuk scan kehadiran event.
-- ============================================================

ALTER TABLE "jemaat" ADD COLUMN "kode" VARCHAR(20);

-- Backfill kode untuk row existing. Pakai pgcrypto kalau ada, kalau tidak
-- fallback ke substring(md5(random())). Karakter 8 char alphanumeric upper.
-- Hindari karakter ambigu (0/O, 1/I) — sama strategi dgn kode-reservasi.ts.
DO $$
DECLARE
  r RECORD;
  k TEXT;
  retry INT;
  taken INT;
  alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  FOR r IN SELECT id FROM "jemaat" WHERE "kode" IS NULL LOOP
    retry := 0;
    LOOP
      -- Generate 8 char dari alphabet (32 chars, 5 bits each)
      k := '';
      FOR i IN 1..8 LOOP
        k := k || substr(alphabet, (floor(random() * 32))::int + 1, 1);
      END LOOP;
      SELECT count(*) INTO taken FROM "jemaat" WHERE "kode" = k;
      EXIT WHEN taken = 0;
      retry := retry + 1;
      IF retry > 10 THEN
        RAISE EXCEPTION 'Tidak bisa generate kode unik untuk jemaat %', r.id;
      END IF;
    END LOOP;
    UPDATE "jemaat" SET "kode" = k WHERE "id" = r.id;
  END LOOP;
END $$;

-- Unique + index (Prisma juga auto-buat dari @unique, tapi kita pakai nama
-- eksplisit supaya konsisten dgn schema-engine).
CREATE UNIQUE INDEX "jemaat_kode_key" ON "jemaat"("kode");
CREATE INDEX "jemaat_kode_idx" ON "jemaat"("kode");

-- ============================================================
-- 2. Event.butuhKehadiran — flag apakah event butuh absensi pada hari H.
-- ============================================================

ALTER TABLE "event"
  ADD COLUMN "butuh_kehadiran" BOOLEAN NOT NULL DEFAULT false;
