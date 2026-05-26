/**
 * API helper untuk landing site — fetch dari backend ECC.
 *
 * Pakai Next.js fetch dengan `revalidate` untuk SSR cache.
 * Default revalidate 600 detik (10 menit) — balance freshness + cache.
 *
 * Server component only — call ini DI server component / route handler.
 * Tidak di-export ke client (no useState, no React Query — pure SSR).
 *
 * ENV:
 *   NEXT_PUBLIC_CORE_API_URL — base URL backend.
 *     - Local dev: http://localhost:4100 (set di apps/landing/.env.local)
 *     - VPS prod:  https://api.eccchurch.global (default fallback)
 *
 * NEXT_PUBLIC_* harus di-bake saat `next build`. Jadi build dev pakai
 * env dev, build prod pakai env prod. Untuk dev, .env.local di apps/landing/
 * adalah sumber kebenarannya — bukan root .env (Next.js gak baca itu).
 */

const API_BASE =
  process.env.NEXT_PUBLIC_CORE_API_URL ?? 'https://api.eccchurch.global';

// Log API base sekali saat boot supaya jelas landing pointing ke mana.
// Cuma di server-side (process.env.NODE_ENV ada di server) supaya bersih.
if (typeof window === 'undefined') {
  // eslint-disable-next-line no-console
  console.info(
    `[landing] API_BASE = ${API_BASE} (set NEXT_PUBLIC_CORE_API_URL di apps/landing/.env.local untuk override)`,
  );
}

interface FetchOptions {
  /** Revalidate cache (detik). Default 600 (10 menit). */
  revalidate?: number;
  /** Tags untuk on-demand revalidation. */
  tags?: string[];
}

export async function apiGet<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T | null> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      next: {
        revalidate: options.revalidate ?? 600,
        tags: options.tags,
      },
    });
    if (!res.ok) {
      console.error(`[api] ${res.status} ${url}`);
      return null;
    }
    const json = (await res.json()) as { success: boolean; data: T };
    return json.data ?? null;
  } catch (err) {
    console.error(`[api] fetch failed ${url}:`, err);
    return null;
  }
}

/** Helper untuk transform relative path /uploads/... ke absolute URL. */
export function absoluteUrl(maybeRelative: string | null | undefined): string | null {
  if (!maybeRelative) return null;
  if (maybeRelative.startsWith('http://') || maybeRelative.startsWith('https://')) {
    return maybeRelative;
  }
  // Strip query string supaya cache-busting tetap consistent untuk satu file
  const cleanBase = API_BASE.replace(/\/$/, '');
  const cleanPath = maybeRelative.startsWith('/') ? maybeRelative : `/${maybeRelative}`;
  return `${cleanBase}${cleanPath}`;
}
