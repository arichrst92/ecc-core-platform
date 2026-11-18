-- Kategori tamu hanya Visitor / New Comer. Tamu lama yang kategorinya belum
-- ditentukan (NULL) → VISITOR. Hanya data tamu (isTamu, atau tercatat sebagai
-- tamu pengundang / homecell); kolom updated_at sengaja tidak diubah supaya
-- retensi data tamu tidak bergeser. New Comer tetap bisa menaikkan Visitor.
UPDATE "jemaat" j
SET "tamu_kategori" = 'VISITOR'
WHERE j."tamu_kategori" IS NULL
  AND (
    j."is_tamu" = true
    OR EXISTS (SELECT 1 FROM "jemaat_tamu" t WHERE t."tamu_id" = j."id")
    OR EXISTS (SELECT 1 FROM "homecell_tamu" h WHERE h."tamu_id" = j."id")
  );
