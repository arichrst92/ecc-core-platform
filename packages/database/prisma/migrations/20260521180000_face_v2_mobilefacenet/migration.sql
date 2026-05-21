-- ============================================================
-- Face Recognition V2 — switch ke MobileFaceNet 192-dim cosine
-- ============================================================
-- Patch 2026-05-21r per request mobile (backend-request-face-recognition-v2-
-- mobilefacenet.md). face-api.js (128-dim FaceNet Euclidean) di WebView RN
-- ternyata terlalu lambat (>60s hang). Switch ke MobileFaceNet via native
-- TFLite di mobile, BE compute cosine similarity (pure math, no inference).
--
-- Action:
--   1. Wipe legacy face data (descriptor 128-dim facenet-v1) — sudah tidak
--      comparable dengan descriptor MobileFaceNet baru
--   2. Reset faceModelVersion ke NULL untuk semua row — force re-enroll
--
-- Catatan: tidak ada user yang berhasil enroll di production (semua hit
-- timeout di mobile pilot), jadi cleanup ini effectively no-op untuk
-- production. Tapi safety untuk dev environment yang mungkin punya
-- test data 128-dim.
-- ============================================================

UPDATE "user"
  SET "face_descriptor" = NULL,
      "face_enrolled_at" = NULL,
      "face_model_version" = NULL,
      "face_metadata" = NULL
  WHERE "face_model_version" IS DISTINCT FROM 'mobilefacenet-v1';
