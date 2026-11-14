import type { Request, RequestHandler } from 'express';
import { extractBearerToken, verifyAccessToken } from '@ecc/auth';
import type { JwtPayload } from '@ecc/shared-types';
import { Forbidden, Unauthorized } from '../lib/errors.js';
import { isPersonalToken, verifyPersonalToken, type PatContext } from '../lib/personal-token.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
      /** Diisi bila request memakai token API pribadi (bukan login biasa). */
      pat?: PatContext;
    }
  }
}

/**
 * Wajib login. Menerima:
 *   - JWT access token (login Portal / app), atau
 *   - token API pribadi `ecc_pat_…` (Developer Tools → API Access) — untuk
 *     otomasi / agentic AI; bertindak atas nama pemiliknya.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) throw Unauthorized('Token tidak ditemukan');
  if (isPersonalToken(token)) {
    verifyPersonalToken(token, req.ip)
      .then((r) => {
        if (!r) return next(Unauthorized('Token API tidak valid, sudah dicabut/kedaluwarsa, atau Anda tidak lagi berhak memakai API.'));
        req.user = r.user;
        req.pat = r.pat;
        next();
      })
      .catch(next);
    return;
  }
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
