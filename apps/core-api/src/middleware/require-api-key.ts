import type { RequestHandler } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '@ecc/database';
import { Unauthorized } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: { id: string; sinodeId: string; scopes: string[] };
    }
  }
}

/**
 * Verifikasi API key untuk public/consumer endpoints (/api/v1).
 * Header: `X-API-Key: ecc_<prefix>_<secret>`
 *
 * Format key: `ecc_<prefix>_<random>` — prefix dipakai untuk lookup cepat
 * sebelum bcrypt compare ke seluruh secret.
 */
export const requireApiKey: RequestHandler = async (req, _res, next) => {
  const raw = req.header('X-API-Key');
  if (!raw) throw Unauthorized('X-API-Key header tidak ada');

  const parts = raw.split('_');
  if (parts.length < 3 || parts[0] !== 'ecc') throw Unauthorized('Format API key tidak valid');

  const prefix = parts[1];
  const candidates = await prisma.sinodeApiKey.findMany({
    where: { keyPrefix: prefix, isActive: true },
  });

  for (const candidate of candidates) {
    const matched = await bcrypt.compare(raw, candidate.keyHash);
    if (!matched) continue;
    if (candidate.expiresAt && candidate.expiresAt < new Date()) continue;
    // TODO(global-keys): schema SinodeApiKey.sinodeId nullable utk "global key"
    // (lihat schema comment). Saat ini consumer endpoints di /api/v1/* scope ke
    // sinodeId — perlu refactor untuk support global access. Sementara skip
    // null-sinode candidates supaya type Request.apiKey tetap sinodeId: string.
    if (!candidate.sinodeId) continue;

    await prisma.sinodeApiKey.update({
      where: { id: candidate.id },
      data: { lastUsedAt: new Date() },
    });
    req.apiKey = {
      id: candidate.id,
      sinodeId: candidate.sinodeId,
      scopes: candidate.scopes,
    };
    next();
    return;
  }
  throw Unauthorized('API key tidak dikenali');
};
