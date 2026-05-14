/**
 * Local filesystem storage untuk foto profil.
 *
 * Layout di VPS:
 *   {UPLOADS_DIR}/
 *     profiles/
 *       jemaat/{jemaat-uuid}.webp
 *       user/{user-uuid}.webp
 *
 * Default `UPLOADS_DIR` = `./uploads` (relatif terhadap apps/core-api).
 * Untuk production, set ke path persisten di VPS, mis. `/var/lib/ecc/uploads`.
 *
 * File di-serve via static route `/uploads/*` (lihat app.ts).
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';

export const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
export const PUBLIC_UPLOADS_PREFIX = '/uploads';

export type ProfileKind = 'jemaat' | 'user';

const MAX_DIM = 1024;
const QUALITY = 82;

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Simpan buffer foto sebagai WebP optimized di filesystem.
 * Return relative URL path (untuk disimpan di DB).
 */
export async function saveProfilePhoto(
  kind: ProfileKind,
  ownerId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'profiles', kind);
  await ensureDir(dir);

  const filename = `${ownerId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()                                      // auto-orient via EXIF
    .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  // Versioning via mtime query string supaya cache invalidates saat update
  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/profiles/${kind}/${filename}?v=${v}`;
}

export async function deleteProfilePhoto(kind: ProfileKind, ownerId: string): Promise<void> {
  const absPath = path.join(UPLOADS_DIR, 'profiles', kind, `${ownerId}.webp`);
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}
