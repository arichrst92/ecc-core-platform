import { normalizePhoneNumber } from '@ecc/shared-types';

/**
 * Normalisasi input no HP → E.164, semua negara (+62, +65, +61, +1, dst).
 * Nomor lokal tanpa kode negara (08…, 8…) dianggap Indonesia.
 * Return null kalau tidak valid.
 */
export function normalizePhoneInput(input: string): string | null {
  return normalizePhoneNumber(input);
}
