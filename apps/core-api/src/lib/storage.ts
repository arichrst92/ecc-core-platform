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
export type ContentKind = 'news' | 'renungan' | 'event';

const MAX_DIM_PROFILE = 1024;
const MAX_DIM_HERO = 1600; // hero image lebih besar untuk display utama di mobile
const MAX_DIM_BUKTI = 2000; // bukti transfer perlu cukup tajam untuk verifikasi
const MAX_DIM_LOGO = 512;  // logo square — cukup tajam utk display medium tanpa overkill
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

// =====================================================
//  Hadiah katalog photo (Modul 28)
// =====================================================
//
// Layout: /uploads/hadiah/{hadiahId}.webp
// Resize max 800px (square-ish di grid, cukup HD kalau di-zoom).

export async function saveHadiahPhoto(hadiahId: string, buffer: Buffer): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'hadiah');
  await ensureDir(dir);
  const filename = `${hadiahId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/hadiah/${filename}?v=${v}`;
}

export async function deleteHadiahPhoto(hadiahId: string): Promise<void> {
  const absPath = path.join(UPLOADS_DIR, 'hadiah', `${hadiahId}.webp`);
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

// =====================================================
//  Event-spesifik: QRIS image (per event) + bukti transfer (per partisipasi)
// =====================================================
//
// Layout tambahan:
//   content/event/qris/{event-uuid}.webp
//   content/event/bukti/{participation-uuid}.webp

export async function saveEventQris(eventId: string, buffer: Buffer): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'event', 'qris');
  await ensureDir(dir);
  const filename = `${eventId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIM_HERO, height: MAX_DIM_HERO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/content/event/qris/${filename}?v=${v}`;
}

export async function deleteEventQris(eventId: string): Promise<void> {
  const absPath = path.join(UPLOADS_DIR, 'content', 'event', 'qris', `${eventId}.webp`);
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function saveEventBuktiTransfer(
  participationId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'event', 'bukti');
  await ensureDir(dir);
  const filename = `${participationId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIM_BUKTI, height: MAX_DIM_BUKTI, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/content/event/bukti/${filename}?v=${v}`;
}

export async function deleteEventBuktiTransfer(participationId: string): Promise<void> {
  const absPath = path.join(
    UPLOADS_DIR,
    'content',
    'event',
    'bukti',
    `${participationId}.webp`,
  );
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

// =====================================================
//  Event Donation bukti — per-donation file (multi-donation support)
// =====================================================
//
// Layout: content/event/donation-bukti/{donationId}.webp
//
// Berbeda dengan saveEventBuktiTransfer (1 file per participationId), donation
// bukti pakai donationId — setiap donation row punya bukti sendiri. Diperlukan
// untuk multi-donation flow (event fundraising) per patch 2026-05-21l.

export async function saveEventDonationBukti(
  donationId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'event', 'donation-bukti');
  await ensureDir(dir);
  const filename = `${donationId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIM_BUKTI, height: MAX_DIM_BUKTI, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/content/event/donation-bukti/${filename}?v=${v}`;
}

export async function deleteEventDonationBukti(donationId: string): Promise<void> {
  const absPath = path.join(
    UPLOADS_DIR,
    'content',
    'event',
    'donation-bukti',
    `${donationId}.webp`,
  );
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

// =====================================================
//  Cabang rekening QRIS (per rekening, multi per cabang)
// =====================================================
//
// Layout: content/cabang/qris/{rekening-uuid}.webp

export async function saveCabangRekeningQris(
  rekeningId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'cabang', 'qris');
  await ensureDir(dir);
  const filename = `${rekeningId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIM_HERO, height: MAX_DIM_HERO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/content/cabang/qris/${filename}?v=${v}`;
}

export async function deleteCabangRekeningQris(rekeningId: string): Promise<void> {
  const absPath = path.join(UPLOADS_DIR, 'content', 'cabang', 'qris', `${rekeningId}.webp`);
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

// =====================================================
//  Local Business — hero image (webp) + company profile (PDF passthrough)
// =====================================================
//
// Layout:
//   content/local-business/hero/{business-uuid}.webp
//   content/local-business/profile/{business-uuid}.pdf
//
// Hero image follow standard hero treatment (resize + webp). Profile PDF
// disimpan apa adanya (passthrough; PDF tidak di-resize, hanya dicek size
// di multer).

export async function saveBusinessHero(businessId: string, buffer: Buffer): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'local-business', 'hero');
  await ensureDir(dir);
  const filename = `${businessId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()
    .resize({ width: MAX_DIM_HERO, height: MAX_DIM_HERO, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/content/local-business/hero/${filename}?v=${v}`;
}

export async function deleteBusinessHero(businessId: string): Promise<void> {
  const absPath = path.join(UPLOADS_DIR, 'content', 'local-business', 'hero', `${businessId}.webp`);
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Logo bisnis — force square via sharp fit:'cover'. Source image bebas
 * aspect ratio, di-crop center jadi square 512x512.
 */
export async function saveBusinessLogo(businessId: string, buffer: Buffer): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'local-business', 'logo');
  await ensureDir(dir);
  const filename = `${businessId}.webp`;
  const absPath = path.join(dir, filename);

  await sharp(buffer)
    .rotate()
    .resize({
      width: MAX_DIM_LOGO,
      height: MAX_DIM_LOGO,
      fit: 'cover',           // crop ke square (bukan letterbox)
      position: 'centre',
      withoutEnlargement: false,
    })
    .webp({ quality: QUALITY })
    .toFile(absPath);

  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/content/local-business/logo/${filename}?v=${v}`;
}

export async function deleteBusinessLogo(businessId: string): Promise<void> {
  const absPath = path.join(UPLOADS_DIR, 'content', 'local-business', 'logo', `${businessId}.webp`);
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function saveBusinessProfilePdf(
  businessId: string,
  buffer: Buffer,
): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'local-business', 'profile');
  await ensureDir(dir);
  const filename = `${businessId}.pdf`;
  const absPath = path.join(dir, filename);
  // PDF passthrough — tidak ada konversi.
  await fs.writeFile(absPath, buffer);
  const v = Date.now();
  return `${PUBLIC_UPLOADS_PREFIX}/content/local-business/profile/${filename}?v=${v}`;
}

export async function deleteBusinessProfilePdf(businessId: string): Promise<void> {
  const absPath = path.join(
    UPLOADS_DIR,
    'content',
    'local-business',
    'profile',
    `${businessId}.pdf`,
  );
  try {
    await fs.unlink(absPath);
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err;
  }
}
