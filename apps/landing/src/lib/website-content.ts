/**
 * Website Content fetcher — load CMS content dari /public/website-content
 * dengan graceful fallback ke hard-coded defaults.
 *
 * Server component only (Next.js fetch with revalidate). Tidak di-export
 * ke client. Setiap page server-render call `getWebsiteContent()` lalu
 * gunakan helper `getSection(key, fallback)`.
 */
import { apiGet } from './api';

interface RawSection {
  contentType: 'markdown' | 'json';
  content: string;
}

export type WebsiteContentMap = Record<string, RawSection>;

let cachedMap: WebsiteContentMap | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000; // 1 menit in-memory (extra cache on top of Next.js fetch cache)

export async function getWebsiteContent(): Promise<WebsiteContentMap> {
  if (cachedMap && Date.now() - cachedAt < CACHE_TTL_MS) return cachedMap;
  const data = await apiGet<WebsiteContentMap>('/public/website-content', {
    revalidate: 600,
  });
  cachedMap = data ?? {};
  cachedAt = Date.now();
  return cachedMap;
}

/**
 * Get section content sebagai string (untuk markdown body).
 * Return fallback kalau key tidak ada di store atau API down.
 */
export function getMarkdown(
  map: WebsiteContentMap,
  key: string,
  fallback: string,
): string {
  const s = map[key];
  if (!s) return fallback;
  return s.content || fallback;
}

/**
 * Get section content parsed sebagai JSON.
 * Return fallback kalau key tidak ada, JSON invalid, atau type mismatch.
 */
export function getJson<T>(
  map: WebsiteContentMap,
  key: string,
  fallback: T,
): T {
  const s = map[key];
  if (!s || s.contentType !== 'json') return fallback;
  try {
    return JSON.parse(s.content) as T;
  } catch {
    return fallback;
  }
}
