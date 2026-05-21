import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// Koordinat WGS84. Empty string → undefined (nullable di DB).
const latitudeSchema = z
  .union([z.coerce.number().min(-90).max(90), z.literal('').transform(() => undefined)])
  .optional();
const longitudeSchema = z
  .union([z.coerce.number().min(-180).max(180), z.literal('').transform(() => undefined)])
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
