import type { Request, RequestHandler } from 'express';
import { extractBearerToken, verifyAccessToken } from '@ecc/auth';
import type { JwtPayload } from '@ecc/shared-types';
import { Forbidden, Unauthorized } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/** Wajib login (JWT valid). Untuk semua endpoint yang butuh auth. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) throw Unauthorized('Token tidak ditemukan');
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    throw Unauthorized('Token tidak valid atau kadaluarsa');
  }
};

/** Wajib role Fulltimer. Dipakai oleh /admin/* endpoints. */
export const requireFulltimer: RequestHandler = (req: Request, _res, next) => {
  if (!req.user) throw Unauthorized();
  if (!req.user.isFulltimer) {
    throw Forbidden('Hanya Fulltimer yang boleh akses endpoint ini');
  }
  next();
};
