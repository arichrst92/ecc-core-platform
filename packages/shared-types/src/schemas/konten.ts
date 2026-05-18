import './common.js';
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

export const kontenTipeSchema = z.enum(['NEWS', 'RENUNGAN']);
export type KontenTipe = z.infer<typeof kontenTipeSchema>;

// Slug helper — kebab-case alphanumeric
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Slug harus huruf kecil + angka + tanda hubung')
  .max(280);

// ===== Create Konten (NEWS atau RENUNGAN) =====
//
// Tipe biasanya di-set di endpoint (POST /admin/news vs /admin/renungan),
// jadi optional di schema. Author auto dari JWT.
export const createKontenSchema = z
  .object({
    judul: z.string().trim().min(3).max(255),
    slug: emptyToUndefined(slugSchema), // auto-generate di backend kalau kosong
    ringkasan: emptyToUndefined(z.string().trim().max(500)),
    konten: z.string().trim().min(10), // markdown body
    // Targeting (kalau null semua = global; kalau cabangId set, sinodeId akan auto-derive)
    sinodeId: emptyToUndefined(uuidSchema),
    cabangId: emptyToUndefined(uuidSchema),
    // Renungan-spesifik (opsional)
    tanggal: emptyToUndefined(z.string().date()),
    ayatAlkitab: emptyToUndefined(z.string().trim().max(255)),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    // Publish state
    isPublished: z.boolean().default(false),
  })
  .openapi('CreateKontenInput');
export type CreateKontenInput = z.infer<typeof createKontenSchema>;

// ===== Update Konten =====
export const updateKontenSchema = z
  .object({
    judul: z.string().trim().min(3).max(255).optional(),
    slug: emptyToUndefined(slugSchema),
    ringkasan: emptyToUndefined(z.string().trim().max(500)),
    konten: z.string().trim().min(10).optional(),
    sinodeId: emptyToUndefined(uuidSchema),
    cabangId: emptyToUndefined(uuidSchema),
    tanggal: emptyToUndefined(z.string().date()),
    ayatAlkitab: emptyToUndefined(z.string().trim().max(255)),
    tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    isPublished: z.boolean().optional(),
  })
  .openapi('UpdateKontenInput');
export type UpdateKontenInput = z.infer<typeof updateKontenSchema>;
