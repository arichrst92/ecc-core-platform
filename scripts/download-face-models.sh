#!/usr/bin/env bash
# Download face-api.js model weights ke apps/portal/public/face-models
#
# Models yang di-download (3 nets yang kita pakai):
#   - ssd_mobilenetv1     : face detection (~5.4 MB)
#   - face_landmark_68    : 68 face landmarks (~350 KB)
#   - face_recognition    : 128-dim descriptor (~6.2 MB)
#
# Source: https://github.com/justadudewhohacks/face-api.js/tree/master/weights
# Total ~12 MB, cukup di-download sekali (commit ke git atau bake ke Docker image).

set -euo pipefail

DEST="$(cd "$(dirname "$0")/.." && pwd)/apps/portal/public/face-models"
BASE="https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights"

mkdir -p "$DEST"
cd "$DEST"

echo "📦 Downloading face-api.js models to $DEST"

FILES=(
  # SSD MobileNet v1
  "ssd_mobilenetv1_model-weights_manifest.json"
  "ssd_mobilenetv1_model-shard1"
  "ssd_mobilenetv1_model-shard2"
  # Face Landmark 68
  "face_landmark_68_model-weights_manifest.json"
  "face_landmark_68_model-shard1"
  # Face Recognition
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
)

for f in "${FILES[@]}"; do
  if [[ -f "$f" ]]; then
    echo "  ✓ $f (sudah ada, skip)"
    continue
  fi
  echo "  ↓ $f"
  curl -fsSL "$BASE/$f" -o "$f"
done

echo "✅ Selesai. Total $(ls -1 "$DEST" | wc -l) file."
