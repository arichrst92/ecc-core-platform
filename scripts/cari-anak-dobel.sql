-- Cari data jemaat ganda: nama sama (abaikan huruf besar/kecil & spasi),
-- minimal satu datanya terhubung ke ayah/ibu. Hanya MEMBACA, tidak mengubah data.
--
--   KUAT    = ada dua data dengan nama sama yang orang tuanya sama / orang
--             tuanya suami-istri, ATAU tanggal lahirnya sama → hampir pasti
--             orang yang sama (gabungkan).
--   PERIKSA = nama sama, tapi orang tua tidak terkait → bisa orang berbeda.
--
-- Jalankan: psql "$DB_URL" -f scripts/cari-anak-dobel.sql

WITH ortu AS (
  SELECT r.jemaat_id AS anak, r.jemaat_terkait_id AS ortu
  FROM jemaat_relasi r JOIN tipe_relasi_keluarga t ON t.id = r.tipe_relasi_id
  WHERE t.nama IN ('Ayah', 'Ibu')
),
pasangan AS (
  SELECT r.jemaat_id AS a, r.jemaat_terkait_id AS b
  FROM jemaat_relasi r JOIN tipe_relasi_keluarga t ON t.id = r.tipe_relasi_id
  WHERE t.nama IN ('Suami', 'Istri')
),
nm AS (
  SELECT j.id,
         lower(regexp_replace(trim(j.nama_lengkap), '\s+', ' ', 'g')) AS n,
         EXISTS (SELECT 1 FROM ortu o WHERE o.anak = j.id) AS punya_ortu
  FROM jemaat j
  WHERE j.is_active AND NOT j.is_tamu
),
grup AS (
  SELECT n FROM nm GROUP BY n HAVING COUNT(*) > 1 AND bool_or(punya_ortu)
),
kuat AS (
  SELECT DISTINCT n1.n
  FROM nm n1
  JOIN nm n2 ON n2.n = n1.n AND n1.id < n2.id
  JOIN ortu o1 ON o1.anak = n1.id
  JOIN ortu o2 ON o2.anak = n2.id
  WHERE o1.ortu = o2.ortu
     OR EXISTS (SELECT 1 FROM pasangan p WHERE p.a = o1.ortu AND p.b = o2.ortu)
  UNION
  -- Nama sama + tanggal lahir sama (mis. satu data hasil impor tanpa orang tua).
  SELECT DISTINCT n1.n
  FROM nm n1
  JOIN nm n2 ON n2.n = n1.n AND n1.id < n2.id
  JOIN jemaat j1 ON j1.id = n1.id
  JOIN jemaat j2 ON j2.id = n2.id
  WHERE j1.tanggal_lahir IS NOT NULL AND j1.tanggal_lahir = j2.tanggal_lahir
)
SELECT
  CASE WHEN k.n IS NOT NULL THEN 'KUAT' ELSE 'PERIKSA' END AS tingkat,
  j.nama_lengkap,
  j.id,
  j.kode,
  j.tanggal_lahir,
  j.no_hp,
  j.created_at::date AS dibuat,
  c.nama AS cabang,
  string_agg(DISTINCT po.nama_lengkap || ' (' || t.nama || ')', ', ') AS orang_tua
FROM nm
JOIN grup g ON g.n = nm.n
JOIN jemaat j ON j.id = nm.id
LEFT JOIN cabang_gereja c ON c.id = j.cabang_id
LEFT JOIN kuat k ON k.n = nm.n
LEFT JOIN jemaat_relasi r ON r.jemaat_id = j.id
LEFT JOIN tipe_relasi_keluarga t ON t.id = r.tipe_relasi_id AND t.nama IN ('Ayah', 'Ibu')
LEFT JOIN jemaat po ON po.id = r.jemaat_terkait_id AND t.id IS NOT NULL
GROUP BY k.n, nm.n, j.id, c.nama
ORDER BY 1, nm.n, j.created_at;
