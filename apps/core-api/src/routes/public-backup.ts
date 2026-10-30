/**
 * GET /public/backup/:token — unduh file backup DB terenkripsi dari link email
 * bulanan (link bertanda tangan, berlaku sesuai Portal → Compliance).
 */
import { Router } from 'express';
import { access } from 'node:fs/promises';
import { Forbidden, NotFound } from '../lib/errors.js';
import { verifyBackupDownloadToken } from '../lib/backup-email.js';
import { backupPath } from '../lib/db-backup.js';
import { logger } from '../lib/logger.js';

export const publicBackupRouter = Router();

publicBackupRouter.get('/:token', async (req, res) => {
  const file = verifyBackupDownloadToken(req.params.token);
  if (!file) throw Forbidden('Link unduh backup sudah kedaluwarsa atau tidak valid.');
  const full = backupPath(file);
  await access(full).catch(() => {
    throw NotFound('File backup sudah tidak ada di server.');
  });
  logger.info({ file, ip: req.ip }, '[backup-email] file diunduh');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.download(full, file);
});
