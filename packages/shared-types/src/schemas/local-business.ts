/**
 * Local Business / Local Market (Movement).
 *
 * Direktori bisnis jemaat. Owner CRUD via mobile, portal admin read-only +
 * delete moderasi.
 *
 * File uploads (hero image, company profile PDF) tidak ada di create/update
 * schema — gunakan endpoint terpisah:
 *   POST /admin/me/businesses/:id/hero          (multipart image)
 *   DELETE /admin/me/businesses/:id/hero        (clear hero)
 *   POST /admin/me/businesses/:id/profile-pdf   (multipart PDF)
 *   DELETE /admin/me/businesses/:id/profile-pdf (clear PDF)
 */
import { z } from 'zod';
import { uuidSchema, emptyToUndefined, paginationQuerySchema } from './common.js';

export const tipeBisnisSchema = z.enum(['B2C', 'B2B', 'B2B2C']);
export type TipeBisnis = z.infer<typeof tipeBisnisSchema>;

// ===== Social links =====
// Array of { platform, url } — platform free text (UI mobile boleh preset).
// Maks 10 links per bisnis untuk sanity. Tidak ada index per platform.
export const socialLinkSchema = z.object({
  platform: z.string().trim().min(1).max(50).openapi({
    example: 'Instagram',
    description: "Nama platform sosial. Bebas, mobile UI boleh suggest list (Instagram/TikTok/Facebook/X/LinkedIn/dst).",
  }),
  url: z.string().trim().url().max(500).openapi({
    example: 'https://instagram.com/mybusiness',
  }),
});
export type SocialLink = z.infer<typeof socialLinkSchema>;

export const socialLinksSchema = z.array(socialLinkSchema).max(10);

// ===== Create =====
export const createLocalBusinessSchema = z.object({
  nama: z.string().trim().min(2).max(255).openapi({ example: 'Warung Budi' }),
  deskripsi: emptyToUndefined(z.string().trim().max(2000)),
  industri: emptyToUndefined(z.string().trim().max(100)),
  tipeBisnis: tipeBisnisSchema,
  isOnline: z.boolean().default(false),
  lokasi: emptyToUndefined(z.string().trim().max(500)),
  websiteUrl: emptyToUndefined(z.string().trim().url().max(500)),
  whatsappUrl: emptyToUndefined(z.string().trim().url().max(500)).openapi({
    description: "URL wa.me/<nomor> atau api.whatsapp.com/send?phone=<nomor>",
  }),
  socialLinks: socialLinksSchema.optional(),
});
export type CreateLocalBusinessInput = z.infer<typeof createLocalBusinessSchema>;

// ===== Update =====
// All fields optional; owner kirim hanya yg berubah. socialLinks kalau dikirim
// REPLACE entire array (bukan merge) — UI mobile rebuild list lalu PATCH.
export const updateLocalBusinessSchema = z.object({
  nama: z.string().trim().min(2).max(255).optional(),
  deskripsi: emptyToUndefined(z.string().trim().max(2000)),
  industri: emptyToUndefined(z.string().trim().max(100)),
  tipeBisnis: tipeBisnisSchema.optional(),
  isOnline: z.boolean().optional(),
  lokasi: emptyToUndefined(z.string().trim().max(500)),
  websiteUrl: emptyToUndefined(z.string().trim().url().max(500)),
  whatsappUrl: emptyToUndefined(z.string().trim().url().max(500)),
  socialLinks: socialLinksSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateLocalBusinessInput = z.infer<typeof updateLocalBusinessSchema>;

// ===== Browse query (mobile local-market) =====
export const browseLocalMarketQuerySchema = paginationQuerySchema.extend({
  /** Filter by cabang owner (default: all cabang dlm sinode). */
  cabangId: emptyToUndefined(uuidSchema),
  industri: emptyToUndefined(z.string().trim().max(100)),
  tipeBisnis: tipeBisnisSchema.optional(),
  /** Hanya yg online / offline. Default: all. */
  isOnline: emptyToUndefined(z.enum(['true', 'false']).transform((v) => v === 'true')),
});
export type BrowseLocalMarketQuery = z.infer<typeof browseLocalMarketQuerySchema>;

// ===== Admin portal query =====
export const adminLocalBusinessQuerySchema = paginationQuerySchema.extend({
  cabangId: emptyToUndefined(uuidSchema),
  ownerJemaatId: emptyToUndefined(uuidSchema),
  industri: emptyToUndefined(z.string().trim().max(100)),
  tipeBisnis: tipeBisnisSchema.optional(),
  isActive: emptyToUndefined(z.enum(['true', 'false']).transform((v) => v === 'true')),
});
export type AdminLocalBusinessQuery = z.infer<typeof adminLocalBusinessQuerySchema>;
