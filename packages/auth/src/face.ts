/**
 * Face matching helper.
 *
 * Strategi: face-api.js menghasilkan 128-dim descriptor (Float32Array).
 * Kita kirim dari client sebagai array number, server simpan di DB sebagai
 * JSON, lalu untuk verifikasi cukup hitung Euclidean distance dengan
 * descriptor yang tersimpan. Jika distance < threshold, dianggap match.
 *
 * Default threshold face-api.js: 0.6 (lebih kecil = lebih ketat).
 * Untuk ECC default kita pakai 0.5 supaya cukup aman tapi tidak terlalu strict.
 */

const FACE_MATCH_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD ?? 0.5);

export interface FaceMatchResult {
  match: boolean;
  distance: number;
  threshold: number;
}

/** Euclidean distance antara dua descriptor 128-dim. */
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

export function matchFace(candidate: number[], stored: number[]): FaceMatchResult {
  const distance = euclideanDistance(candidate, stored);
  return {
    match: distance < FACE_MATCH_THRESHOLD,
    distance,
    threshold: FACE_MATCH_THRESHOLD,
  };
}

/** Validasi format descriptor — pastikan 128-dim dan semua finite. */
export function isValidDescriptor(descriptor: unknown): descriptor is number[] {
  return (
    Array.isArray(descriptor) &&
    descriptor.length === 128 &&
    descriptor.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}
