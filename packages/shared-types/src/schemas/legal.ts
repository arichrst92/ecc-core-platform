/**
 * Legal Documents — Terms & Privacy, multi-language.
 *
 * Public read (no auth): GET /public/legal/:key?lang=id|en.
 * Admin CRUD (RBAC menuKey 'legal'): GET/PUT /admin/legal/:key/:lang.
 */
import { z } from 'zod';
import { emptyToUndefined } from './common.js';

export const legalKeySchema = z.enum(['TERMS', 'PRIVACY']);
export type LegalKey = z.infer<typeof legalKeySchema>;

export const legalLanguageSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(['id', 'en']));
export type LegalLanguage = z.infer<typeof legalLanguageSchema>;

/** Upsert single legal document untuk (key, lang). Title + content + version. */
export const upsertLegalDocumentSchema = z.object({
  title: z.string().trim().min(2).max(255),
  content: z.string().trim().min(10).openapi({
    description: 'Markdown content. Min 10 chars.',
  }),
  /**
   * Version string — bebas, tapi convention ISO date YYYY-MM-DD. Mobile pakai
   * field ini untuk detect update (compare dengan cached version).
   */
  version: z.string().trim().min(1).max(20),
  isPublished: z.boolean().default(true),
});
export type UpsertLegalDocumentInput = z.infer<typeof upsertLegalDocumentSchema>;

export const legalQuerySchema = z.object({
  lang: legalLanguageSchema.optional().default('id'),
});
