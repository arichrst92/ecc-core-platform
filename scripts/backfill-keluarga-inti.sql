-- Lengkapi relasi keluarga inti yang sudah ada (sekali jalan, aman diulang).
-- Kasus: suami menambahkan istri & anak → anak terhubung ke suami saja.
-- Skrip ini menghubungkan pasangan dengan anak-anak pasangannya (dua arah:
-- Anak Laki-Laki/Perempuan ↔ Ayah/Ibu). Relasi yang sudah ada di antara dua
-- orang TIDAK diubah.
--
-- Pratinjau:  psql "$DB_URL" -v apply=0 -f scripts/backfill-keluarga-inti.sql
-- Jalankan:   psql "$DB_URL" -v apply=1 -f scripts/backfill-keluarga-inti.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE kandidat ON COMMIT DROP AS
WITH t AS (SELECT id, nama FROM tipe_relasi_keluarga),
pasangan AS (
  SELECT r.jemaat_id AS a, r.jemaat_terkait_id AS s, tt.nama AS tipe
  FROM jemaat_relasi r JOIN t tt ON tt.id = r.tipe_relasi_id
  WHERE tt.nama IN ('Suami', 'Istri')
),
anak AS (
  SELECT r.jemaat_id AS ortu, r.jemaat_terkait_id AS anak
  FROM jemaat_relasi r JOIN t tt ON tt.id = r.tipe_relasi_id
  WHERE tt.nama IN ('Anak Laki-Laki', 'Anak Perempuan')
)
SELECT DISTINCT ON (p.s, a.anak)
  p.s AS ortu,
  a.anak,
  -- Jenis kelamin orang tua: dari data jemaat, cadangan dari tipe pasangan.
  COALESCE(jo.jenis_kelamin::text, CASE WHEN p.tipe = 'Istri' THEN 'P' ELSE 'L' END) AS jk_ortu,
  COALESCE(ja.jenis_kelamin::text, 'L') AS jk_anak
FROM pasangan p
JOIN anak a ON a.ortu = p.a
JOIN jemaat jo ON jo.id = p.s
JOIN jemaat ja ON ja.id = a.anak
WHERE p.s <> a.anak
  AND NOT EXISTS (
    SELECT 1 FROM jemaat_relasi x
    WHERE (x.jemaat_id = p.s AND x.jemaat_terkait_id = a.anak)
       OR (x.jemaat_id = a.anak AND x.jemaat_terkait_id = p.s)
  );

SELECT jo.nama_lengkap AS orang_tua, ja.nama_lengkap AS anak
FROM kandidat k JOIN jemaat jo ON jo.id = k.ortu JOIN jemaat ja ON ja.id = k.anak
ORDER BY 1, 2;
SELECT COUNT(*) AS jumlah_pasangan_ortu_anak_baru FROM kandidat;

\if :apply
INSERT INTO jemaat_relasi (id, jemaat_id, jemaat_terkait_id, tipe_relasi_id, created_at, updated_at)
SELECT gen_random_uuid(), k.ortu, k.anak,
       (SELECT id FROM tipe_relasi_keluarga WHERE nama = CASE WHEN k.jk_anak = 'P' THEN 'Anak Perempuan' ELSE 'Anak Laki-Laki' END),
       NOW(), NOW()
FROM kandidat k
ON CONFLICT DO NOTHING;

INSERT INTO jemaat_relasi (id, jemaat_id, jemaat_terkait_id, tipe_relasi_id, created_at, updated_at)
SELECT gen_random_uuid(), k.anak, k.ortu,
       (SELECT id FROM tipe_relasi_keluarga WHERE nama = CASE WHEN k.jk_ortu = 'P' THEN 'Ibu' ELSE 'Ayah' END),
       NOW(), NOW()
FROM kandidat k
ON CONFLICT DO NOTHING;
COMMIT;
\else
ROLLBACK;
\endif
