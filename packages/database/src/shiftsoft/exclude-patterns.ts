/**
 * Nama patterns yang di-SKIP saat migrate (bukan jemaat beneran).
 *
 * Digunakan di 2 tempat:
 * 1. run.ts — filter saat migrate (opt-in via --exclude-system)
 * 2. cleanup-system-accounts.ts — mark isActive=false untuk existing records
 *
 * Reason: Shiftsoft punya beberapa system account (vendor IT, placeholder
 * web registration, superuser template) yang muncul di setiap tenant.
 * Import mereka membuat noise di data ECC.
 */

/**
 * Exact nama match — kalau nama exact match salah satu di sini, SKIP/DEACTIVATE.
 */
export const EXCLUDE_EXACT_NAMES: string[] = [
  'Support Dinamigra',
  'Support Dinamigra Admin',
  'Web Registration',
  'Sup-0001',
  'SUP-0001',
];

/**
 * Regex patterns — kalau nama match salah satu, SKIP/DEACTIVATE.
 */
export const EXCLUDE_PATTERNS: RegExp[] = [
  /^ECC\s*[A-Z]+\s*-\s*\d{2,}$/i, // "ECCBANDUNG-0574", "ECC Bandung - 0568"
  /^ECC[A-Z]+\d{2,}$/i, // "ECCBANDUNG6079" (no separator)
  /^Admin-\w+$/i, // "admin-eccglobal", "admin-eccbandung"
  /^Administrator ECC/i, // "Administrator ECC Bandung"
];

/**
 * Check apakah nama harus di-exclude.
 * Trim whitespace + case-insensitive untuk exact match.
 */
export function shouldExclude(nama: string | null | undefined): {
  exclude: boolean;
  reason?: string;
} {
  if (!nama) return { exclude: false };
  const trimmed = nama.trim();
  if (!trimmed) return { exclude: false };

  const lower = trimmed.toLowerCase();
  const exactMatch = EXCLUDE_EXACT_NAMES.find(
    (n) => n.toLowerCase() === lower,
  );
  if (exactMatch) {
    return { exclude: true, reason: `system account "${exactMatch}"` };
  }

  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { exclude: true, reason: `placeholder pattern ${pattern}` };
    }
  }

  return { exclude: false };
}
