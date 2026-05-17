/**
 * CSV import helpers untuk bulk jemaat.
 *
 * Format CSV yang di-expected (header wajib, case-sensitive):
 *   nama_lengkap, no_hp, email, jenis_kelamin, tanggal_lahir,
 *   alamat, kode_cabang, tanggal_bergabung
 *
 * Catatan parsing:
 *   - `kode_cabang` di-lookup ke tabel cabang_gereja (case-insensitive)
 *   - Tanggal harus format YYYY-MM-DD
 *   - `no_hp` boleh format apapun (08.../+62.../62...) — di-normalize ke E.164
 *   - `email` opsional
 *   - Row kosong di-skip otomatis
 */
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { normalizeNoHp } from '@ecc/auth';

export const CSV_HEADERS = [
  'nama_lengkap',
  'no_hp',
  'email',
  'jenis_kelamin',
  'tanggal_lahir',
  'alamat',
  'kode_cabang',
  'tanggal_bergabung',
] as const;

export type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

/** Schema validasi per row CSV (string-based, sebelum konversi ke types final) */
const rowSchema = z.object({
  nama_lengkap: z.string().trim().min(2, 'Nama wajib min 2 karakter'),
  no_hp: z.string().trim().min(8, 'No HP wajib').optional().or(z.literal('')),
  email: z.string().trim().email('Format email salah').optional().or(z.literal('')),
  jenis_kelamin: z.enum(['L', 'P', '']).optional(),
  tanggal_lahir: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
  alamat: z.string().trim().optional().or(z.literal('')),
  kode_cabang: z.string().trim().min(1, 'Kode cabang wajib'),
  tanggal_bergabung: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD')
    .optional()
    .or(z.literal('')),
});

export interface ParseResult {
  rows: CsvRow[];
  totalRows: number;
}

export interface RowValidation {
  rowIndex: number;       // 1-based, header dihitung row 1 (jadi data row pertama = 2)
  raw: CsvRow;
  errors: string[];
  /** Hasil setelah validasi sukses + normalisasi. null jika ada error. */
  parsed: NormalizedRow | null;
}

export interface NormalizedRow {
  namaLengkap: string;
  noHp: string | null;
  email: string | null;
  jenisKelamin: 'L' | 'P' | null;
  tanggalLahir: Date | null;
  alamat: string | null;
  kodeCabang: string;
  tanggalBergabung: Date | null;
}

/** Parse CSV buffer → array of rows. Throw kalau header tidak match. */
export function parseCsv(buffer: Buffer): ParseResult {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: false,
  }) as Record<string, string>[];

  if (records.length === 0) return { rows: [], totalRows: 0 };

  const firstRow = records[0]!;
  const missing = CSV_HEADERS.filter((h) => !(h in firstRow));
  if (missing.length > 0) {
    throw new Error(`Header CSV tidak lengkap. Hilang: ${missing.join(', ')}`);
  }

  return { rows: records as CsvRow[], totalRows: records.length };
}

/** Validate + normalize semua row. Tidak hit DB di sini — itu di caller. */
export function validateRows(rows: CsvRow[]): RowValidation[] {
  return rows.map((raw, i) => {
    const rowIndex = i + 2; // +2 karena header = row 1, data row pertama = row 2
    const errors: string[] = [];

    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${issue.path.join('.')}: ${issue.message}`);
      }
      return { rowIndex, raw, errors, parsed: null };
    }

    // Normalize
    let noHp: string | null = null;
    if (parsed.data.no_hp && parsed.data.no_hp !== '') {
      const normalized = normalizeNoHp(parsed.data.no_hp);
      if (!/^\+62\d{8,13}$/.test(normalized)) {
        errors.push('no_hp: format tidak valid setelah normalisasi');
      } else {
        noHp = normalized;
      }
    }

    const jk = parsed.data.jenis_kelamin;
    const jenisKelamin = jk === 'L' || jk === 'P' ? jk : null;

    const normalized: NormalizedRow = {
      namaLengkap: parsed.data.nama_lengkap,
      noHp,
      email: parsed.data.email || null,
      jenisKelamin,
      tanggalLahir: parsed.data.tanggal_lahir ? new Date(parsed.data.tanggal_lahir) : null,
      alamat: parsed.data.alamat || null,
      kodeCabang: parsed.data.kode_cabang.toUpperCase(),
      tanggalBergabung: parsed.data.tanggal_bergabung ? new Date(parsed.data.tanggal_bergabung) : null,
    };

    return { rowIndex, raw, errors, parsed: errors.length === 0 ? normalized : null };
  });
}

/** Generate template CSV header + 2 contoh row. Dipakai endpoint download template. */
export function generateTemplateCsv(): string {
  const examples = [
    {
      nama_lengkap: 'Budi Santoso',
      no_hp: '+628123456789',
      email: 'budi@example.com',
      jenis_kelamin: 'L',
      tanggal_lahir: '1990-05-15',
      alamat: 'Jl. ABC No. 1',
      kode_cabang: 'JKT',
      tanggal_bergabung: '2024-01-15',
    },
    {
      nama_lengkap: 'Siti Aminah',
      no_hp: '08129876543',
      email: '',
      jenis_kelamin: 'P',
      tanggal_lahir: '1995-11-20',
      alamat: 'Jl. XYZ No. 2',
      kode_cabang: 'BDG',
      tanggal_bergabung: '',
    },
  ];
  const lines = [CSV_HEADERS.join(',')];
  for (const ex of examples) {
    lines.push(CSV_HEADERS.map((h) => csvEscape((ex as Record<string, string>)[h] ?? '')).join(','));
  }
  return lines.join('\n');
}

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
