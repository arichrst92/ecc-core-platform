/**
 * Face matching helper.
 *
 * **Patch 2026-05-21r — switch ke MobileFaceNet cosine similarity**.
 * **Patch 2026-05-21s — dim correction 192 → 128** (per mobile flatbuffer
 * inspect: `sirius-ai/MobileFaceNet_TF` variant ini output `[1, 128]`, not 192
 * sebagaimana initial estimate. Source-of-truth: `MobileFaceNet_Arch.txt`
 * `Logits:[None, 128]` + TFLite tensor shape inspection).
 *
 * Sebelumnya: face-api.js (FaceNet 128-dim) + Euclidean distance.
 * Sekarang: MobileFaceNet (128-dim) + Cosine similarity.
 *
 * Alasan switch: face-api.js TFJS WebGL backend di RN WebView terlalu lambat
 * (detection hang >60s di pilot test mobile). MobileFaceNet via native TFLite
 * (react-native-fast-tflite) di mobile ~100ms inference, production-grade.
 *
 * BE side **tidak run inference** — server cuma compute cosine similarity
 * antara dua descriptor yang sudah di-compute client-side. Pure math, no
 * TFLite/ONNX/Python needed.
 *
 * Cosine similarity:
 *   - Range: -1 (opposite) to 1 (identical)
 *   - Untuk face descriptor (normalized), typically 0..1
 *   - Threshold default: 0.5 (higher = stricter match)
 *   - Tune setelah pilot data tersedia
 *
 * Note: dim sama dengan legacy face-api.js (128) tapi ini tetap mobilefacenet —
 * descriptor space berbeda total, gunakan `face_model_version` field untuk
 * disambiguate. Legacy descriptor sudah di-wipe via migration 21r.
 */

const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD ?? 0.5);

/** Embedding dimension untuk MobileFaceNet (verified via flatbuffer inspect). */
export const FACE_DESCRIPTOR_DIM = 128;

export interface FaceMatchResult {
  match: boolean;
  /** Cosine similarity (higher = more similar). Range untuk normalized vectors: ~0..1. */
  similarity: number;
  threshold: number;
}

/**
 * Cosine similarity between two equal-length vectors.
 * Untuk MobileFaceNet descriptor yang normalized, hasilnya range ~0..1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Descriptor length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    magA += ai * ai;
    magB += bi * bi;
  }
  const magProduct = Math.sqrt(magA) * Math.sqrt(magB);
  if (magProduct === 0) return 0;
  return dot / magProduct;
}

/**
 * Compare candidate descriptor dengan stored descriptor.
 * Return match=true kalau similarity >= threshold.
 */
export function matchFace(candidate: number[], stored: number[]): FaceMatchResult {
  const similarity = cosineSimilarity(candidate, stored);
  return {
    match: similarity >= FACE_MATCH_THRESHOLD,
    similarity,
    threshold: FACE_MATCH_THRESHOLD,
  };
}

/** Validasi format descriptor — 128-dim (MobileFaceNet), semua finite number. */
export function isValidDescriptor(descriptor: unknown): descriptor is number[] {
  return (
    Array.isArray(descriptor) &&
    descriptor.length === FACE_DESCRIPTOR_DIM &&
    descriptor.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/**
 * @deprecated — face-api.js 128-dim Euclidean legacy. Tetap di-export untuk
 * audit tooling kalau perlu compute Euclidean dari historical data. New code
 * pakai cosineSimilarity().
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Descriptor length mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    const diff = ai - bi;
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}
