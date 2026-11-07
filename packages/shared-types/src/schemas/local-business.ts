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
import { namaOrangSchema, teksSchema, teksHurufSchema, tanggalLahirSchema, tanggalLampauSchema } from './input-rules.js';
import { uuidSchema, emptyToUndefined, paginationQuerySchema, noHpSchema } from './common.js';

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

// ===== Sosial media via username (2.4.7) =====
// Pemilik cukup mengisi username; URL dibentuk server. Semua opsional.
export const SOCIAL_PLATFORMS = {
  instagram: { label: 'Instagram', url: (u: string) => `https://instagram.com/${u}` },
  facebook: { label: 'Facebook', url: (u: string) => `https://facebook.com/${u}` },
  tiktok: { label: 'TikTok', url: (u: string) => `https://www.tiktok.com/@${u}` },
  youtube: { label: 'YouTube', url: (u: string) => `https://www.youtube.com/@${u}` },
  x: { label: 'X', url: (u: string) => `https://x.com/${u}` },
  linkedin: { label: 'LinkedIn', url: (u: string) => `https://www.linkedin.com/company/${u}` },
  threads: { label: 'Threads', url: (u: string) => `https://www.threads.net/@${u}` },
} as const;
export type SocialPlatformKey = keyof typeof SOCIAL_PLATFORMS;
export const SOCIAL_PLATFORM_KEYS = Object.keys(SOCIAL_PLATFORMS) as SocialPlatformKey[];

/** "@nama", "instagram.com/nama", "https://…/nama/" → "nama". */
export function cleanSocialUsername(v: string): string {
  let s = v.trim();
  s = s.replace(/^https?:\/\/(www\.)?[^/]+\/(company\/|in\/)?/i, '');
  s = s.replace(/^@/, '').replace(/[/?#].*$/, '');
  return s;
}

const usernameSchema = z
  .string()
  .trim()
  .max(100)
  .transform(cleanSocialUsername)
  .refine((v) => v === '' || /^[A-Za-z0-9._-]{1,60}$/.test(v), 'Username hanya huruf, angka, titik, garis bawah, atau tanda hubung.');

export const socialUsernamesSchema = z
  .object(Object.fromEntries(SOCIAL_PLATFORM_KEYS.map((k) => [k, usernameSchema.optional()])) as Record<SocialPlatformKey, z.ZodOptional<typeof usernameSchema>>)
  .partial();
export type SocialUsernames = Partial<Record<SocialPlatformKey, string>>;

/** Username → daftar { platform, url } (format socialLinks lama). */
export function socialUsernamesToLinks(u: SocialUsernames | null | undefined): { platform: string; url: string }[] {
  if (!u) return [];
  return SOCIAL_PLATFORM_KEYS.filter((k) => u[k]).map((k) => ({ platform: SOCIAL_PLATFORMS[k].label, url: SOCIAL_PLATFORMS[k].url(u[k]!) }));
}

// ===== Mata uang katalog =====
export const LOCAL_CURRENCIES = ['IDR', 'AUD', 'SGD', 'MYR', 'USD', 'EUR', 'NZD', 'HKD', 'TWD', 'CNY', 'JPY'] as const;
export const localCurrencySchema = z.enum(LOCAL_CURRENCIES);

// ===== Create =====
export const createLocalBusinessSchema = z.object({
  nama: teksHurufSchema(255).openapi({ example: 'Warung Budi' }),
  deskripsi: emptyToUndefined(teksSchema(2000)),
  industri: emptyToUndefined(teksHurufSchema(100)),
  tipeBisnis: tipeBisnisSchema,
  isOnline: z.boolean().default(false),
  lokasi: emptyToUndefined(teksSchema(500)),
  websiteUrl: emptyToUndefined(z.string().trim().url().max(500)),
  whatsappUrl: emptyToUndefined(z.string().trim().url().max(500)).openapi({
    description: "URL wa.me/<nomor> atau api.whatsapp.com/send?phone=<nomor>",
  }),
  socialLinks: socialLinksSchema.optional(),
  // 2.4.7
  waAdmin: emptyToUndefined(noHpSchema),
  email: emptyToUndefined(z.string().trim().toLowerCase().email('Format email tidak valid').max(255)),
  socialUsernames: socialUsernamesSchema.optional(),
});
export type CreateLocalBusinessInput = z.infer<typeof createLocalBusinessSchema>;

// ===== Update =====
// All fields optional; owner kirim hanya yg berubah. socialLinks kalau dikirim
// REPLACE entire array (bukan merge) — UI mobile rebuild list lalu PATCH.
export const updateLocalBusinessSchema = z.object({
  nama: teksHurufSchema(255).optional(),
  deskripsi: emptyToUndefined(teksSchema(2000)),
  industri: emptyToUndefined(teksHurufSchema(100)),
  tipeBisnis: tipeBisnisSchema.optional(),
  isOnline: z.boolean().optional(),
  lokasi: emptyToUndefined(teksSchema(500)),
  websiteUrl: emptyToUndefined(z.string().trim().url().max(500)),
  whatsappUrl: emptyToUndefined(z.string().trim().url().max(500)),
  socialLinks: socialLinksSchema.optional(),
  isActive: z.boolean().optional(),
  // 2.4.7 — null = hapus
  waAdmin: z.union([z.literal(''), z.null(), noHpSchema]).optional().transform((v) => (v === '' ? null : v)),
  email: z
    .union([z.literal(''), z.null(), z.string().trim().toLowerCase().email('Format email tidak valid').max(255)])
    .optional()
    .transform((v) => (v === '' ? null : v)),
  socialUsernames: socialUsernamesSchema.optional(),
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

// ===== Katalog item (2.4.7) =====
export const localItemJenisSchema = z.enum(['PRODUK', 'JASA']);
export const localHargaTipeSchema = z.enum(['TETAP', 'MULAI_DARI', 'NEGO']);

const itemBase = {
  jenis: localItemJenisSchema,
  nama: teksSchema(150),
  deskripsi: z.string().trim().max(2000).nullish().transform((v) => (v === undefined ? undefined : v ? v : null)),
  hargaTipe: localHargaTipeSchema,
  harga: z.coerce.number().min(0).max(999_999_999_999).nullish(),
  mataUang: localCurrencySchema.default('IDR'),
  satuan: z
    .string()
    .trim()
    .max(30)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v ? v.replace(/^\//, '').trim() || null : null)),
  isActive: z.boolean().optional(),
};

export const createLocalItemSchema = z
  .object(itemBase)
  .refine((d) => d.hargaTipe === 'NEGO' || (d.harga != null && d.harga > 0), {
    message: 'Isi harga, atau pilih "By agreement".',
    path: ['harga'],
  });
export type CreateLocalItemInput = z.infer<typeof createLocalItemSchema>;

export const updateLocalItemSchema = z.object({
  jenis: localItemJenisSchema.optional(),
  nama: teksSchema(150).optional(),
  deskripsi: itemBase.deskripsi,
  hargaTipe: localHargaTipeSchema.optional(),
  harga: itemBase.harga,
  mataUang: localCurrencySchema.optional(),
  satuan: itemBase.satuan,
  isActive: z.boolean().optional(),
});
export type UpdateLocalItemInput = z.infer<typeof updateLocalItemSchema>;
