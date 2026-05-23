/**
 * Master Access middleware untuk Credential vault.
 *
 * Verify header `X-Credential-Master` vs env `CREDENTIAL_MASTER_PASSWORD`.
 * Throw 401 dengan code MASTER_ACCESS_REQUIRED kalau tidak match.
 *
 * Extra layer di atas requireAuth (JWT) — jadi user harus:
 *   1. Login portal (JWT valid) — handled di adminRouter.use('/', requireAuth)
 *   2. Pass master password via header — handled di sini
 *
 * Master password disimpan di .env, di-rotate via redeploy. Tidak ada UI
 * untuk ganti dari portal (sengaja — high-trust gate).
 */
import type { RequestHandler } from 'express';
import { ApiError } from '../lib/errors.js';

export const requireMasterAccess: RequestHandler = (req, _res, next) => {
  const expected = process.env.CREDENTIAL_MASTER_PASSWORD ?? '';
  if (!expected || expected.length < 8) {
    throw new ApiError(
      503,
      'MASTER_ACCESS_NOT_CONFIGURED',
      'CREDENTIAL_MASTER_PASSWORD belum di-set di server .env. Hubungi devops.',
    );
  }
  const provided = req.header('X-Credential-Master') ?? '';
  // Timing-safe-ish compare (Node tidak bisa true constant-time tanpa crypto)
  if (provided.length !== expected.length || provided !== expected) {
    throw new ApiError(
      401,
      'MASTER_ACCESS_REQUIRED',
      'Master password salah atau tidak disertakan.',
    );
  }
  next();
};
