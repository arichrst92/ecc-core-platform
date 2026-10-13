/**
 * Upload materi (file pertemuan homecell): PDF, gambar, dokumen Office, teks.
 * Field name agnostic (`multer.any()`), `req.file` = file pertama. Maks 20 MB.
 */
import path from 'node:path';
import multer, { type Multer } from 'multer';
import type { RequestHandler } from 'express';
import { BadRequest } from './errors.js';

/** Ekstensi yang diterima → mime yang disimpan. */
export const MATERIAL_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};

/** Ekstensi file dari nama asli (fallback dari mime). Null kalau tidak diterima. */
export function materialExt(originalName: string | undefined, mime: string): string | null {
  const ext = path.extname(originalName ?? '').slice(1).toLowerCase();
  if (ext && MATERIAL_TYPES[ext]) return ext;
  const byMime = Object.entries(MATERIAL_TYPES).find(([, m]) => m === mime.toLowerCase());
  return byMime ? byMime[0] : null;
}

export function flexMaterialUpload(maxBytes = 20 * 1024 * 1024): RequestHandler {
  const m: Multer = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (materialExt(file.originalname, file.mimetype)) return cb(null, true);
      cb(new Error('Tipe file tidak didukung. Gunakan PDF, gambar, Word, Excel, PowerPoint, atau teks.'));
    },
  });
  const handler = m.any();
  return (req, res, next) => {
    handler(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(BadRequest(`File terlalu besar. Maksimum ${Math.floor(maxBytes / (1024 * 1024))} MB.`));
        }
        if (err.code === 'LIMIT_FILE_COUNT') return next(BadRequest('Hanya boleh upload 1 file.'));
        return next(err.message ? BadRequest(err.message) : err);
      }
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length > 0 && !req.file) req.file = files[0];
      next();
    });
  };
}
