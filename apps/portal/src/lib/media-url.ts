/**
 * Resolve media URL — prefix NEXT_PUBLIC_CORE_API_URL untuk relative path
 * `/uploads/...` yang di-serve oleh core-api (bukan Next.js public folder).
 *
 * Portal di-host di portal.eccchurch.global, tapi foto uploads di-serve dari
 * api.eccchurch.global/uploads/*. Kalau pakai raw `/uploads/xxx.webp` di
 * `<img src>`, browser resolve ke portal domain → 404.
 *
 * Behavior:
 * - Absolute URL (http/https/data:) → return as-is
 * - Path relative dimulai `/uploads/` → prefix apiBase
 * - Path lain → return as-is (asumsi valid untuk context caller)
 * - null/undefined → return empty string
 */
export function resolveMediaUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  if (path.startsWith('/uploads/')) {
    const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
    return `${apiBase}${path}`;
  }
  return path;
}
