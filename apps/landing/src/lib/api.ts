/**
 * API helper untuk landing site — fetch dari backend ECC.
 *
 * Pakai Next.js fetch dengan `revalidate` untuk SSR cache.
 * Default revalidate 600 detik (10 menit) — balance freshness + cache.
 *
 * Server component only — call ini DI server component / route handler.
 * Tidak di-export ke client (no useState, no React Query — pure SSR).
 */

const API_BASE =
  process.env.NEXT_PUBLIC_CORE_API_URL ?? 'https://api.eccchurch.global';

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
