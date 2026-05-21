/**
 * Admin routes untuk kelola SinodeApiKey.
 *
 * Key plaintext HANYA di-return sekali saat POST create. Setelah itu DB
 * hanya simpan prefix + bcrypt hash; tidak bisa direveal lagi.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createApiKeySchema,
  updateApiKeySchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { generateApiKey } from '../../lib/api-key.js';

export const apiKeyRouter = Router();

// List API keys. Optional filter ?sinodeId=
apiKeyRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;
  const where: any = {};
  if (sinodeId) where.sinodeId = sinodeId;
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };

  const [rows, total] = await Promise.all([
    prisma.sinodeApiKey.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { createdAt: 'desc' },
      include: { sinode: { select: { id: true, nama: true, kode: true } } },
      // Jangan return keyHash (sensitive). select implicit (keyPrefix ok).
    }),
    prisma.sinodeApiKey.count({ where }),
  ]);

  // Hapus keyHash dari response (just in case).
  const data = rows.map((row) => {
    const { keyHash: _keyHash, ...rest } = row;
    void _keyHash;
    return rest;
  });
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// Create new API key.
// Return: row + `key` plaintext (sekali saja).
// sinodeId optional — kalau tidak diisi, key bersifat GLOBAL.
apiKeyRouter.post('/', async (req, res) => {
  const input = createApiKeySchema.parse(req.body);

  // Kalau sinodeId diisi, validate exist.
  if (input.sinodeId) {
    const sinode = await prisma.sinode.findUnique({ where: { id: input.sinodeId } });
    if (!sinode) throw NotFound('Sinode tidak ditemukan');
  }

  const { key, prefix, hash } = await generateApiKey();
  // Prisma type masih `string` (NOT NULL) sampai client di-regenerate via
  // `prisma migrate dev` di local. Pakai any cast supaya code valid sekarang
  // tanpa block runtime. Setelah migrate, `sinodeId: string | null` legit.
  const createData: any = {
    nama: input.nama,
    keyHash: hash,
    keyPrefix: prefix,
    scopes: input.scopes ?? [],
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    sinodeId: input.sinodeId ?? null,
  };
  const created = await prisma.sinodeApiKey.create({
    data: createData,
    include: { sinode: { select: { id: true, nama: true, kode: true } } },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'sinode_api_key',
    resourceId: created.id,
    resourceLabel: `${(created as any).sinode?.nama ?? 'Global'} · ${created.nama} (${created.keyPrefix})`,
    after: { ...created, keyHash: '[redacted]' },
  });

  // ⚠ Plaintext key hanya di-return di response ini.
  const { keyHash: _keyHash, ...safe } = created;
  void _keyHash;
  res.status(201).json({
    success: true,
    data: { ...safe, key },
    meta: {
      warning:
        'Simpan key di tempat aman. Setelah modal ditutup, key tidak bisa direveal lagi.',
    },
  });
});

// Update nama / scopes / expiresAt / isActive
apiKeyRouter.patch('/:id', async (req, res) => {
  const before = await prisma.sinodeApiKey.findUnique({
    where: { id: req.params.id },
    include: { sinode: { select: { nama: true } } },
  });
  if (!before) throw NotFound('API key tidak ditemukan');
  const input = updateApiKeySchema.parse(req.body);

  const updated = await prisma.sinodeApiKey.update({
    where: { id: before.id },
    data: {
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'sinode_api_key',
    resourceId: updated.id,
    resourceLabel: `${before.sinode?.nama ?? 'Global'} · ${updated.nama}`,
    before: { ...before, keyHash: '[redacted]' },
    after: { ...updated, keyHash: '[redacted]' },
  });
  const { keyHash: _h, ...safe } = updated;
  void _h;
  res.json({ success: true, data: safe });
});

// Revoke / hapus permanent
apiKeyRouter.delete('/:id', async (req, res) => {
  const before = await prisma.sinodeApiKey.findUnique({
    where: { id: req.params.id },
    include: { sinode: { select: { nama: true } } },
  });
  if (!before) throw NotFound('API key tidak ditemukan');
  await prisma.sinodeApiKey.delete({ where: { id: before.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'sinode_api_key',
    resourceId: before.id,
    resourceLabel: `${before.sinode?.nama ?? 'Global'} · ${before.nama} (${before.keyPrefix})`,
    before: { ...before, keyHash: '[redacted]' },
  });
  res.status(204).end();
});
