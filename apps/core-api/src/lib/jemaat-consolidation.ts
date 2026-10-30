/**
 * Konsolidasi data jemaat dari spreadsheet (rekap manual Shiftsoft) ke DB.
 * Fungsi murni (tanpa DB) — parsing baris sheet, normalisasi, pencocokan, diff.
 * Dipakai routes/admin/jemaat-consolidation.ts. Lihat test di sebelahnya.
 */
import { excelSerialToDate, type CellValue } from './xlsx-lite.js';
import { meetsStep, type HeldRole, type StepRequirement } from './spiritual-journey.js';

// ------------------------------------------------------------
//  Normalisasi
// ------------------------------------------------------------

/** No HP → E.164 Indonesia (+62…). Null kalau kosong / terlalu pendek. */
export function normalizePhone(v: CellValue | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  let d = String(typeof v === 'number' ? Math.round(v) : v).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  if (d.length < 9) return null;
  return '+' + d;
}

export function normalizeEmail(v: CellValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  return s.includes('@') ? s : null;
}

/** Nama untuk pencocokan: lowercase, spasi tunggal, tanpa gelar "Ps." / "Pdt.". */
export function normalizeName(v: CellValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v)
    .toLowerCase()
    .replace(/^\s*(ps|pdt|pastor)\.?\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s || s === '(vacant)' || s === 'vacant') return null;
  return s;
}

function text(v: CellValue | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function dateOnly(v: CellValue | undefined): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return excelSerialToDate(v).toISOString().slice(0, 10);
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

const MARITAL = new Set(['single', 'sudah menikah', 'menikah', 'janda/duda', 'janda', 'duda']);

// ------------------------------------------------------------
//  Parsing baris sheet
// ------------------------------------------------------------

export interface SheetRow {
  rowNo: number; // nomor baris di Excel (header = 1)
  kode: string | null;
  nama: string;
  noHp: string | null;
  email: string | null;
  alamat: string | null;
  cabang: string | null;
  area: string | null;
  zoneLeader: string | null;
  homecell: string | null;
  homeLeader: string | null;
  ministry: string | null;
  statusPernikahan: string | null;
  tanggalBergabungGereja: string | null; // YYYY-MM-DD
  username: string | null;
  /** Tahap Spiritual Journey (teks bebas dari sheet, mis. "Expand"). */
  spiritualJourney: string | null;
}

const HEADER_ALIASES: Record<keyof Omit<SheetRow, 'rowNo'>, string[]> = {
  kode: ['kode'],
  nama: ['nama lengkap', 'nama', 'name'],
  noHp: ['no hp', 'main phone', 'phone', 'no. hp'],
  email: ['email', 'e-mail'],
  alamat: ['alamat', 'address'],
  cabang: ['cabang'],
  area: ['homecell area'],
  zoneLeader: ['zone leader', 'nama zone leader'],
  homecell: ['homecell', 'nama homecell'],
  homeLeader: ['home leader', 'nama home leader'],
  ministry: ['ministry'],
  statusPernikahan: ['status'],
  tanggalBergabungGereja: ['tanggal bergabung', 'berjemaat di ecc sejak'],
  username: ['username els 1', 'username'],
  spiritualJourney: [
    'spiritual journey',
    'tahap spiritual journey',
    'fase spiritual journey',
    'spiritual growth',
    'journey',
    'fase',
    'tahap',
  ],
};

/**
 * Satu sel ministry bisa berisi lebih dari satu pelayanan, dipisah koma,
 * titik koma, garis miring, garis tegak, atau baris baru dalam sel — mis.
 * "Worship, Multimedia", "Usher / CKids", "Worship; Doa". Hasil: nama unik, huruf besar.
 */
export function splitMinistries(v: string | null | undefined): string[] {
  if (!v) return [];
  return [
    ...new Set(
      v
        // "&" dan "dan" TIDAK dipakai sebagai pemisah — bisa bagian nama (mis. "Praise & Worship", "Doa dan Syafaat").
        .split(/[,;\/\n|]+/)
        .map((x) => x.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
}

export function parseSheetRows(rows: CellValue[][]): { rows: SheetRow[]; missingColumns: string[] } {
  const header = (rows[0] ?? []).map((h) => String(h ?? '').trim().toLowerCase());
  const idx = {} as Record<keyof typeof HEADER_ALIASES, number>;
  const missing: string[] = [];
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [keyof typeof HEADER_ALIASES, string[]][]) {
    idx[key] = header.findIndex((h) => aliases.includes(h));
  }
  if (idx.nama < 0) missing.push('Nama Lengkap');
  if (idx.email < 0 && idx.noHp < 0) missing.push('Email / No HP');

  const out: SheetRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const at = (k: keyof typeof HEADER_ALIASES) => (idx[k] >= 0 ? r[idx[k]] : null);
    const nama = text(at('nama'));
    if (!nama) return;
    const status = text(at('statusPernikahan'));
    out.push({
      rowNo: i + 2,
      kode: text(at('kode'))?.toUpperCase() ?? null,
      nama,
      noHp: normalizePhone(at('noHp')),
      email: normalizeEmail(at('email')),
      alamat: text(at('alamat')),
      cabang: text(at('cabang')),
      area: text(at('area'))?.toUpperCase() ?? null,
      zoneLeader: normalizeName(at('zoneLeader')) ? text(at('zoneLeader')) : null,
      homecell: text(at('homecell'))?.toUpperCase() ?? null,
      homeLeader: normalizeName(at('homeLeader')) ? text(at('homeLeader')) : null,
      ministry: splitMinistries(text(at('ministry'))).join('; ') || null,
      // Kolom "Status" bisa berarti status nikah (rekap Shiftsoft) atau
      // Aktif/Nonaktif (export portal) — ambil hanya nilai status nikah.
      statusPernikahan: status && MARITAL.has(status.toLowerCase()) ? status : null,
      tanggalBergabungGereja: dateOnly(at('tanggalBergabungGereja')),
      username: text(at('username')),
      spiritualJourney: text(at('spiritualJourney')),
    });
  });
  return { rows: out, missingColumns: missing };
}

// ------------------------------------------------------------
//  Pencocokan
// ------------------------------------------------------------

export interface JemaatLite {
  id: string;
  kode: string | null;
  namaLengkap: string;
  email: string | null;
  noHp: string | null;
  alamat: string | null;
  statusPernikahan: string | null;
  tanggalBergabungGereja: string | null; // YYYY-MM-DD
  cabangId: string;
  cabangNama: string;
}

export interface JemaatIndex {
  byId: Map<string, JemaatLite>;
  byKode: Map<string, string>;
  byEmail: Map<string, string[]>;
  byPhone: Map<string, string[]>;
  byName: Map<string, string[]>;
}

export function buildIndex(list: JemaatLite[]): JemaatIndex {
  const push = (m: Map<string, string[]>, k: string | null, id: string) => {
    if (!k) return;
    const arr = m.get(k);
    if (arr) arr.push(id);
    else m.set(k, [id]);
  };
  const ix: JemaatIndex = {
    byId: new Map(),
    byKode: new Map(),
    byEmail: new Map(),
    byPhone: new Map(),
    byName: new Map(),
  };
  for (const j of list) {
    ix.byId.set(j.id, j);
    if (j.kode) ix.byKode.set(j.kode.toUpperCase(), j.id);
    push(ix.byEmail, normalizeEmail(j.email), j.id);
    push(ix.byPhone, normalizePhone(j.noHp), j.id);
    push(ix.byName, normalizeName(j.namaLengkap), j.id);
  }
  return ix;
}

export type MatchStatus = 'MATCHED' | 'CONFLICT' | 'NAME_ONLY' | 'NOT_FOUND';
export type MatchVia = 'kode' | 'email' | 'hp' | 'nama';

export interface MatchResult {
  status: MatchStatus;
  jemaatId: string | null;
  candidates: { id: string; via: MatchVia[] }[];
}

export function matchRow(row: SheetRow, ix: JemaatIndex, preferCabangId?: string): MatchResult {
  const via = new Map<string, Set<MatchVia>>();
  const add = (ids: string[] | undefined, v: MatchVia) => {
    for (const id of ids ?? []) {
      if (!via.has(id)) via.set(id, new Set());
      via.get(id)!.add(v);
    }
  };
  if (row.kode) add(ix.byKode.has(row.kode) ? [ix.byKode.get(row.kode)!] : [], 'kode');
  if (row.email) add(ix.byEmail.get(row.email), 'email');
  if (row.noHp) add(ix.byPhone.get(row.noHp), 'hp');

  const toList = () =>
    [...via.entries()].map(([id, v]) => ({ id, via: [...v] }));

  if (via.size === 1) {
    const [id] = via.keys();
    return { status: 'MATCHED', jemaatId: id!, candidates: toList() };
  }
  if (via.size > 1) return { status: 'CONFLICT', jemaatId: null, candidates: toList() };

  const byName = ix.byName.get(normalizeName(row.nama) ?? '') ?? [];
  if (byName.length) {
    add(byName, 'nama');
    const list = toList().sort((a, b) => {
      const ca = ix.byId.get(a.id)?.cabangId === preferCabangId ? 0 : 1;
      const cb = ix.byId.get(b.id)?.cabangId === preferCabangId ? 0 : 1;
      return ca - cb;
    });
    return { status: 'NAME_ONLY', jemaatId: null, candidates: list };
  }
  return { status: 'NOT_FOUND', jemaatId: null, candidates: [] };
}

// ------------------------------------------------------------
//  Diff field
// ------------------------------------------------------------

export const DIFF_FIELDS = ['noHp', 'email', 'alamat', 'statusPernikahan', 'tanggalBergabungGereja'] as const;
export type DiffField = (typeof DIFF_FIELDS)[number];
export type DiffState = 'same' | 'fill' | 'differ' | 'none';

const cmp = (f: DiffField, v: string | null): string | null => {
  if (v === null) return null;
  if (f === 'noHp') return normalizePhone(v);
  if (f === 'email') return normalizeEmail(v);
  if (f === 'tanggalBergabungGereja') return v.slice(0, 10);
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
};

export function diffField(f: DiffField, sheet: string | null, current: string | null): DiffState {
  const a = cmp(f, sheet);
  const b = cmp(f, current);
  if (!a) return 'none';
  if (!b) return 'fill';
  return a === b ? 'same' : 'differ';
}

// ------------------------------------------------------------
//  Rencana struktur (area / homecell / ministry)
// ------------------------------------------------------------

/** Ambil nilai terbanyak (mis. Zone Leader per area) — abaikan null. */
export function majority(values: (string | null)[]): string | null {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [k, v] of c) if (v > n) [best, n] = [k, v];
  return best;
}

/** Sinonim ministry sheet → nama pelayanan existing. */
const MINISTRY_SYNONYMS: Record<string, string> = {
  WORSHIP: 'worship',
  'CKIDS MINSITER': 'children ministry',
  'CKIDS MINISTER': 'children ministry',
  CKIDS: 'children ministry',
};

export function suggestPelayanan(
  sheetNama: string,
  pelayanan: { id: string; nama: string }[],
): string | null {
  const target = MINISTRY_SYNONYMS[sheetNama.toUpperCase()] ?? sheetNama.toLowerCase();
  return pelayanan.find((p) => p.nama.toLowerCase() === target)?.id ?? null;
}

// ------------------------------------------------------------
//  Spiritual Journey
// ------------------------------------------------------------

const journeyKey = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Cocokkan nilai sheet ke tahap Spiritual Journey (steps urut):
 * judul persis (abaikan huruf besar & tanda baca) → nomor tahap ("3",
 * "Tahap 3") → judul mengandung / dikandung nilai sheet. Null kalau tidak ada.
 */
export function suggestJourneyStep(sheetVal: string, steps: { id: string; judul: string }[]): string | null {
  const k = journeyKey(sheetVal);
  if (!k) return null;
  const exact = steps.find((s) => journeyKey(s.judul) === k);
  if (exact) return exact.id;
  const num = k.match(/^(?:tahap |fase |step )?(\d{1,2})$/);
  if (num) return steps[Number(num[1]) - 1]?.id ?? null;
  const partial = steps.filter((s) => {
    const j = journeyKey(s.judul);
    return j.includes(k) || k.includes(j);
  });
  return partial.length === 1 ? partial[0]!.id : null;
}

/**
 * Tahap yang perlu diberikan role-nya agar jemaat mencapai `targetIndex`
 * (tahap target + semua tahap sebelumnya). Tahap yang syaratnya sudah
 * dipenuhi role yang dimiliki dilewati. `steps` harus sudah urut.
 */
export function journeyStepsToGrant<S extends StepRequirement>(steps: S[], targetIndex: number, held: HeldRole[]): S[] {
  if (targetIndex < 0) return [];
  return steps.slice(0, targetIndex + 1).filter((s) => !meetsStep(s, held));
}
