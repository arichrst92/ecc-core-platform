import './common.js';
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// Slug: kebab-case alphanumeric (sama pattern dengan Konten)
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug harus huruf kecil + angka + tanda hubung')
  .max(280);

export const eventTipeBayarSchema = z.enum(['GRATIS', 'NOMINAL_TETAP', 'NOMINAL_BEBAS']);
export type EventTipeBayar = z.infer<typeof eventTipeBayarSchema>;

export const eventParticipationStatusSchema = z.enum([
  'DAFTAR',
  'MENUNGGU_VERIFIKASI',
  'BAYAR',
  'HADIR',
  'BATAL',
]);
export type EventParticipationStatus = z.infer<typeof eventParticipationStatusSchema>;

// Nominal: terima string dari form, koerse ke number ≥ 0
const nominalSchema = z.union([
  z.coerce.number().nonnegative('Nominal tidak boleh negatif'),
  z.literal('').transform(() => undefined),
]);

// ============================================================
//  Event CRUD
// ============================================================

export const createEventSchema = z
  .object({
    judul: z.string().trim().min(3, 'Minimal 3 karakter').max(255),
    slug: emptyToUndefined(slugSchema), // auto-generate kalau kosong
    ringkasan: emptyToUndefined(z.string().trim().max(500)),
    deskripsi: z.string().trim().min(3, 'Minimal 3 karakter'),
    videoUrl: emptyToUndefined(z.string().trim().url('Harus URL valid')),

    tanggalMulai: z.string().datetime({ offset: true }).or(z.string().date()),
    tanggalSelesai: emptyToUndefined(
      z.string().datetime({ offset: true }).or(z.string().date()),
    ),
    lokasi: emptyToUndefined(z.string().trim().max(500)),

    // Targeting — null/null = global
    sinodeId: emptyToUndefined(uuidSchema),
    cabangId: emptyToUndefined(uuidSchema),

    // Pembayaran
    tipeBayar: eventTipeBayarSchema.default('GRATIS'),
    nominal: nominalSchema.optional(),
    bankNama: emptyToUndefined(z.string().trim().max(100)),
    bankNomor: emptyToUndefined(z.string().trim().max(100)),
    bankAtasNama: emptyToUndefined(z.string().trim().max(255)),

    quotaPeserta: z.coerce.number().int().positive().optional().or(z.literal('').transform(() => undefined)),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),

    // Apakah event butuh absensi pada hari H (admin scan QR kode jemaat).
    butuhKehadiran: z.boolean().default(false),

    isPublished: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    // tanggalSelesai harus ≥ tanggalMulai
    if (data.tanggalSelesai && data.tanggalSelesai < data.tanggalMulai) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Tanggal selesai harus setelah tanggal mulai',
        path: ['tanggalSelesai'],
      });
    }
    // NOMINAL_TETAP wajib nominal > 0
    if (data.tipeBayar === 'NOMINAL_TETAP') {
      if (data.nominal === undefined || data.nominal === null || data.nominal <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Nominal wajib diisi (> 0) untuk tipe Nominal Tetap',
          path: ['nominal'],
        });
      }
    }
  })
  .openapi('CreateEventInput');
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    judul: z.string().trim().min(3, 'Minimal 3 karakter').max(255).optional(),
    slug: emptyToUndefined(slugSchema),
    ringkasan: emptyToUndefined(z.string().trim().max(500)),
    deskripsi: z.string().trim().min(3, 'Minimal 3 karakter').optional(),
    videoUrl: emptyToUndefined(z.string().trim().url('Harus URL valid')),
    tanggalMulai: emptyToUndefined(
      z.string().datetime({ offset: true }).or(z.string().date()),
    ),
    tanggalSelesai: emptyToUndefined(
      z.string().datetime({ offset: true }).or(z.string().date()),
    ),
    lokasi: emptyToUndefined(z.string().trim().max(500)),
    sinodeId: emptyToUndefined(uuidSchema),
    cabangId: emptyToUndefined(uuidSchema),
    tipeBayar: eventTipeBayarSchema.optional(),
    nominal: nominalSchema.optional(),
    bankNama: emptyToUndefined(z.string().trim().max(100)),
    bankNomor: emptyToUndefined(z.string().trim().max(100)),
    bankAtasNama: emptyToUndefined(z.string().trim().max(255)),
    quotaPeserta: z.coerce.number().int().positive().optional().or(z.literal('').transform(() => undefined)),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    butuhKehadiran: z.boolean().optional(),
    isPublished: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateEventInput');
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

// ============================================================
//  Event Participation
// ============================================================

export const registerEventParticipationSchema = z
  .object({
    jemaatId: uuidSchema,
    // Untuk NOMINAL_BEBAS, jemaat tentukan nominal di sini. Untuk NOMINAL_TETAP,
    // backend bisa auto-set dari event.nominal. Untuk GRATIS, undefined.
    nominalBayar: nominalSchema.optional(),
    catatan: emptyToUndefined(z.string().trim().max(1000)),
  })
  .openapi('RegisterEventParticipationInput');
export type RegisterEventParticipationInput = z.infer<typeof registerEventParticipationSchema>;

export const updateEventParticipationSchema = z
  .object({
    status: eventParticipationStatusSchema.optional(),
    nominalBayar: nominalSchema.optional(),
    catatan: emptyToUndefined(z.string().trim().max(1000)),
  })
  .openapi('UpdateEventParticipationInput');
export type UpdateEventParticipationInput = z.infer<typeof updateEventParticipationSchema>;

// ============================================================
//  Event Donation (multi-payment per participation, fundraising)
// ============================================================

export const eventDonationStatusSchema = z.enum([
  'MENUNGGU_VERIFIKASI',
  'BAYAR',
  'BATAL',
]);
export type EventDonationStatus = z.infer<typeof eventDonationStatusSchema>;

/**
 * Create donation untuk event tertentu. Endpoint resolve participation
 * via current user (JWT) — kalau user belum punya participation, BE
 * auto-create participation status DAFTAR dulu, lalu attach donation.
 *
 * Nominal harus > 0. Untuk NOMINAL_TETAP, nominal harus match event.nominal
 * (BE validate). Untuk NOMINAL_BEBAS, nominal >= event.nominal (minimum).
 */
export const createEventDonationSchema = z
  .object({
    nominalBayar: z.coerce.number().positive('Nominal harus > 0'),
    catatan: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('CreateEventDonationInput');
export type CreateEventDonationInput = z.infer<typeof createEventDonationSchema>;

/** Update donation (admin: status / nominal / catatan). */
export const updateEventDonationSchema = z
  .object({
    status: eventDonationStatusSchema.optional(),
    nominalBayar: z.coerce.number().positive().optional(),
    catatan: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('UpdateEventDonationInput');
export type UpdateEventDonationInput = z.infer<typeof updateEventDonationSchema>;

/**
 * Batch register multiple jemaat ke 1 event (mobile family registration).
 * Backend transactional per-peserta — kalau salah satu gagal, sisanya tetap
 * di-create. Response: { successful: Participation[], failed: { jemaatId, error }[] }.
 */
export const batchRegisterEventParticipationSchema = z
  .object({
    jemaatIds: z
      .array(uuidSchema)
      .min(1, 'Minimal 1 jemaat')
      .max(20, 'Maksimal 20 jemaat per request'),
    nominalBayarPerOrang: nominalSchema.optional(),
    catatan: emptyToUndefined(z.string().trim().max(1000)),
  })
  .openapi('BatchRegisterEventParticipationInput');
export type BatchRegisterEventParticipationInput = z.infer<
  typeof batchRegisterEventParticipationSchema
>;

// ============================================================
//  Ministry & Volunteer (event butuhKehadiran)
// ============================================================

export const linkEventPelayananSchema = z
  .object({
    pelayananId: uuidSchema,
  })
  .openapi('LinkEventPelayananInput');
export type LinkEventPelayananInput = z.infer<typeof linkEventPelayananSchema>;

export const assignEventVolunteerSchema = z
  .object({
    jemaatId: uuidSchema,
    pelayananRoleId: uuidSchema,
    canScanAttendance: z.boolean().default(false),
    catatan: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('AssignEventVolunteerInput');
export type AssignEventVolunteerInput = z.infer<typeof assignEventVolunteerSchema>;

export const updateEventVolunteerSchema = z
  .object({
    pelayananRoleId: uuidSchema.optional(),
    canScanAttendance: z.boolean().optional(),
    catatan: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('UpdateEventVolunteerInput');
export type UpdateEventVolunteerInput = z.infer<typeof updateEventVolunteerSchema>;

// ============================================================
//  Check-in (hari H event)
// ============================================================

export const eventCheckinSchema = z
  .object({
    kode: z
      .string()
      .trim()
      .min(4, 'Kode terlalu pendek')
      .max(20)
      .transform((v) => v.toUpperCase()),
    // Kalau true, admin secara eksplisit override warning (mis. belum BAYAR).
    force: z.boolean().default(false),
  })
  .openapi('EventCheckinInput');
export type EventCheckinInput = z.infer<typeof eventCheckinSchema>;
