/**
 * Developer Tools → API Access — token API pribadi Team IT Minister.
 *
 *   GET    /admin/api-token/me       → kelayakan saya + token saya
 *   POST   /admin/api-token          → buat token (token mentah tampil SEKALI)
 *   DELETE /admin/api-token/:id      → cabut token (pemilik, atau menu api-access:write)
 *   GET    /admin/api-token/all      → semua token (menu api-access)
 *   GET    /admin/api-token/config   → role IT Minister yang diizinkan (menu api-access)
 *   PUT    /admin/api-token/config   → ubah role yang diizinkan (menu api-access:write)
 *
 * Token tidak bisa dipakai untuk membuat token lain / mengubah konfigurasi
 * (wajib login Portal) — supaya agen AI tidak bisa memperluas aksesnya sendiri.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, type ITMinisterRole } from '@ecc/database';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { hasMenuAccessFor, requireMenuP } from '../../middleware/require-menu.js';
import { allowedItRoles, apiEligibility, generatePersonalToken, invalidatePatCache } from '../../lib/personal-token.js';

export const apiTokenRouter = Router();

const IT_ROLES: ITMinisterRole[] = [
  'HEAD_IT_MINISTER',
  'IT_COORDINATOR',
  'HEAD_PRODUCT',
  'SPECIFIC_PRODUCT',
  'HEAD_DATA',
  'DATA_MEMBER',
  'HEAD_OPERATION',
  'OPERATION_L0',
  'OPERATION_L1',
  'OPERATION_L2',
];

function noTokenAuth(req: { pat?: unknown }) {
  if (req.pat) throw Forbidden('Aksi ini hanya bisa dilakukan dari Portal (login), bukan dengan token API.');
}

const tokenOut = (t: {
  id: string;
  nama: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  lastUsedIp: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) => ({
  id: t.id,
  nama: t.nama,
  preview: `ecc_pat_${t.keyPrefix}_…`,
  lastUsedAt: t.lastUsedAt,
  lastUsedIp: t.lastUsedIp,
  expiresAt: t.expiresAt,
  revokedAt: t.revokedAt,
  createdAt: t.createdAt,
  status: t.revokedAt ? 'REVOKED' : t.expiresAt && t.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE',
});

apiTokenRouter.get('/me', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const [elig, tokens, canManage] = await Promise.all([
    apiEligibility(req.user.jemaatId),
    prisma.personalAccessToken.findMany({ where: { userId: req.user.sub }, orderBy: { createdAt: 'desc' } }),
    hasMenuAccessFor(req.user, 'api-access', 'write'),
  ]);
  res.json({
    success: true,
    data: {
      eligible: elig.eligible,
      allowedRoles: elig.allowed,
      myItRoles: elig.team,
      canManage,
      tokens: tokens.map(tokenOut),
    },
  });
});

const createSchema = z.object({
  nama: z.string().trim().min(3).max(120),
  // Masa berlaku (hari). null = tanpa kedaluwarsa (tidak disarankan).
  expiresInDays: z.number().int().min(1).max(365).nullable().default(90),
});

apiTokenRouter.post('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  noTokenAuth(req);
  const input = createSchema.parse(req.body);
  const elig = await apiEligibility(req.user.jemaatId);
  if (!elig.eligible) {
    throw Forbidden('Token API hanya untuk anggota aktif Team IT Minister dengan role yang diizinkan (Developer Tools → API Access).');
  }
  const active = await prisma.personalAccessToken.count({
    where: { userId: req.user.sub, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
  });
  if (active >= 10) throw BadRequest('Maksimal 10 token aktif per orang — cabut token lama dulu.');

  const { raw, prefix, hash } = await generatePersonalToken();
  const row = await prisma.personalAccessToken.create({
    data: {
      userId: req.user.sub,
      nama: input.nama,
      keyPrefix: prefix,
      keyHash: hash,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'api_token',
    resourceId: row.id,
    resourceLabel: `Token API "${row.nama}"`,
    metadata: { expiresAt: row.expiresAt },
  });
  res.status(201).json({ success: true, data: { ...tokenOut(row), token: raw } });
});

apiTokenRouter.delete('/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const row = await prisma.personalAccessToken.findUnique({ where: { id: req.params.id } });
  if (!row) throw NotFound('Token tidak ditemukan.');
  if (row.userId !== req.user.sub) await requireMenuP(req, 'api-access', 'write');
  if (!row.revokedAt) {
    await prisma.personalAccessToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
    invalidatePatCache();
  }
  audit(req, { action: 'DELETE', resource: 'api_token', resourceId: row.id, resourceLabel: `Cabut token API "${row.nama}"` });
  res.json({ success: true });
});

apiTokenRouter.get('/all', async (req, res) => {
  await requireMenuP(req, 'api-access', 'read');
  const rows = await prisma.personalAccessToken.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { user: { select: { jemaat: { select: { id: true, namaLengkap: true, kode: true } } } } },
  });
  res.json({ success: true, data: rows.map((r) => ({ ...tokenOut(r), owner: r.user.jemaat })) });
});

apiTokenRouter.get('/config', async (req, res) => {
  await requireMenuP(req, 'api-access', 'read');
  const [allowed, team] = await Promise.all([
    allowedItRoles(),
    prisma.iTMinisterTeam.findMany({
      where: { isActive: true },
      select: { roleTitle: true, divisi: true, jemaat: { select: { id: true, namaLengkap: true } } },
      orderBy: [{ divisi: 'asc' }, { roleTitle: 'asc' }],
    }),
  ]);
  res.json({ success: true, data: { allowedRoles: allowed, roles: IT_ROLES, team } });
});

apiTokenRouter.put('/config', async (req, res) => {
  noTokenAuth(req);
  await requireMenuP(req, 'api-access', 'write');
  const input = z.object({ allowedRoles: z.array(z.enum(IT_ROLES as [ITMinisterRole, ...ITMinisterRole[]])).max(20) }).parse(req.body);
  const before = await allowedItRoles();
  await prisma.appConfig.upsert({
    where: { id: 'global' },
    update: { apiAccessItRoles: input.allowedRoles, updatedByUserId: req.user!.sub },
    create: { id: 'global', apiAccessItRoles: input.allowedRoles, updatedByUserId: req.user!.sub },
  });
  invalidatePatCache();
  audit(req, {
    action: 'UPDATE',
    resource: 'api_access_config',
    resourceLabel: 'Role IT Minister yang boleh memakai API',
    before: { allowedRoles: before },
    after: { allowedRoles: input.allowedRoles },
  });
  res.json({ success: true, data: { allowedRoles: input.allowedRoles } });
});
