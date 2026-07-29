/**
 * Legacy Circle → Prisma Komunitas mapper.
 *
 * Circle di Shiftsoft = generic grouping. ECC schema baru (module 23)
 * punya `Komunitas` yang terpisah dari Homecell — sengaja tidak enforce
 * Pelayanan Penggembalaan constraint kayak Homecell.
 *
 * Klasifikasi jenis komunitas auto-detect via nama pattern:
 *   FAMILY         — nama end dengan "Family" atau contains " - " + Family
 *   MINISTRY       — contains "Leaders", "Volunteers", "Ministry", "Team"
 *   COMMUNITY      — nama community-style ("BRIDGE", "Professional",
 *                    "Fellowship", dll)
 *   HOMECELL_STYLE — sisanya (traditional cellgroup naming)
 *   SYSTEM         — nama "ADMIN" atau exact system pattern
 *   LAINNYA        — fallback
 */

/** Enum values harus match Prisma enum di schema (module 23). */
export type KomunitasJenisEnum =
  | 'FAMILY'
  | 'MINISTRY'
  | 'COMMUNITY'
  | 'HOMECELL_STYLE'
  | 'SYSTEM'
  | 'LAINNYA';

/**
 * Auto-classify jenis komunitas dari nama Circle.
 */
export function classifyJenis(nama: string): KomunitasJenisEnum {
  const s = nama.trim();
  const lower = s.toLowerCase();

  // SYSTEM — exact match
  if (['admin', 'sistem', 'system'].includes(lower)) return 'SYSTEM';

  // FAMILY — "X - Y Family" atau end dengan " Family"
  if (/\bfamily\b/i.test(s)) return 'FAMILY';

  // MINISTRY — leader/volunteer/ministry/team keyword
  if (/\b(leaders?|volunteers?|ministry|ministri|team|tim)\b/i.test(s)) {
    return 'MINISTRY';
  }

  // COMMUNITY — generic community name
  if (/\b(bridge|fellowship|professional|persekutuan|komunitas)\b/i.test(s)) {
    return 'COMMUNITY';
  }

  // Default — anggap homecell-style
  return 'HOMECELL_STYLE';
}

/**
 * Map Shiftsoft Day (int 1-7) → HariMinggu enum.
 * Shiftsoft: 1=Sen, 2=Sel, ..., 7=Min (ISO week numbering).
 */
export function mapHari(day: number | null | undefined): string | null {
  if (day == null) return null;
  const map: Record<number, string> = {
    1: 'SENIN',
    2: 'SELASA',
    3: 'RABU',
    4: 'KAMIS',
    5: 'JUMAT',
    6: 'SABTU',
    7: 'MINGGU',
  };
  return map[day] ?? null;
}

/**
 * Bersihkan HTML dari Description Shiftsoft (yang kadang punya <br />, &amp;, dll).
 * Tidak sempurna (bukan real HTML parser) tapi cukup untuk 90% case
 * legacy data.
 */
export function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned || null;
}

/**
 * Validasi jam format HH:mm. Return null kalau invalid atau kosong.
 */
export function normalizeJam(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
