/**
 * Field normalizers untuk data legacy Shiftsoft → ECC format.
 *
 * All fungsi defensive — return null kalau input invalid, JANGAN throw.
 * Karena data legacy sering dirty (typo, whitespace, format inkonsisten),
 * migration lebih baik silent-skip field than fail seluruh record.
 */

// ============================================================
// Phone normalizer — Indonesia E.164
// ============================================================
/**
 * Convert "0812xxx" / "62812xxx" / "+62812xxx" ke `+62812xxx`.
 * Return null kalau invalid (kurang dari 10 digit atau lebih dari 15).
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Strip non-digit kecuali leading +
  s = s.replace(/[^\d+]/g, '');
  if (!s) return null;

  // "+" harus di depan doang
  if (s.includes('+')) {
    s = '+' + s.replace(/\+/g, '');
  }

  // "0812..." → "+62812..."
  if (s.startsWith('0')) {
    s = '+62' + s.slice(1);
  }
  // "62812..." → "+62812..."
  else if (s.startsWith('62')) {
    s = '+' + s;
  }
  // "812..." (missing prefix) → assume Indonesia
  else if (/^\d/.test(s)) {
    s = '+62' + s;
  }

  // Validasi length: +62xxxxxxxxxx (min 10 digit after +62, max 13)
  const digits = s.slice(1); // strip +
  if (digits.length < 10 || digits.length > 15) return null;

  return s;
}

// ============================================================
// Date parser — skip Go zero-time
// ============================================================
/**
 * Parse ISO datetime atau "YYYY-MM-DD" ke Date object.
 * Return null kalau:
 * - Empty string / null
 * - Invalid format
 * - "0001-01-01" (Go zero time)
 * - Year < 1900 (sanity check untuk tanggal typo)
 */
export function parseLegacyDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Skip Go zero-time yang muncul sebagai "0001-01-01T00:00:00Z"
  if (s.startsWith('0001-01-01')) return null;

  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  if (d.getUTCFullYear() < 1900) return null;

  return d;
}

// ============================================================
// Gender mapper
// ============================================================
/**
 * Shiftsoft: 0=unknown/undefined, 1=male, 2=female (assumption).
 * ECC: 'L' / 'P' enum, null untuk unknown.
 */
export function mapGender(g: number | undefined | null): 'L' | 'P' | null {
  if (g === 1) return 'L';
  if (g === 2) return 'P';
  return null;
}

// ============================================================
// Status pernikahan mapper
// ============================================================
/**
 * Shiftsoft Status kode (per audit sample Bandung 4203 users):
 *   'S'  = Single (444)
 *   'SM' = Sudah Menikah (517)
 *   'JD' = Janda / Duda ambiguous (60) — resolve via Gender kalau bisa
 *   '0', '' = unknown (2907 empty + 275 zero)
 *
 * Untuk 'JD', kalau `gender` di-supply (P → Janda, L → Duda). Kalau gender
 * unknown, fallback ke "Janda/Duda" as-is. Return full label untuk kejelasan.
 */
export function mapStatusPernikahan(
  s: string | null | undefined,
  gender?: 'L' | 'P' | null,
): string | null {
  if (!s) return null;
  const c = s.trim().toUpperCase();
  if (!c || c === '0') return null;

  const staticMap: Record<string, string> = {
    S: 'Single',
    SM: 'Menikah',
    // Single-char fallback dari sistem lama / entry manual
    M: 'Menikah',
    D: 'Duda',
    J: 'Janda',
    C: 'Cerai',
  };
  if (staticMap[c]) return staticMap[c];

  if (c === 'JD') {
    if (gender === 'P') return 'Janda';
    if (gender === 'L') return 'Duda';
    return 'Janda/Duda';
  }
  return c; // fallback — jangan discard unknown value
}

// ============================================================
// Boolean parser (Ya/Tidak/True/1/Yes)
// ============================================================
export function parseYesNo(raw: string | null | undefined): boolean | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === '0') return null; // '0' di data legacy = unfilled, bukan false
  if (['ya', 'y', 'yes', 'true', 'sudah'].includes(s)) return true;
  if (['tidak', 't', 'no', 'false', 'belum'].includes(s)) return false;
  return null;
}

// ============================================================
// String utility — trim + return null kalau empty
// ============================================================
export function cleanString(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  return t || null;
}
