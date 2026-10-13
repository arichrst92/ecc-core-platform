/**
 * Upload dokumen: gambar ATAU PDF (mis. file sertifikat jemaat).
 *
 * Mirror `flexImageUpload()` / `flexPdfUpload()` — field name agnostic
 * (`multer.any()`), `req.file` diisi file pertama. File opsional: route yang
 * butuh file wajib harus cek sendiri.
 */
import multer, { type Multer } from 'multer';
import type { RequestHandler } from 'express';
import { BadRequest } from './errors.js';

export function isPdfFile(mime: string, filename?: string): boolean {
  const lower = mime.toLowerCase();
  if (lower === 'application/pdf' || lower === 'application/x-pdf') return true;
  return lower === 'application/octet-stream' && !!filename?.toLowerCase().endsWith('.pdf');
}

export function isImageFile(mime: string, filename?: string): boolean {
  const lower = mime.toLowerCase();
  if (lower.startsWith('image/')) return true;
  return (
    lower === 'application/octet-stream' &&
    !!filename && /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(filename)
  );
}

export function flexDocumentUpload(opts: { maxBytes?: number } = {}): RequestHandler {
  const maxBytes = opts.maxBytes ?? 10 * 1024 * 1024;
  const m: Multer = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (isPdfFile(file.mimetype, file.originalname) || isImageFile(file.mimetype, file.originalname)) {
        return cb(null, true);
      }
      cb(new Error(`Tipe file tidak didukung (${file.mimetype}). Gunakan gambar (JPG/PNG/WebP/HEIC) atau PDF.`));
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
