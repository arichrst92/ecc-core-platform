/**
 * Admin Website Content — CMS untuk landing site eccchurch.global.
 *
 * Endpoints:
 *   - GET    /admin/website-content        — list semua section
 *   - GET    /admin/website-content/:id    — detail single section
 *   - PUT    /admin/website-content/:id    — update content/title/isActive
 *
 * Key + contentType immutable setelah create (untuk avoid landing break
 * kalau key di-rename). Admin tambah section baru → seed via migration.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { updateWebsiteSectionSchema } from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const websiteContentRouter = Router();

// GET /admin/website-content — list semua section, sort by key.
websiteContentRouter.get('/', async (_req, res) => {
  const rows = await prisma.websiteSection.findMany({
    orderBy: [{ isActive: 'desc' }, { key: 'asc' }],
  });
  res.json({ success: true, data: rows });
});

// GET /admin/website-content/:id — single section detail.
websiteContentRouter.get('/:id', async (req, res) => {
  const row = await prisma.websiteSection.findUnique({
    where: { id: req.params.id ?? '' },
  });
  if (!row) throw NotFound('Section tidak ditemukan.');
  res.json({ success: true, data: row });
});

// PUT /admin/website-content/:id — update content/title/isActive.
// Validate JSON content kalau contentType=json supaya tidak save invalid.
websiteContentRouter.put('/:id', async (req, res) => {
  const id = req.params.id ?? '';
  const input = updateWebsiteSectionSchema.parse(req.body);
  if (Object.keys(input).length === 0) {
    throw BadRequest('Minimal satu field harus diisi untuk update.');
  }

  const before = await prisma.websiteSection.findUnique({ where: { id } });
  if (!before) throw NotFound('Section tidak ditemukan.');

  // Validate JSON content kalau section pakai contentType=json.
  if (
    input.content !== undefined &&
    before.contentType === 'json'
  ) {
    try {
      JSON.parse(input.content);
    } catch (err) {
      throw BadRequest(
        'Content tidak valid sebagai JSON. Pastikan format JSON benar (cek braces, quotes, koma).',
      );
    }
  }

  const userId = req.user?.sub ?? null;
  const updated = await prisma.websiteSection.update({
    where: { id },
    data: {
      ...input,
      updatedByUserId: userId,
    },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'website_section',
    resourceId: updated.id,
    resourceLabel: `${updated.title} (${updated.key})`,
    before,
    after: updated,
  });

  res.json({ success: true, data: updated });
});
