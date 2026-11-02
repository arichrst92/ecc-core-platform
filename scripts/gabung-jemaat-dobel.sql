-- Gabungkan data jemaat ganda (hasil scripts/cari-anak-dobel.sql, 2026-11-02).
-- Semua data milik "hapus" dipindah ke "pertahankan" (relasi keluarga, kehadiran,
-- reservasi, homecell, ministry, dll — semua tabel yang menunjuk ke jemaat),
-- lalu data "hapus" dihapus. Baris yang bentrok (sudah ada di "pertahankan")
-- dibuang dari sisi "hapus".
--
-- Uji dulu (tidak menyimpan):  psql "$DB_URL" -v apply=0 -f scripts/gabung-jemaat-dobel.sql
-- Simpan:                      psql "$DB_URL" -v apply=1 -f scripts/gabung-jemaat-dobel.sql

\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.gabung_jemaat(keep uuid, hapus uuid, tgl date, hp text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  fk record;
  r record;
  n_pindah int;
  n_buang int;
  k record;
  d record;
BEGIN
  SELECT * INTO k FROM jemaat WHERE id = keep;
  SELECT * INTO d FROM jemaat WHERE id = hapus;
  IF k.id IS NULL OR d.id IS NULL THEN
    RAISE EXCEPTION 'Jemaat tidak ditemukan: % / %', keep, hapus;
  END IF;
  IF EXISTS (SELECT 1 FROM "user" WHERE jemaat_id = keep) AND EXISTS (SELECT 1 FROM "user" WHERE jemaat_id = hapus) THEN
    RAISE EXCEPTION 'Keduanya punya akun login (%): gabungkan manual', k.nama_lengkap;
  END IF;
  RAISE NOTICE '== % : % <- %', k.nama_lengkap, keep, hapus;

  -- Kolom unik pindah dulu (lepas dari data yang dihapus), isi bila kosong.
  UPDATE jemaat SET no_hp = NULL, kode = CASE WHEN k.kode IS NULL THEN NULL ELSE kode END,
                    email = CASE WHEN k.email IS NULL THEN NULL ELSE email END
  WHERE id = hapus;
  UPDATE jemaat SET
    tanggal_lahir = COALESCE(tgl, tanggal_lahir, d.tanggal_lahir),
    no_hp = COALESCE(hp, no_hp, d.no_hp),
    kode = COALESCE(kode, d.kode),
    email = COALESCE(email, d.email),
    jenis_kelamin = COALESCE(jenis_kelamin, d.jenis_kelamin),
    updated_at = NOW()
  WHERE id = keep;

  -- Semua foreign key (satu kolom) yang menunjuk ke jemaat.id.
  FOR fk IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'jemaat'::regclass AND array_length(c.conkey, 1) = 1
  LOOP
    n_pindah := 0;
    n_buang := 0;
    FOR r IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', fk.tbl, fk.col) USING hapus LOOP
      BEGIN
        EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', fk.tbl, fk.col) USING keep, r.ctid;
        n_pindah := n_pindah + 1;
      EXCEPTION WHEN unique_violation THEN
        EXECUTE format('DELETE FROM %s WHERE ctid = $1', fk.tbl) USING r.ctid;
        n_buang := n_buang + 1;
      END;
    END LOOP;
    IF n_pindah + n_buang > 0 THEN
      RAISE NOTICE '   %.%: % dipindah, % dibuang (sudah ada)', fk.tbl, fk.col, n_pindah, n_buang;
    END IF;
  END LOOP;

  -- Relasi keluarga ke diri sendiri (dulu antara dua data ganda) dibuang.
  DELETE FROM jemaat_relasi WHERE jemaat_id = keep AND jemaat_terkait_id = keep;

  -- Role ganda (role + sub role sama, sama-sama aktif) → sisakan yang paling lama.
  DELETE FROM jemaat_role x
  USING jemaat_role y
  WHERE x.jemaat_id = keep AND y.jemaat_id = keep
    AND x.role_id = y.role_id AND x.sub_role_id = y.sub_role_id
    AND x.is_active = y.is_active
    AND (x.created_at, x.id) > (y.created_at, y.id);

  DELETE FROM jemaat WHERE id = hapus;
END;
$$;

--                              pertahankan                              hapus                                   tanggal lahir  no HP
SELECT pg_temp.gabung_jemaat('f98d7b88-003a-4f43-9bb4-2c26746e6369', 'b3a8ee93-08c4-49e8-a3ef-58cd5ac7d181', '2013-11-13', '+628111451515');  -- Kayla Abbe
SELECT pg_temp.gabung_jemaat('7ed9d974-d495-49c3-984f-3ab8e3a720a2', '91b54f4f-af35-4079-8d2f-3f47d0a3bda1', '2014-10-10', NULL);              -- Chloe Adelyne Saputro
SELECT pg_temp.gabung_jemaat('5e8522f8-ba54-40c4-90a7-cc74a46d31d4', '86186c3a-1349-460a-bdf8-155565805aca', '2009-05-01', '+6283195212263'); -- Clayton Rhoderick Saputro
SELECT pg_temp.gabung_jemaat('e3470e53-a38c-460d-83ab-0eb8e13e5b0e', '6e3c43a1-6c35-4dd2-9a84-e4098d687c0e', '2003-08-06', '+6281320729445'); -- Marvin Marvelous
SELECT pg_temp.gabung_jemaat('c4946bfb-7856-4849-b70b-308817c31fcd', '8f05ffc1-f51b-4a6d-9f92-3466c3df8239', '2020-08-27', NULL);              -- Shanette Maddelyn
SELECT pg_temp.gabung_jemaat('8327e8ee-193f-40a9-93c1-14de82e018d9', 'bedce92a-8984-44ef-9df5-26595e755f67', '2013-11-13', '+6281901002571'); -- Jane Natalie
-- Catharine Christianty Lunggawa TIDAK digabung: kedua data punya akun login sendiri
-- (kemungkinan dua orang berbeda) — dicek manual bersama pengerja.

-- Bambang Lunggawa: laki-laki → "Ayah" Catharine (bukan "Ibu").
UPDATE jemaat SET jenis_kelamin = 'L', updated_at = NOW() WHERE nama_lengkap = 'Bambang Lunggawa';
UPDATE jemaat_relasi r SET tipe_relasi_id = (SELECT id FROM tipe_relasi_keluarga WHERE nama = 'Ayah'), updated_at = NOW()
FROM jemaat b
WHERE b.nama_lengkap = 'Bambang Lunggawa' AND r.jemaat_terkait_id = b.id
  AND r.tipe_relasi_id = (SELECT id FROM tipe_relasi_keluarga WHERE nama = 'Ibu');

-- Hasil
SELECT j.nama_lengkap, j.kode, j.tanggal_lahir, j.no_hp,
       (SELECT string_agg(ro.nama, ', ') FROM jemaat_role jr JOIN role ro ON ro.id = jr.role_id WHERE jr.jemaat_id = j.id AND jr.is_active) AS role_aktif,
       string_agg(o.nama_lengkap || ' (' || t.nama || ')', ', ' ORDER BY t.nama) AS orang_tua
FROM jemaat j
LEFT JOIN jemaat_relasi r ON r.jemaat_id = j.id
LEFT JOIN tipe_relasi_keluarga t ON t.id = r.tipe_relasi_id AND t.nama IN ('Ayah', 'Ibu')
LEFT JOIN jemaat o ON o.id = r.jemaat_terkait_id AND t.id IS NOT NULL
WHERE j.id IN ('f98d7b88-003a-4f43-9bb4-2c26746e6369', '7ed9d974-d495-49c3-984f-3ab8e3a720a2', '5e8522f8-ba54-40c4-90a7-cc74a46d31d4',
               'e3470e53-a38c-460d-83ab-0eb8e13e5b0e', 'c4946bfb-7856-4849-b70b-308817c31fcd', '8327e8ee-193f-40a9-93c1-14de82e018d9',
               '8ab5c411-4392-4395-aed0-6baad0cbf91f', 'c9645edc-57b6-4a3d-a5fa-a29866211a34')
GROUP BY j.id ORDER BY j.nama_lengkap;

\if :apply
COMMIT;
\else
ROLLBACK;
\endif
