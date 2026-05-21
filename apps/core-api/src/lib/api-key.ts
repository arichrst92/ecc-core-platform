/**
 * Generate API key untuk konsumer eksternal (mobile app, dst).
 *
 * Format key: `ecc_<prefix>_<secret>`
 *   - prefix: 8 char alphanumeric — dipakai untuk lookup cepat sebelum
 *     bcrypt compare (lihat middleware/require-api-key.ts).
 *   - secret: 24 char alphanumeric — entropy ~144 bits.
 *
 * Yang disimpan ke DB:
 *   - `keyPrefix` plaintext (untuk lookup)
 *   - `keyHash` bcrypt(seluruh key)
 *
 * Yang di-return ke admin user (sekali, saat create):
 *   - full key plaintext (mis. `ecc_AB23xy7K_9zM4nQ8wRx2pT...`)
 *   - admin user wajib copy + simpan; setelah modal close, key tidak bisa
 *     direveal lagi.
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz23456789';

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

export interface GeneratedApiKey {
  /** Full key plaintext — hanya di-return sekali saat create. */
  key: string;
  /** Prefix (8 char) — disimpan plaintext untuk lookup cepat. */
  prefix: string;
  /** Bcrypt hash dari full key — disimpan untuk verify. */
  hash: string;
}

export async function generateApiKey(): Promise<GeneratedApiKey> {
  const prefix = randomString(8);
  const secret = randomString(24);
  const key = `ecc_${prefix}_${secret}`;
  const hash = await bcrypt.hash(key, 10);
  return { key, prefix, hash };
}

/**
 * Catalog scope yang valid untuk API key. Mirror permission yang
 * tersedia di endpoint `/api/v1/*`. Tambahkan saat ada endpoint
 * public baru yang perlu di-scope.
 */
export const API_KEY_SCOPES = [
  'read:jemaat',
  'read:ibadah',
  'read:event',
  'read:news',
  'read:renungan',
  'read:reservasi',
  'write:reservasi', // mobile check-in / cancel
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];
