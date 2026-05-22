/**
 * App Version — admin CRUD untuk update prompt mobile.
 *
 * Scheme: 1 row aktif (isPublished=true) per platform. Saat upsert publish,
 * unpublish row sebelumnya (kalau ada).
 *
 *   - GET    /admin/app-version              → list semua row
 *   - GET    /admin/app-version/:id          → detail
 *   - POST   /admin/app-version              → create new (auto-unpublish prev kalau isPublished=true)
 *   - PATCH  /admin/app-version/:id          → update
 *   - DELETE /admin/app-version/:id          → hard delete (history only)
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { upsertAppVersionSchema } from '@ecc/shared-types';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const appVersionRouter = Router();

appVersionRouter.get('/', async (_req, res) => {
  const rows = await prisma.appVersion.findMany({
    orderBy: [{ platform: 'asc' }, { isPublished: 'desc' }, { publishedAt: 'desc' }],
  });
  res.json({ success: true, data: rows });
});

appVersionRouter.get('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) throw BadRequest('Path param :id wajib.');
  const row = await prisma.appVersion.findUnique({ where: { id } });
  if (!row) throw NotFound('Row tidak ditemukan.');
  res.json({ success: true, data: row });
});

appVersionRouter.post('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = upsertAppVersionSchema.parse(req.body);
  const now = new Date();

  // Saat publish, unpublish published-row lain di platform yg sama supaya
  // selalu cuma 1 aktif per platform.
  const created = await prisma.$transaction(async (tx) => {
    if (input.isPublished) {
      await tx.appVersion.updateMany({
        where: { platform: input.platform, isPublished: true },
        data: { isPublished: false },
      });
    }
    return tx.appVersion.create({
      data: {
        platform: input.platform,
        latestVersion: input.latestVersion,
        minSupportedVersion: input.minSupportedVersion,
        releaseNotes: input.releaseNotes,
        downloadUrl: input.downloadUrl,
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? now : null,
        publishedByUserId: req.user!.sub,
      },
    });
  });

  audit(req, {
    action: 'CREATE',
    resource: 'app_version',
    resourceId: created.id,
    resourceLabel: `${created.platform} v${created.latestVersion} (min ${created.minSupportedVersion})${created.isPublished ? ' [PUBLISHED]' : ''}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

appVersionRouter.patch('/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const id = req.params.id;
  if (!id) throw BadRequest('Path param :id wajib.');
  const input = upsertAppVersionSchema.partial().parse(req.body);
  const before = await prisma.appVersion.findUnique({ where: { id } });
  if (!before) throw NotFound('Row tidak ditemukan.');

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    // Kalau publish dinaikkan dari false ke true, unpublish row lain di platform.
    if (input.isPublished === true && !before.isPublished) {
      await tx.appVersion.updateMany({
        where: { platform: before.platform, isPublished: true, NOT: { id } },
        data: { isPublished: false },
      });
    }
    const data: any = {};
    if (input.latestVersion !== undefined) data.latestVersion = input.latestVersion;
    if (input.minSupportedVersion !== undefined) data.minSupportedVersion = input.minSupportedVersion;
    if (input.releaseNotes !== undefined) data.releaseNotes = input.releaseNotes;
    if (input.downloadUrl !== undefined) data.downloadUrl = input.downloadUrl;
    if (input.isPublished !== undefined) {
      data.isPublished = input.isPublished;
      data.publishedAt = input.isPublished ? now : null;
      data.publishedByUserId = req.user!.sub;
    }
    return tx.appVersion.update({ where: { id }, data });
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'app_version',
    resourceId: updated.id,
    resourceLabel: `${updated.platform} v${updated.latestVersion}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

appVersionRouter.delete('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) throw BadRequest('Path param :id wajib.');
  const before = await prisma.appVersion.findUnique({ where: { id } });
  if (!before) throw NotFound('Row tidak ditemukan.');
  await prisma.appVersion.delete({ where: { id } });
  audit(req, {
    action: 'DELETE',
    resource: 'app_version',
    resourceId: before.id,
    resourceLabel: `${before.platform} v${before.latestVersion}`,
    before,
  });
  res.status(204).end();
});
