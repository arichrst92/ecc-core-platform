-- Konten Website yang tidak dipakai lagi oleh website baru (Nov 2026):
--   home.hero, home.services  → beranda kini showcase Els App + ibadah hari ini
--   footer.brand              → footer ramping satu baris
--   app.links                 → link App Store / Google Play tetap di kode (lib/app-links)
-- Yang tetap dipakai: about.story, about.visi, about.misi, about.values, contact.info.
DELETE FROM "website_section" WHERE "key" IN ('home.hero', 'home.services', 'footer.brand', 'app.links');
