/**
 * Generate kode reservasi pendek untuk barcode/QR.
 *
 * Format: 8 karakter alphanumeric uppercase tanpa karakter ambigu
 * (1, I, 0, O di-skip biar gampang dibaca manual).
 *
 * Total possibility: 30^8 = ~6.5 milyar combinasi. Collision dicek di DB.
 */
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars (5 bits each)

export function generateKodeReservasi(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

/**
 * Generate kode unique — retry sampai DB konfirmasi tidak collision.
 * Maksimal 5 retry (sangat kecil kemungkinan collision dengan 32^8 space).
 */
export async function generateUniqueKode(
  isTaken: (kode: string) => Promise<boolean>,
  length = 8,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const kode = generateKodeReservasi(length);
    if (!(await isTaken(kode))) return kode;
  }
  throw new Error('Tidak bisa generate kode unique setelah 5 attempt');
}
