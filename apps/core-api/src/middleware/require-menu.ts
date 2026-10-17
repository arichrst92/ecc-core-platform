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
