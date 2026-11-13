-- Versi bahasa Inggris konten Website (about.*). Landing memakai "<key>.en"
-- saat bahasa EN dipilih; kalau row tidak ada → fallback teks EN di kode.
-- Admin bisa edit di Portal → Website → Konten (grup "about").
INSERT INTO "website_section" ("key", "title", "content_type", "content", "description", "updated_at")
VALUES
(
  'about.story.en',
  'About — Our Story (English)',
  'markdown',
  E'Elshaddai Creative Community (ECC) was founded with a vision to be a spiritually mature community of believers, experiencing life transformation in Christ and making a positive impact on society through creative ministry.\n\nSince its founding, ECC has kept growing by opening branches in cities across Indonesia. Each branch serves its local congregation with a contextual approach while holding to the same doctrine — God''s Word as our foundation, the love of Christ as our example, and creativity as the way we express our faith.\n\nWe believe the church is not just a place for Sunday worship, but a living community that serves one another throughout the week. Through homecells, discipleship, social outreach, and creative expression, we invite every member to take an active part in growing in faith together.',
  'English version of "about.story". Markdown.',
  CURRENT_TIMESTAMP
),
(
  'about.visi.en',
  'About — Vision (English)',
  'markdown',
  'To be a spiritually mature community of believers, experiencing life transformation in Christ and making a positive impact on society through creative ministry across all ECC branches.',
  'English version of "about.visi".',
  CURRENT_TIMESTAMP
),
(
  'about.misi.en',
  'About — Mission List (English)',
  'json',
  '["Teach God''s Word systematically and relevantly","Build authentic fellowship through homecells & small groups","Equip members for ministry and mission","Develop expressions of faith through art, music, media, and creativity","Reach the community with love and real action"]',
  'English version of "about.misi". JSON array of strings.',
  CURRENT_TIMESTAMP
),
(
  'about.values.en',
  'About — Values (English)',
  'json',
  '[{"icon":"Heart","title":"Love","desc":"Loving God and others as the foundation of every ministry and decision."},{"icon":"BookOpen","title":"The Word","desc":"Holding to the authority of the Bible as the source of truth and guide for life."},{"icon":"Users","title":"Community","desc":"Building authentic relationships where every member grows together in faith."},{"icon":"Sparkles","title":"Creativity","desc":"Serving God with creativity — expressing faith through art, media, and innovation."}]',
  'English version of "about.values". JSON array of {icon, title, desc}.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;
