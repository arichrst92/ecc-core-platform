-- ============================================================
-- Website Section — CMS untuk landing site (eccchurch.global)
-- ============================================================
-- Generic key-value content store untuk company profile compro.
-- Admin edit via portal Website group, landing fetch /public/website-content.

CREATE TABLE "website_section" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "key"                 VARCHAR(64) NOT NULL,
  "title"               VARCHAR(255) NOT NULL,
  "content_type"        VARCHAR(32) NOT NULL DEFAULT 'markdown',
  "content"             TEXT NOT NULL,
  "description"         TEXT,
  "is_active"           BOOLEAN NOT NULL DEFAULT true,
  "updated_by_user_id"  UUID,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "website_section_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "website_section_key_key" ON "website_section"("key");
CREATE INDEX "website_section_is_active_idx" ON "website_section"("is_active");

-- ============================================================
-- Seed initial sections — match hard-coded values di apps/landing/.
-- Admin bisa edit semua via portal. Landing render dari sini kalau ada,
-- fallback ke hard-coded kalau row tidak ada (defensive).
-- ============================================================

-- Home Hero — tagline + headline + description + CTA
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'home.hero',
  'Home — Hero Section',
  'json',
  '{"badge":"Elshaddai Creative Community","headline":"Selamat datang di ECC","description":"Komunitas jemaat yang bertumbuh dalam kasih Kristus, melayani sesama dengan kreativitas, dan menjadi terang di tengah dunia. Bergabunglah dengan kami di cabang terdekat.","ctaPrimary":{"label":"Temukan Cabang","href":"/cabang"},"ctaSecondary":{"label":"Tentang Kami","href":"/about"}}',
  'JSON dengan fields: badge, headline, description, ctaPrimary {label, href}, ctaSecondary {label, href}. Hero section di halaman utama.',
  CURRENT_TIMESTAMP
);

-- About Story — 3 paragraf cerita ECC
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'about.story',
  'About — Cerita Kami',
  'markdown',
  E'Elshaddai Creative Community (ECC) didirikan dengan visi untuk menjadi komunitas jemaat yang dewasa secara rohani, mengalami transformasi hidup dalam Kristus, dan berdampak positif bagi masyarakat sekitar melalui pelayanan kreatif.\n\nSejak berdirinya, ECC terus bertumbuh dengan membuka cabang di berbagai kota di Indonesia. Setiap cabang melayani jemaat lokal dengan pendekatan kontekstual namun tetap berpegang pada doktrin yang sama — Firman Tuhan sebagai dasar, kasih Kristus sebagai teladan, dan kreativitas sebagai cara kami mengekspresikan iman.\n\nKami percaya bahwa gereja bukan hanya tempat ibadah hari Minggu, tetapi komunitas hidup yang saling melayani sepanjang minggu. Melalui pelayanan homecell, pemuridan, kegiatan sosial, dan ekspresi kreatif, kami mengajak setiap jemaat untuk terlibat aktif dalam pertumbuhan iman bersama.',
  'Markdown body untuk section "Cerita Kami" di halaman About. Mendukung paragraph, heading, list, link.',
  CURRENT_TIMESTAMP
);

-- Visi text
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'about.visi',
  'About — Visi',
  'markdown',
  'Menjadi komunitas jemaat yang dewasa secara rohani, mengalami transformasi hidup dalam Kristus, dan berdampak positif bagi masyarakat sekitar melalui pelayanan kreatif di seluruh cabang ECC.',
  'Text visi gereja (1 paragraf). Tampil di halaman Home + About.',
  CURRENT_TIMESTAMP
);

-- Misi list (JSON array of strings)
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'about.misi',
  'About — Misi (List)',
  'json',
  '["Mengajarkan Firman Tuhan secara sistematis dan relevan","Membangun persekutuan otentik melalui homecell & small group","Memperlengkapi jemaat untuk pelayanan dan misi","Mengembangkan ekspresi iman lewat seni, musik, media, dan kreativitas","Menjangkau komunitas dengan kasih dan tindakan nyata"]',
  'JSON array of strings. Setiap item = 1 bullet point misi di halaman About.',
  CURRENT_TIMESTAMP
);

-- Values 4 cards
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'about.values',
  'About — Nilai-Nilai (4 Cards)',
  'json',
  '[{"icon":"Heart","title":"Kasih","desc":"Mengasihi Tuhan dan sesama sebagai dasar setiap pelayanan dan keputusan."},{"icon":"BookOpen","title":"Firman","desc":"Berpegang pada otoritas Alkitab sebagai sumber kebenaran dan pedoman hidup."},{"icon":"Users","title":"Komunitas","desc":"Membangun relasi otentik di mana setiap jemaat bertumbuh bersama dalam iman."},{"icon":"Sparkles","title":"Kreativitas","desc":"Melayani Tuhan dengan kreativitas — mengekspresikan iman lewat seni, media, dan inovasi."}]',
  'JSON array of {icon, title, desc}. Icon dari lucide-react (Heart, BookOpen, Users, Sparkles, dll). 4 cards di halaman About.',
  CURRENT_TIMESTAMP
);

-- Services / "Apa Yang Kami Lakukan" 6 cards
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'home.services',
  'Home — Apa Yang Kami Lakukan (6 Cards)',
  'json',
  '[{"icon":"Calendar","title":"Ibadah Mingguan","desc":"Ibadah hari Minggu di berbagai cabang dengan jadwal yang dapat disesuaikan dengan kebutuhan jemaat."},{"icon":"Users","title":"Pemuridan & Homecell","desc":"Persekutuan kelompok kecil untuk bertumbuh bersama dalam iman dan saling menguatkan."},{"icon":"BookOpen","title":"Pemberitaan Firman","desc":"Pengajaran Alkitab yang relevan untuk kehidupan sehari-hari dengan dasar teologis yang sehat."},{"icon":"Heart","title":"Pelayanan Kasih","desc":"Program sosial untuk komunitas sekitar — bantuan, edukasi, dan dukungan untuk yang membutuhkan."},{"icon":"Sparkles","title":"Pelayanan Kreatif","desc":"Worship, musik, multimedia, seni, dan teknologi sebagai ekspresi iman dan media untuk menjangkau."},{"icon":"Megaphone","title":"Event & Retreat","desc":"Acara khusus, conference, dan retreat tahunan untuk pertumbuhan jemaat secara komunitas."}]',
  'JSON array of {icon, title, desc}. Section "Apa Yang Kami Lakukan" di home. Icon dari lucide-react.',
  CURRENT_TIMESTAMP
);

-- Contact info (email + alamat + social)
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'contact.info',
  'Contact — Info Kontak',
  'json',
  '{"email":"info@eccchurch.global","alamat":"Jakarta, Indonesia","socialLinks":[{"platform":"instagram","url":""},{"platform":"youtube","url":""},{"platform":"facebook","url":""}]}',
  'JSON dengan email, alamat, dan socialLinks. socialLinks = array of {platform, url}. Platform yang supported: instagram, youtube, facebook, tiktok, twitter. URL empty = social tidak tampil.',
  CURRENT_TIMESTAMP
);

-- Footer brand description
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'footer.brand',
  'Footer — Brand Description',
  'markdown',
  '**Elshaddai Creative Community** — komunitas jemaat yang bertumbuh dalam kasih Kristus, melayani sesama dengan kreativitas, dan menjadi terang di tengah dunia.',
  'Markdown text di footer left column (under logo). Bold/italic dengan ** atau *. 1-2 kalimat saja.',
  CURRENT_TIMESTAMP
);

-- App store links (CTA Download Aplikasi)
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES (
  'app.links',
  'App — Download Links',
  'json',
  '{"appStore":"https://apps.apple.com/app/ecc-church","playStore":"https://play.google.com/store/apps/details?id=global.eccchurch","ctaTitle":"Bergabunglah Dengan Kami","ctaDescription":"Download aplikasi ECC untuk akses fitur lengkap: check-in ibadah, daftar event, renungan harian, dan komunitas homecell."}','JSON dengan appStore + playStore URL + ctaTitle + ctaDescription. CTA box di home + landing page lainnya.',
  CURRENT_TIMESTAMP
);

-- ============================================================
-- RBAC backfill — Fulltimer full access menu 'website-content'
-- ============================================================
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'website-content', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'website-content'
  );
