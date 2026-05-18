/**
 * Local filesystem storage untuk foto profil & hero image konten.
 *
 * Layout di VPS:
 *   {UPLOADS_DIR}/
 *     profiles/
 *       jemaat/{jemaat-uuid}.webp
 *       user/{user-uuid}.webp
 *     content/
 *       hero/
 *         news/{konten-uuid}.webp
 *         renungan/{konten-uuid}.webp
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
export type ContentKind = 'news' | 'renungan';

const MAX_DIM_PROFILE = 1024;
const MAX_DIM_HERO = 1600; // hero image lebih besar untuk display utama di mobile
const QUALITY = 82;

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

// =====================================================
//  Foto profil (jemaat & user avatar)
// =====================================================

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
    .rotate()
    .resize({ width: MAX_DIM_PROFILE, height: MAX_DIM_PROFILE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

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

// =====================================================
//  Hero image konten (news & renungan)
// =====================================================

/**
 * Simpan hero image konten ke /content/hero/{kind}/{kontenId}.webp
 * Resize max 1600px (untuk hero display di mobile + web tetap tajam).
 */
export async function saveContentHero(
  kind: ContentKind,
  kontenId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'hero', kind);
  await ensureDir(dir);
  const filename = `${kontenId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIM_HERO, height: MAX_DIM_HERO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/content/hero/${kind}/${filename}?v=${v}`;
}

export async function deleteContentHero(kind: ContentKind, kontenId: string): Promise<void> {
  const absPath = path.join(UPLOADS_DIR, 'content', 'hero', kind, `${kontenId}.webp`);
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}
