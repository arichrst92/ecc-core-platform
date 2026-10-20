/**
 * ECC Worship — penyimpanan & akses media.
 *
 *   Audio  → {WORSHIP_DIR}/{songId}-{vokal|karaoke}-{ts}.{mp3|m4a}  (PRIVAT)
 *   Cover  → {UPLOADS_DIR}/content/worship/cover/{albumId}.webp       (publik, untuk OG)
 *
 * Audio diputar lewat URL bertanda tangan (HMAC) berumur pendek:
 *   GET /worship-media/{songId}/{mode}?exp=…&sig=…
 * Di production Nginx yang mengirim file (X-Accel-Redirect ke lokasi internal
 * `/_worship_files/`) kalau WORSHIP_X_ACCEL=1; selain itu Express sendFile
 * (mendukung Range/seek).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import multer from 'multer';
import sharp from 'sharp';
import type { RequestHandler } from 'express';
import { WORSHIP_AUDIO_MAX_BYTES, type WorshipMode } from '@ecc/shared-types';
import { BadRequest } from './errors.js';
import { PUBLIC_UPLOADS_PREFIX, UPLOADS_DIR, ensureDir } from './storage.js';

const execFileP = promisify(execFile);

export const WORSHIP_DIR = path.resolve(process.env.WORSHIP_DIR ?? './private/worship');
const SECRET = process.env.WORSHIP_MEDIA_SECRET ?? process.env.JWT_SECRET ?? 'dev-worship-secret';
/** Umur URL putar (detik). */
export const PLAY_URL_TTL_SEC = 6 * 60 * 60;

const AUDIO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'm4a',
};

function audioExt(mime: string, name: string): string | null {
  const byMime = AUDIO_EXT[mime.toLowerCase()];
  if (byMime) return byMime;
  const ext = path.extname(name).toLowerCase().replace('.', '');
  return ext === 'mp3' || ext === 'm4a' ? ext : null;
}

/** Multer untuk upload audio (field bebas, 1 file, ≤ 10 MB, MP3/M4A). */
export function audioUpload(): RequestHandler {
  const m = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: WORSHIP_AUDIO_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!audioExt(file.mimetype, file.originalname)) return cb(new Error('Format audio harus MP3 atau M4A.'));
      cb(null, true);
    },
  }).any();
  return (req, res, next) =>
    m(req, res, (err: unknown) => {
      if (!err) {
        const files = (req as unknown as { files?: Express.Multer.File[] }).files;
        if (files?.[0]) (req as unknown as { file?: Express.Multer.File }).file = files[0];
        return next();
      }
      const e = err as { code?: string; message?: string };
      if (e.code === 'LIMIT_FILE_SIZE') return next(BadRequest('File audio maksimal 10 MB.'));
      return next(BadRequest(e.message ?? 'Upload audio gagal.'));
    });
}

/** Durasi audio (detik) via ffprobe. Null kalau ffprobe tidak tersedia. */
export async function probeDuration(absPath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileP(process.env.FFPROBE_BIN ?? 'ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      absPath,
    ]);
    const d = Number(stdout.trim());
    return Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : null;
  } catch {
    return null;
  }
}

export async function saveWorshipAudio(songId: string, mode: WorshipMode, file: Express.Multer.File) {
  const ext = audioExt(file.mimetype, file.originalname);
  if (!ext) throw BadRequest('Format audio harus MP3 atau M4A.');
  await ensureDir(WORSHIP_DIR);
  const name = `${songId}-${mode.toLowerCase()}-${Date.now()}.${ext}`;
  const abs = path.join(WORSHIP_DIR, name);
  await fs.writeFile(abs, file.buffer);
  const durasi = await probeDuration(abs);
  return { file: name, mime: ext === 'mp3' ? 'audio/mpeg' : 'audio/mp4', size: file.size, durasi };
}

export async function deleteWorshipFile(name: string | null | undefined) {
  if (!name) return;
  await fs.unlink(path.join(WORSHIP_DIR, path.basename(name))).catch(() => {});
}

export function worshipFilePath(name: string) {
  return path.join(WORSHIP_DIR, path.basename(name));
}

// ---- URL bertanda tangan ----
function sig(songId: string, mode: string, exp: number) {
  return crypto.createHmac('sha256', SECRET).update(`${songId}:${mode}:${exp}`).digest('base64url');
}

export function signedMediaPath(songId: string, mode: WorshipMode, ttlSec = PLAY_URL_TTL_SEC) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return { path: `/worship-media/${songId}/${mode}?exp=${exp}&sig=${sig(songId, mode, exp)}`, expiresAt: new Date(exp * 1000) };
}

export function verifyMediaSig(songId: string, mode: string, exp: string, signature: string): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(sig(songId, mode, e));
  const got = Buffer.from(String(signature));
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// ---- Cover ----
export async function saveWorshipCover(albumId: string, buffer: Buffer): Promise<string> {
  const dir = path.join(UPLOADS_DIR, 'content', 'worship', 'cover');
  await ensureDir(dir);
  const filename = `${albumId}.webp`;
  // Portal sudah crop 1:1; server memastikan persegi 1000×1000.
  await sharp(buffer).rotate().resize(1000, 1000, { fit: 'cover' }).webp({ quality: 85 }).toFile(path.join(dir, filename));
  return `${PUBLIC_UPLOADS_PREFIX}/content/worship/cover/${filename}?v=${Date.now()}`;
}

export async function deleteWorshipCover(albumId: string) {
  await fs.unlink(path.join(UPLOADS_DIR, 'content', 'worship', 'cover', `${albumId}.webp`)).catch(() => {});
}
