import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// Koordinat WGS84. Empty/null → undefined (nullable di DB).
//
// Preprocess: accept koma ',' sebagai decimal separator (locale Indonesia)
// + accept titik '.'. Browser HTML5 input[type=number] block koma di locale
// Indonesia, jadi portal pakai inputMode='decimal' (text input) + normalize
// di sini sebelum coerce ke number.
//
// Examples that work:
//   "-6,2088"     → -6.2088
//   "-6.2088"     → -6.2088
//   "  6 , 2088 " → 6.2088 (whitespace di-trim)
//   ""            → undefined
//   null          → undefined
//   -6.2088 (number) → -6.2088 (no-op)
function preprocessDecimal(value: unknown): unknown {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/,/g, '.').replace(/\s+/g, '');
    if (trimmed === '') return undefined;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : value; // biar Zod yang reject kalau NaN
  }
  return value;
}

const latitudeSchema = z
  .preprocess(preprocessDecimal, z.number().min(-90).max(90).optional())
  .optional();
const longitudeSchema = z
  .preprocess(preprocessDecimal, z.number().min(-180).max(180).optional())
  .optional();

export const createCabangSchema = z
  .object({
    sinodeId: uuidSchema,
    nama: z.string().trim().min(2).max(255).openapi({ example: 'ECC Jakarta' }),
    kode: z.string().trim().min(2).max(20).toUpperCase().openapi({ example: 'JKT' }),
    alamat: emptyToUndefined(z.string().trim()),
    kontak: emptyToUndefined(z.string().trim().max(100)),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .openapi('CreateCabangInput');
export type CreateCabangInput = z.infer<typeof createCabangSchema>;

export const updateCabangSchema = z
  .object({
    sinodeId: uuidSchema.optional(),
    nama: z.string().trim().min(2).max(255).optional(),
    kode: z.string().trim().min(2).max(20).toUpperCase().optional(),
    alamat: emptyToUndefined(z.string().trim()),
    kontak: emptyToUndefined(z.string().trim().max(100)),
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateCabangInput');
export type UpdateCabangInput = z.infer<typeof updateCabangSchema>;

// ============================================================
//  Cabang Rekening (multi-rekening per cabang)
// ============================================================
// Preset purpose untuk suggestion di FE — text tetap bebas.
export const REKENING_PURPOSE_PRESETS = [
  'Persembahan Umum',
  'Persepuluhan',
  'Pembangunan',
  'Diakonia',
  'Misi',
  'Operasional',
  'Pelayanan Anak',
  'Pelayanan Pemuda',
];

export const createCabangRekeningSchema = z
  .object({
    purpose: z.string().trim().min(2, 'Purpose minimal 2 karakter').max(255),
    bankNama: z.string().trim().min(2, 'Nama bank wajib').max(100),
    bankNomor: z.string().trim().min(4, 'No rekening minimal 4 digit').max(100),
    bankAtasNama: z.string().trim().min(2, 'Atas nama wajib').max(255),
    catatan: emptyToUndefined(z.string().trim().max(1000)),
    isActive: z.boolean().default(true),
  })
  .openapi('CreateCabangRekeningInput');
export type CreateCabangRekeningInput = z.infer<typeof createCabangRekeningSchema>;

export const updateCabangRekeningSchema = z
  .object({
    purpose: z.string().trim().min(2).max(255).optional(),
    bankNama: z.string().trim().min(2).max(100).optional(),
    bankNomor: z.string().trim().min(4).max(100).optional(),
    bankAtasNama: z.string().trim().min(2).max(255).optional(),
    catatan: emptyToUndefined(z.string().trim().max(1000)),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateCabangRekeningInput');
export type UpdateCabangRekeningInput = z.infer<typeof updateCabangRekeningSchema>;
