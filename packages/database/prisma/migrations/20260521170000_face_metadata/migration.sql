-- ============================================================
-- Face recognition metadata — modelVersion + audit metadata.
-- ============================================================
-- Patch 2026-05-21q (per request mobile face recognition).
--
-- Existing User.faceDescriptor (Json) + faceEnrolledAt tetap dipakai.
-- Tambah 2 kolom optional:
--   - face_model_version VARCHAR(32): identifier model ML, untuk future
--     migration kalau ganti model embedding (default "facenet-v1")
--   - face_metadata JSONB: audit info (platform, deviceModel, appVersion,
--     consentVersion) — tidak di-query, hanya untuk audit
--
-- Backfill: row existing tetap NULL — login tetap jalan (asumsi default
-- model "facenet-v1" sampai user re-enroll).
-- ============================================================

ALTER TABLE "user"
  ADD COLUMN "face_model_version" VARCHAR(32),
  ADD COLUMN "face_metadata" JSONB;
