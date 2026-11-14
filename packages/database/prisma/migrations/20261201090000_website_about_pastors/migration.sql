-- Tim pastoral halaman "Tentang Kami" kini dikonfigurasi di Portal → Konten Website
-- (section about.pastors: JSON array {nama, jabatan, cabang, fotoUrl}).
-- Isi awal = data yang selama ini tampil (pelayanan Penggembalaan, level ≥ 8),
-- supaya website tidak kosong setelah deploy. Admin bisa ubah / urutkan / hapus.
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
SELECT
  'about.pastors',
  'About — Tim Pastoral',
  'json',
  COALESCE((
    SELECT json_agg(json_build_object('nama', t.nama, 'jabatan', t.jabatan, 'cabang', t.cabang, 'fotoUrl', t.foto) ORDER BY t.level DESC, t.nama)
    FROM (
      SELECT DISTINCT ON (j."id") j."nama_lengkap" AS nama, pr."nama" AS jabatan, c."nama" AS cabang, j."foto_url" AS foto, pr."level" AS level
      FROM "jemaat_pelayanan" jp
      JOIN "pelayanan" p ON p."id" = jp."pelayanan_id" AND LOWER(p."nama") = 'penggembalaan' AND p."is_active"
      JOIN "pelayanan_role" pr ON pr."id" = jp."pelayanan_role_id" AND pr."level" >= 8 AND pr."is_active"
      JOIN "jemaat" j ON j."id" = jp."jemaat_id" AND j."is_active"
      LEFT JOIN "cabang_gereja" c ON c."id" = j."cabang_id"
      WHERE jp."is_active"
      ORDER BY j."id", pr."level" DESC
    ) t
  )::text, '[]'),
  'Tim pastoral di halaman Tentang Kami. Diatur lewat editor khusus (foto persegi, nama, jabatan, cabang).',
  CURRENT_TIMESTAMP
ON CONFLICT ("key") DO NOTHING;
