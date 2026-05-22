/**
 * App Version — update check untuk mobile.
 *
 * Public: GET /public/app-version?platform=ios|android&currentVersion=1.0.0
 * Admin CRUD: /admin/app-version (1 row aktif per platform).
 */
import { z } from 'zod';
import { emptyToUndefined } from './common.js';

export const platformSchema = z.enum(['IOS', 'ANDROID']);
export type Platform = z.infer<typeof platformSchema>;

/** Semver pattern simple: 1.2.3 (tidak support pre-release tag/build). */
const semverRegex = /^\d+\.\d+\.\d+$/;

export const upsertAppVersionSchema = z.object({
  platform: platformSchema,
  latestVersion: z.string().trim().regex(semverRegex, 'Format harus semver MAJOR.MINOR.PATCH (mis. 1.2.0)'),
  minSupportedVersion: z.string().trim().regex(semverRegex, 'Format harus semver MAJOR.MINOR.PATCH'),
  releaseNotes: emptyToUndefined(z.string().trim().max(5000)),
  downloadUrl: z.string().trim().url().max(500),
  isPublished: z.boolean().default(false),
});
export type UpsertAppVersionInput = z.infer<typeof upsertAppVersionSchema>;

/** Query untuk public check endpoint. */
export const checkAppVersionQuerySchema = z.object({
  platform: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.enum(['ios', 'android']))
    .transform((v) => v.toUpperCase() as Platform),
  /** Versi yang terinstall di mobile. Optional — kalau kosong server return latest. */
  currentVersion: emptyToUndefined(z.string().trim().regex(semverRegex)),
});
export type CheckAppVersionQuery = z.infer<typeof checkAppVersionQuerySchema>;

/**
 * Compare 2 semver strings. Return:
 *   -1 jika a < b
 *    0 jika a === b
 *    1 jika a > b
 * Format harus valid semver (sudah di-validate via Zod).
 */
export function compareSemver(a: string, b: string): number {
  const parse = (s: string) => s.split('.').map((n) => Number.parseInt(n, 10));
  const [a1, a2, a3] = parse(a) as [number, number, number];
  const [b1, b2, b3] = parse(b) as [number, number, number];
  if (a1 !== b1) return a1 < b1 ? -1 : 1;
  if (a2 !== b2) return a2 < b2 ? -1 : 1;
  if (a3 !== b3) return a3 < b3 ? -1 : 1;
  return 0;
}
