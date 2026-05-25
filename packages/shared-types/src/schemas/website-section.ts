/**
 * Website Section — CMS untuk landing site eccchurch.global.
 *
 * Generic key-value content store. Admin edit via portal Website group,
 * landing fetch via GET /public/website-content.
 *
 * Content type:
 *   - 'markdown' = plain text body dengan markdown formatting
 *   - 'json' = JSON stringified (parse di landing untuk structured data)
 */
import { z } from 'zod';

export const websiteContentTypeSchema = z.enum(['markdown', 'json']);
export type WebsiteContentType = z.infer<typeof websiteContentTypeSchema>;

export const websiteSectionSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(2).max(64),
  title: z.string().min(2).max(255),
  contentType: websiteContentTypeSchema,
  content: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  updatedByUserId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type WebsiteSection = z.infer<typeof websiteSectionSchema>;

/** Update payload — content + isActive boleh diubah, key + contentType immutable. */
export const updateWebsiteSectionSchema = z.object({
  title: z.string().trim().min(2).max(255).optional(),
  content: z.string().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebsiteSectionInput = z.infer<typeof updateWebsiteSectionSchema>;

/** Public response shape — map of key → content. */
export type PublicWebsiteContent = Record<
  string,
  {
    contentType: WebsiteContentType;
    content: string;
  }
>;
