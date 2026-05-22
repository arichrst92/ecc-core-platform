/**
 * Liveness server-side gate via HMAC signed nonce + one-shot consumed set.
 *
 * Tujuan: Liveness detection saat ini purely client-side (blink + head turn).
 * Tanpa nonce, kalau attacker stealing face descriptor (mis. screenshot
 * photo dari social media → run model lokal → kirim ke /face/login), tidak
 * ada gate yang bisa membedakan "real human just did liveness" vs "bot replay".
 *
 * Server-side gate:
 *   1. Mobile request nonce di `POST /auth/face/liveness-nonce` dengan
 *      { noHp, purpose: 'ENROLL'|'LOGIN' }.
 *   2. BE issue HMAC signed nonce dengan TTL 3 menit, bound ke (noHp, purpose).
 *   3. Mobile execute liveness challenges client-side.
 *   4. Mobile submit /face/login or /face/enroll dengan body include `livenessNonce`.
 *   5. BE verify signature + TTL + one-shot.
 *
 * Replay window: 3 menit max. One-shot enforced via in-memory consumed set
 * (single instance). Untuk multi-pod scale, butuh Redis. Setiap pod
 * generate token independently — tidak masalah, signature verification
 * tetap valid lintas pod (same secret).
 *
 * Backward compat: V1 nonce OPTIONAL — log warn kalau missing, tapi tetap
 * accept. Setelah grace period (2026-06-01) bisa flip ke required.
 */
import jwt from 'jsonwebtoken';

// Pakai secret terpisah supaya rotasi terpisah dari JWT auth. Fallback ke
// JWT_SECRET kalau tidak di-set (single source untuk dev convenience).
const LIVENESS_SECRET = process.env.LIVENESS_NONCE_SECRET ?? process.env.JWT_SECRET ?? '';
const NONCE_TTL_SECONDS = 180;     // 3 menit

if (!LIVENESS_SECRET || LIVENESS_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn(
    '[liveness-nonce] LIVENESS_NONCE_SECRET / JWT_SECRET missing or too short. Set di .env.',
  );
}

export type LivenessPurpose = 'ENROLL' | 'LOGIN';

export interface LivenessNoncePayload {
  noHp: string;
  purpose: LivenessPurpose;
  /** Unique ID per nonce — supaya one-shot consumed set bisa identify replay. */
  jti: string;
  /** Issued at, epoch seconds. */
  iat: number;
  /** Expires at, epoch seconds. */
  exp: number;
}

/**
 * Issue HMAC signed nonce. Random JTI dari `crypto.randomUUID()`.
 */
export function issueLivenessNonce(noHp: string, purpose: LivenessPurpose): {
  nonce: string;
  expiresAt: Date;
} {
  const jti = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + NONCE_TTL_SECONDS * 1000);
  const token = jwt.sign({ noHp, purpose, jti }, LIVENESS_SECRET, {
    expiresIn: NONCE_TTL_SECONDS,
  } as jwt.SignOptions);
  return { nonce: token, expiresAt };
}

/**
 * Verify nonce dan mark consumed. Throws error kalau invalid.
 *
 * Kemungkinan error:
 *   - LIVENESS_NONCE_INVALID — signature salah / format malformed
 *   - LIVENESS_NONCE_EXPIRED — TTL lewat
 *   - LIVENESS_NONCE_PURPOSE_MISMATCH — purpose token != expected
 *   - LIVENESS_NONCE_BIND_MISMATCH — noHp di token != caller noHp
 *   - LIVENESS_NONCE_REUSED — JTI sudah pernah di-consume
 */
export function consumeLivenessNonce(
  nonce: string,
  expectedNoHp: string,
  expectedPurpose: LivenessPurpose,
): { jti: string } {
  let payload: LivenessNoncePayload;
  try {
    payload = jwt.verify(nonce, LIVENESS_SECRET) as LivenessNoncePayload;
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      throw new LivenessNonceError(
        'LIVENESS_NONCE_EXPIRED',
        'Liveness nonce kadaluarsa. Mulai ulang verifikasi.',
      );
    }
    throw new LivenessNonceError(
      'LIVENESS_NONCE_INVALID',
      'Liveness nonce tidak valid.',
    );
  }
  if (payload.purpose !== expectedPurpose) {
    throw new LivenessNonceError(
      'LIVENESS_NONCE_PURPOSE_MISMATCH',
      `Liveness nonce untuk purpose ${payload.purpose}, bukan ${expectedPurpose}.`,
    );
  }
  if (payload.noHp !== expectedNoHp) {
    throw new LivenessNonceError(
      'LIVENESS_NONCE_BIND_MISMATCH',
      'Liveness nonce tidak match dengan nomor caller.',
    );
  }
  if (consumedJtis.has(payload.jti)) {
    throw new LivenessNonceError(
      'LIVENESS_NONCE_REUSED',
      'Liveness nonce sudah dipakai. Mulai ulang verifikasi.',
    );
  }
  // Mark consumed + schedule eviction setelah TTL supaya Set tidak grow forever.
  consumedJtis.add(payload.jti);
  const remainingMs = Math.max(0, payload.exp * 1000 - Date.now()) + 5_000;
  setTimeout(() => consumedJtis.delete(payload.jti), remainingMs).unref?.();
  return { jti: payload.jti };
}

/** Custom error class supaya endpoint handler bisa map ke HTTP code yang tepat. */
export class LivenessNonceError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'LivenessNonceError';
  }
}

/**
 * In-memory consumed set. Cleanup via setTimeout per-jti supaya tidak grow
 * forever. Multi-pod: tiap pod punya set sendiri — kalau scale, butuh Redis
 * SETNX dengan TTL.
 *
 * Capacity rough estimate: 10 user/sec × 180 detik = 1800 entries max. Aman.
 */
const consumedJtis = new Set<string>();
