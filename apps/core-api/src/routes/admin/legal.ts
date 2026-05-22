/**
 * Legal Documents — admin CRUD.
 *
 * Schema: 1 row per (key, language). Update via PUT (upsert by composite unique).
 *
 * Endpoint:
 *   - GET    /admin/legal                       → list all (id+en, terms+privacy)
 *   - GET    /admin/legal/:key/:lang            → detail single doc
 *   - PUT    /admin/legal/:key/:lang            → upsert (publish/update)
 *   - DELETE /admin/legal/:key/:lang            → delete a translation
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  legalKeySchema,
  legalLanguageSchema,
  upsertLegalDocumentSchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const legalRouter = Router();

function parseKey(raw: string) {
  const result = legalKeySchema.safeParse(raw);
  if (!result.success) throw BadRequest('Key tidak valid (TERMS | PRIVACY).');
  return result.data;
}

function parseLang(raw: string) {
  const result = legalLanguageSchema.safeParse(raw);
  if (!result.success) throw BadRequest('Language tidak valid (id | en).');
  return result.data;
}

legalRouter.get('/', async (_req, res) => {
  const rows = await prisma.legalDocument.findMany({
    orderBy: [{ key: 'asc' }, { language: 'asc' }],
  });
  res.json({ success: true, data: rows });
});

legalRouter.get('/:key/:lang', async (req, res) => {
  const key = parseKey(req.params.key ?? '');
  const language = parseLang(req.params.lang ?? '');
  const row = await prisma.legalDocument.findUnique({
    where: { key_language: { key, language } },
  });
  if (!row) throw NotFound('Dokumen belum ada untuk (key, language) ini.');
  res.json({ success: true, data: row });
});

legalRouter.put('/:key/:lang', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const key = parseKey(req.params.key ?? '');
  const language = parseLang(req.params.lang ?? '');
  const input = upsertLegalDocumentSchema.parse(req.body);

  const before = await prisma.legalDocument.findUnique({
    where: { key_language: { key, language } },
  });
  const now = new Date();
  const data = {
    title: input.title,
    content: input.content,
    version: input.version,
    isPublished: input.isPublished,
    publishedAt: now,
    publishedByUserId: req.user.sub,
  };
  const updated = await prisma.legalDocument.upsert({
    where: { key_language: { key, language } },
    create: { key, language, ...data },
    update: data,
  });
  audit(req, {
    action: before ? 'UPDATE' : 'CREATE',
    resource: 'legal_document',
    resourceId: updated.id,
    resourceLabel: `${key} / ${language} v${input.version}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

legalRouter.delete('/:key/:lang', async (req, res) => {
  const key = parseKey(req.params.key ?? '');
  const language = parseLang(req.params.lang ?? '');
  const before = await prisma.legalDocument.findUnique({
    where: { key_language: { key, language } },
  });
  if (!before) throw NotFound('Dokumen tidak ditemukan.');
  // Cegah hapus 'id' (bahasa fallback default) supaya endpoint public tidak broken.
  if (language === 'id') {
    throw BadRequest(
      'Tidak boleh hapus dokumen bahasa "id" (digunakan sebagai fallback). ' +
        'Edit isi-nya saja.',
    );
  }
  await prisma.legalDocument.delete({
    where: { key_language: { key, language } },
  });
  audit(req, {
    action: 'DELETE',
    resource: 'legal_document',
    resourceId: before.id,
    resourceLabel: `${key} / ${language}`,
    before,
  });
  res.status(204).end();
});
