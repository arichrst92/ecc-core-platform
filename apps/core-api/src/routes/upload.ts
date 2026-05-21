import { Router } from 'express';
import { prisma } from '@ecc/database';
import { requireAuth } from '../middleware/require-auth.js';
import { saveProfilePhoto, deleteProfilePhoto } from '../lib/storage.js';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { flexImageUpload } from '../lib/image-upload.js';

/**
 * Endpoint upload foto profil.
 *
 * - POST /upload/jemaat/:jemaatId/foto  (siapa saja yang login)
 * - POST /upload/user/me/foto           (User itself — avatar login)
 * - DELETE versi untuk masing-masing
 *
 * Format yang diterima via `flexImageUpload`: jpeg, png, webp, heic/heif (iOS),
 * gif. Field name fleksibel (foto/file/image/bukti). Convert ke WebP + resize.
 */
export const uploadRouter = Router();

// Semua upload butuh login
uploadRouter.use(requireAuth);

// ===== Jemaat profile photo =====
// Sebelumnya Fulltimer-only; sekarang siapa saja yang login bisa upload.
uploadRouter.post('/jemaat/:jemaatId/foto', flexImageUpload(), async (req, res) => {
  if (!req.file) {
    throw BadRequest(
      'File foto wajib. Kirim sebagai multipart/form-data dengan field name "foto" (atau "file" / "image").',
    );
  }

  const jemaat = await prisma.jemaat.findUnique({ where: { id: req.params.jemaatId } });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');

  const fotoUrl = await saveProfilePhoto('jemaat', jemaat.id, req.file.buffer);
  const updated = await prisma.jemaat.update({
    where: { id: jemaat.id },
    data: { fotoUrl },
    select: { id: true, fotoUrl: true, namaLengkap: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'jemaat',
    resourceId: jemaat.id,
    resourceLabel: updated.namaLengkap,
    metadata: { kind: 'jemaat-profile', size: req.file.size },
  });
  res.json({ success: true, data: updated });
});

uploadRouter.delete('/jemaat/:jemaatId/foto', async (req, res) => {
  await deleteProfilePhoto('jemaat', req.params.jemaatId);
  const updated = await prisma.jemaat.update({
    where: { id: req.params.jemaatId },
    data: { fotoUrl: null },
    select: { namaLengkap: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'jemaat',
    resourceId: req.params.jemaatId,
    resourceLabel: updated.namaLengkap,
    metadata: { kind: 'jemaat-profile-delete' },
  });
  res.status(204).end();
});

// ===== User avatar (self-service) =====
uploadRouter.post('/user/me/foto', flexImageUpload(), async (req, res) => {
  if (!req.user) throw Forbidden();
  if (!req.file) {
    throw BadRequest(
      'File foto wajib. Kirim sebagai multipart/form-data dengan field name "foto" (atau "file" / "image").',
    );
  }

  const userId = req.user.sub;
  const fotoUrl = await saveProfilePhoto('user', userId, req.file.buffer);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { fotoUrl },
    select: { id: true, fotoUrl: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'user',
    resourceId: userId,
    metadata: { kind: 'user-avatar', size: req.file.size },
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
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'user',
    resourceId: req.user.sub,
    metadata: { kind: 'user-avatar-delete' },
  });
  res.status(204).end();
});
