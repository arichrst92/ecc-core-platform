import type { Request } from 'express';

/**
 * App mobile (Els App) mengirim header `X-Client: mobile`. Dipakai untuk
 * aturan yang berbeda antara app jemaat dan portal admin, mis. bypass
 * fulltimer hanya berlaku di portal.
 */
export function isMobileClient(req: Request): boolean {
  return (req.get('x-client') ?? '').toLowerCase() === 'mobile';
}
