/**
 * Group (module 23) — Zod schemas untuk validasi input.
 *
 * Endpoint yg pakai:
 *   POST   /admin/group                       → createGroupSchema
 *   PATCH  /admin/group/:id                   → updateGroupSchema
 *   POST   /admin/group/join-by-code          → joinByCodeSchema
 *   POST   /admin/group/:id/join              → (no body)
 *   POST   /admin/group/:id/members/:jemaatId → (no body)
 */
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';
import { hariMingguSchema } from './ibadah.js';

/** Match Prisma enum GroupJenis. */
export const groupJenisSchema = z.enum([
  'FAMILY',
  'MINISTRY',
  'COMMUNITY',
  'HOMECELL_STYLE',
  'SYSTEM',
  'LAINNYA',
]);
export type GroupJenisEnum = z.infer<typeof groupJenisSchema>;

/** HH:mm 24-hour format */
const jamSchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Format jam harus HH:mm (24-hour)');

/**
 * Create Group. cabangId + nama wajib. Sisanya opsional.
 */
export const createGroupSchema = z.object({
  cabangId: uuidSchema,
  parentId: emptyToUndefined(uuidSchema),
  nama: z.string().trim().min(2).max(200),
  deskripsi: emptyToUndefined(z.string().trim().max(5000)),
  jenis: groupJenisSchema.default('LAINNYA'),
  alamat: emptyToUndefined(z.string().trim().max(500)),
  gps: emptyToUndefined(z.string().trim().max(64)),
  hari: emptyToUndefined(hariMingguSchema),
  jam: emptyToUndefined(jamSchema),
  picJemaatId: emptyToUndefined(uuidSchema),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
});
export type CreateGroupInput = z.infer<typeof createGroupSchema>;

/**
 * Update Group. Semua field opsional. Toggle isPublic false → true akan
 * auto-clear joinCode di handler (bukan di schema).
 */
export const updateGroupSchema = z.object({
  parentId: emptyToUndefined(uuidSchema).nullable(),
  nama: z.string().trim().min(2).max(200).optional(),
  deskripsi: emptyToUndefined(z.string().trim().max(5000)).nullable(),
  jenis: groupJenisSchema.optional(),
  alamat: emptyToUndefined(z.string().trim().max(500)).nullable(),
  gps: emptyToUndefined(z.string().trim().max(64)).nullable(),
  hari: emptyToUndefined(hariMingguSchema).nullable(),
  jam: emptyToUndefined(jamSchema).nullable(),
  picJemaatId: emptyToUndefined(uuidSchema).nullable(),
  isPublic: z.boolean().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

/**
 * Join by invitation code — untuk private group (QR scan di mobile).
 * Code format: 8-char alphanumeric uppercase (mis. "A3F7K9M2").
 */
export const joinByCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6)
    .max(20)
    .regex(/^[A-Z0-9]+$/i, 'Kode invitation harus alphanumeric'),
});
export type JoinByCodeInput = z.infer<typeof joinByCodeSchema>;

/**
 * Add member manual oleh PIC (via portal atau mobile PIC UI).
 * Body cuma jemaatId; PIC pilih dari dropdown/search jemaat.
 */
export const addGroupMemberSchema = z.object({
  jemaatId: uuidSchema,
  catatan: emptyToUndefined(z.string().trim().max(500)),
});
export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;
