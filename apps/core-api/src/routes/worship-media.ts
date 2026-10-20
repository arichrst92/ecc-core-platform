/**
 * Streaming audio ECC Worship — GET /worship-media/:songId/:mode?exp&sig
 * Tanpa JWT (dipakai <audio>/player native & unduhan) — akses dijaga tanda
 * tangan HMAC berumur pendek yang hanya dibagikan ke user login.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { NotFound, Forbidden } from '../lib/errors.js';
import { verifyMediaSig, worshipFilePath } from '../lib/worship-media.js';

export const worshipMediaRouter = Router();

worshipMediaRouter.get('/:songId/:mode', async (req, res) => {
  const { songId, mode } = req.params;
  if (mode !== 'VOKAL' && mode !== 'KARAOKE') throw NotFound('Media tidak ditemukan');
  if (!verifyMediaSig(songId, mode, String(req.query.exp ?? ''), String(req.query.sig ?? ''))) {
    throw Forbidden('Link putar kedaluwarsa. Buka ulang dari Els App.');
  }
  const song = await prisma.worshipSong.findUnique({
    where: { id: songId },
    select: { audioFile: true, audioMime: true, karaokeFile: true, karaokeMime: true },
  });
  const file = mode === 'VOKAL' ? song?.audioFile : song?.karaokeFile;
  const mime = (mode === 'VOKAL' ? song?.audioMime : song?.karaokeMime) ?? 'audio/mpeg';
  if (!file) throw NotFound('Media tidak ditemukan');

  res.setHeader('Cache-Control', 'private, max-age=21600');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (process.env.WORSHIP_X_ACCEL === '1') {
    // Nginx: location /_worship_files/ { internal; alias <WORSHIP_DIR>/; }
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Accel-Redirect', `/_worship_files/${encodeURIComponent(file)}`);
    res.end();
    return;
  }
  res.type(mime);
  res.sendFile(worshipFilePath(file), { acceptRanges: true });
});
