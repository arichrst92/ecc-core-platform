/**
 * Credential vault — admin CRUD + master-password gate.
 *
 * Endpoint:
 *   POST   /admin/credential/unlock     → verify master password (no data, cuma untuk UX feedback)
 *   GET    /admin/credential            → list all
 *   GET    /admin/credential/:id        → detail
 *   POST   /admin/credential            → create
 *   PATCH  /admin/credential/:id        → update
 *   DELETE /admin/credential/:id        → hard delete
 *
 * Semua endpoint di-gate dengan `requireMasterAccess` middleware (kecuali
 * /unlock yg specifically verify password).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createCredentialSchema,
  updateCredentialSchema,
  unlockCredentialSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { ApiError, BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { requireMasterAccess } from '../../middleware/require-master-access.js';

export const credentialRouter = Router();

// /unlock — verify master password tanpa expose data. Body: { password }.
// Tidak pakai middleware requireMasterAccess (karena ini endpoint untuk
// verify password itu sendiri).
credentialRouter.post('/unlock', async (req, res) => {
  const input = unlockCredentialSchema.parse(req.body);
  const expected = process.env.CREDENTIAL_MASTER_PASSWORD ?? '';
  if (!expected || expected.length < 8) {
    throw new ApiError(
      503,
      'MASTER_ACCESS_NOT_CONFIGURED',
      'CREDENTIAL_MASTER_PASSWORD belum di-set di server .env. Hubungi devops.',
    );
  }
  if (input.password.length !== expected.length || input.password !== expected) {
    // Log failed attempt untuk audit security
    audit(req, {
      action: 'LOGIN',
      resource: 'credential_unlock',
      resourceLabel: 'FAILED master password attempt',
      metadata: { kind: 'credential-unlock-failed' },
    });
    throw Unauthorized('Master password salah.');
  }
  audit(req, {
    action: 'LOGIN',
    resource: 'credential_unlock',
    resourceLabel: 'Credential vault unlocked',
    metadata: { kind: 'credential-unlock-success' },
  });
  res.json({ success: true, data: { unlocked: true } });
});

// Semua endpoint berikutnya wajib master access via header.
credentialRouter.use(requireMasterAccess);

credentialRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? {
        OR: [
          { nama: { contains: q.search, mode: 'insensitive' as const } },
          { email: { contains: q.search, mode: 'insensitive' as const } },
          { username: { contains: q.search, mode: 'insensitive' as const } },
        ],
      }
    : {};
  const [rows, total] = await Promise.all([
    prisma.credential.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: [{ [q.sortBy ?? 'nama']: q.sortOrder }],
    }),
    prisma.credential.count({ where }),
  ]);
  res.json({
    success: true,
    data: rows,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

credentialRouter.get('/:id', async (req, res) => {
  const row = await prisma.credential.findUnique({ where: { id: req.params.id } });
  if (!row) throw NotFound('Credential tidak ditemukan');
  res.json({ success: true, data: row });
});

credentialRouter.post('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = createCredentialSchema.parse(req.body);
  const created = await prisma.credential.create({
    data: { ...input, createdByUserId: req.user.sub },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'credential',
    resourceId: created.id,
    resourceLabel: created.nama,
    // PENTING: jangan log full after — content sensitive. Cuma nama + id.
    metadata: { kind: 'credential-create' },
  });
  res.status(201).json({ success: true, data: created });
});

credentialRouter.patch('/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const id = req.params.id;
  if (!id) throw BadRequest('Path param :id wajib.');
  const input = updateCredentialSchema.parse(req.body);
  const before = await prisma.credential.findUnique({ where: { id } });
  if (!before) throw NotFound('Credential tidak ditemukan');

  const data: any = {};
  for (const k of [
    'nama',
    'email',
    'username',
    'noHpTerdaftar',
    'linkAkses',
    'recoveryEmail',
    'catatan',
  ] as const) {
    if (input[k] !== undefined) data[k] = input[k];
  }
  if (Object.keys(data).length === 0) {
    throw BadRequest('Tidak ada field yang diubah.');
  }

  const updated = await prisma.credential.update({ where: { id }, data });
  audit(req, {
    action: 'UPDATE',
    resource: 'credential',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    // Sensitive: hanya log keys yg berubah, bukan value-nya.
    metadata: {
      kind: 'credential-update',
      changedKeys: Object.keys(data),
    },
  });
  res.json({ success: true, data: updated });
});

credentialRouter.delete('/:id', async (req, res) => {
  const id = req.params.id;
  if (!id) throw BadRequest('Path param :id wajib.');
  const before = await prisma.credential.findUnique({ where: { id } });
  if (!before) throw NotFound('Credential tidak ditemukan');
  await prisma.credential.delete({ where: { id } });
  audit(req, {
    action: 'DELETE',
    resource: 'credential',
    resourceId: before.id,
    resourceLabel: before.nama,
    metadata: { kind: 'credential-delete' },
  });
  res.status(204).end();
});
