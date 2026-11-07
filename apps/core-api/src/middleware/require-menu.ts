/**
 * Gate akses per menu portal (RBAC Role Access).
 *
 *   router.use(requireMenu('diagnostics'))           → minimal canRead
 *   router.patch(..., requireMenu('diagnostics', 'write'), handler)
 *
 * Fulltimer selalu lolos. Selain itu wajib punya akses menu tsb di Role
 * Access (role / sub role). Mencegah jemaat biasa (token app mobile) memanggil
 * endpoint admin yang hanya disembunyikan di UI portal.
 */
import type { RequestHandler } from 'express';
import { Forbidden, Unauthorized } from '../lib/errors.js';
import { resolveJemaatAccess } from '../lib/menu-access.js';

export function requireMenu(menuKey: string, level: 'read' | 'write' | 'delete' = 'read'): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw Unauthorized();
    if (req.user.isFulltimer) return next();
    resolveJemaatAccess(req.user.jemaatId)
      .then((access) => {
        const m = access.menuAccess[menuKey];
        const ok = level === 'read' ? m?.canRead : level === 'write' ? m?.canWrite : m?.canDelete;
        if (!ok) return next(Forbidden(`Anda tidak punya akses ke menu ini (${menuKey}).`));
        next();
      })
      .catch(next);
  };
}

/** Cek akses menu tanpa melempar (Fulltimer selalu true). */
export async function hasMenuAccessFor(
  user: { jemaatId: string; isFulltimer?: boolean } | undefined,
  menuKey: string,
  level: 'read' | 'write' | 'delete' = 'read',
): Promise<boolean> {
  if (!user) return false;
  if (user.isFulltimer) return true;
  const access = await resolveJemaatAccess(user.jemaatId);
  const m = access.menuAccess[menuKey];
  return !!(level === 'read' ? m?.canRead : level === 'write' ? m?.canWrite : m?.canDelete);
}

/** Versi await dari requireMenu — lempar 403 bila tidak punya akses menu. */
export async function requireMenuP(
  req: { user?: { jemaatId: string; isFulltimer?: boolean } },
  menuKey: string,
  level: 'read' | 'write' | 'delete' = 'read',
): Promise<void> {
  if (!req.user) throw Unauthorized();
  if (!(await hasMenuAccessFor(req.user, menuKey, level))) {
    throw Forbidden(`Anda tidak punya akses ke menu ini (${menuKey}).`);
  }
}

/** Lolos bila punya akses ke SALAH SATU menu (endpoint yang dipakai beberapa halaman Portal). */
export async function requireAnyMenuP(
  req: { user?: { jemaatId: string; isFulltimer?: boolean } },
  menuKeys: string[],
  level: 'read' | 'write' | 'delete' = 'read',
): Promise<void> {
  if (!req.user) throw Unauthorized();
  for (const k of menuKeys) if (await hasMenuAccessFor(req.user, k, level)) return;
  throw Forbidden(`Anda tidak punya akses ke menu ini (${menuKeys.join(' / ')}).`);
}
