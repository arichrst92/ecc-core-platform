-- ============================================================
-- Legal Documents — Terms & Privacy untuk mobile + portal CRUD
-- ============================================================

CREATE TYPE "legal_key" AS ENUM ('TERMS', 'PRIVACY');

CREATE TABLE "legal_document" (
  "id"                     UUID NOT NULL,
  "key"                    "legal_key" NOT NULL,
  "language"               VARCHAR(5) NOT NULL,
  "title"                  VARCHAR(255) NOT NULL,
  "content"                TEXT NOT NULL,
  "version"                VARCHAR(20) NOT NULL,
  "is_published"           BOOLEAN NOT NULL DEFAULT true,
  "published_at"           TIMESTAMP(3) NOT NULL,
  "published_by_user_id"   UUID,
  "created_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "legal_document_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "legal_document_key_language_key"
  ON "legal_document"("key", "language");

-- Placeholder content. Legal team harus replace lewat portal sebelum prod.
INSERT INTO "legal_document"
  ("id", "key", "language", "title", "content", "version", "is_published", "published_at", "updated_at")
VALUES
  (
    gen_random_uuid(),
    'TERMS',
    'id',
    'Syarat & Ketentuan ECC',
    E'# Syarat & Ketentuan ECC\n\n> **Placeholder** — silakan diisi oleh tim legal lewat portal Admin → Legal.\n\n## 1. Penerimaan\n\nDengan menggunakan aplikasi ECC, Anda menyetujui syarat & ketentuan ini.\n\n## 2. Penggunaan\n\nAkun digunakan untuk keperluan ibadah, pelayanan, dan komunitas gereja.\n\n## 3. Privasi\n\nLihat Kebijakan Privasi terpisah.\n\n## 4. Kontak\n\nHubungi admin cabang untuk pertanyaan.',
    '2026-05-22',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(),
    'PRIVACY',
    'id',
    'Kebijakan Privasi ECC',
    E'# Kebijakan Privasi ECC\n\n> **Placeholder** — silakan diisi oleh tim legal lewat portal Admin → Legal.\n\n## 1. Data yang Dikumpulkan\n\n- Nama lengkap, nomor HP, foto profil\n- Riwayat kehadiran ibadah & event\n- Data keluarga & relasi jemaat\n\n## 2. Penggunaan Data\n\nData digunakan untuk administrasi gereja, komunikasi pelayanan, dan pelaporan internal.\n\n## 3. Penyimpanan\n\nData disimpan di server gereja dengan akses terbatas pada admin & fulltimer.\n\n## 4. Hak Pengguna\n\nAnda dapat menonaktifkan akun sewaktu-waktu lewat menu Pengaturan → Hapus Akun.\n\n## 5. Kontak\n\nHubungi admin untuk pertanyaan privasi.',
    '2026-05-22',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

-- RBAC backfill — Fulltimer dapat full access 'legal'.
INSERT INTO "role_menu_access" ("id", "role_id", "menu_key", "can_read", "can_write", "can_delete", "updated_at")
SELECT gen_random_uuid(), r."id", 'legal', true, true, true, CURRENT_TIMESTAMP
FROM "role" r
WHERE LOWER(r."nama") = 'fulltimer'
  AND NOT EXISTS (
    SELECT 1 FROM "role_menu_access" rma
    WHERE rma."role_id" = r."id" AND rma."menu_key" = 'legal'
  );
