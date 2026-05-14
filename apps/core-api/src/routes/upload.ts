import { Router } from 'express';
import multer from 'multer';
import { prisma } from '@ecc/database';
import { requireAuth } from '../middleware/require-auth.js';
import { saveProfilePhoto, deleteProfilePhoto } from '../lib/storage.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';

/**
 * Endpoint upload foto profil.
 *
 * - POST /upload/jemaat/:jemaatId/foto  (Fulltimer only)
 * - POST /upload/user/me/foto           (User itself — avatar login)
 * - DELETE versi untuk masing-masing
 *
 * Format yang diterima: jpeg, png, webp. Akan di-convert ke WebP + resize.
 */
export const uploadRouter = Router();

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error(`Tipe file tidak didukung: ${file.mimetype}`));
    }
    cb(null, true);
  },
});

// Semua upload butuh login
uploadRouter.use(requireAuth);

// ===== Jemaat profile photo (admin only) =====
uploadRouter.post('/jemaat/:jemaatId/foto', upload.single('foto'), async (req, res) => {
  if (!req.user?.isFulltimer) throw Forbidden('Hanya Fulltimer yang boleh upload foto jemaat');
  if (!req.file) throw BadRequest('File foto wajib (field name: foto)');

  const jemaat = await prisma.jemaat.findUnique({ where: { id: req.params.jemaatId } });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');

  const fotoUrl = await saveProfilePhoto('jemaat', jemaat.id, req.file.buffer);
  const updated = await prisma.jemaat.update({
    where: { id: jemaat.id },
    data: { fotoUrl },
    select: { id: true, fotoUrl: true },
  });

  res.json({ success: true, data: updated });
});

uploadRouter.delete('/jemaat/:jemaatId/foto', async (req, res) => {
  if (!req.user?.isFulltimer) throw Forbidden();
  await deleteProfilePhoto('jemaat', req.params.jemaatId);
  await prisma.jemaat.update({
    where: { id: req.params.jemaatId },
    data: { fotoUrl: null },
  });
  res.status(204).end();
});

// ===== User avatar (self-service) =====
uploadRouter.post('/user/me/foto', upload.single('foto'), async (req, res) => {
  if (!req.user) throw Forbidden();
  if (!req.file) throw BadRequest('File foto wajib (field name: foto)');

  const userId = req.user.sub;
  const fotoUrl = await saveProfilePhoto('user', userId, req.file.buffer);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { fotoUrl },
    select: { id: true, fotoUrl: true },
  });
  res.json({ success: true, data: updated });
});

uploadRouter.delete('/user/me/foto', async (req, res) => {
  if (!req.user) throw Forbidden();
  await deleteProfilePhoto('user', req.user.sub);
  await prisma.user.update({
    where: { id: req.user.sub },
    data: { fotoUrl: null },
  });
  res.status(204).end();
});
