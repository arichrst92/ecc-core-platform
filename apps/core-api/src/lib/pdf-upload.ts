/**
 * Flexible PDF upload middleware untuk endpoint upload dokumen (mis. company
 * profile bisnis).
 *
 * Mirror dari `flexImageUpload()` (lihat image-upload.ts) tapi MIME-nya
 * dibatasi ke `application/pdf` saja. Field name agnostic — terima `file`,
 * `pdf`, `profile`, dll lewat `multer.any()`.
 */
import multer, { type Multer } from 'multer';
import type { RequestHandler } from 'express';
import { BadRequest } from './errors.js';
import { logger } from './logger.js';

const ANDROID_OCTET_STREAM = 'application/octet-stream';

function isPdfMime(mime: string, filename?: string): boolean {
  const lower = mime.toLowerCase();
  if (lower === 'application/pdf' || lower === 'application/x-pdf') return true;
  // Android terkadang kirim octet-stream + filename .pdf
  if (lower === ANDROID_OCTET_STREAM && filename?.toLowerCase().endsWith('.pdf')) return true;
  return false;
}

export interface FlexPdfUploadOptions {
  /** Max file size in bytes. Default: 5 MB. */
  maxBytes?: number;
}

export function flexPdfUpload(opts: FlexPdfUploadOptions = {}): RequestHandler {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const m: Multer = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!isPdfMime(file.mimetype, file.originalname)) {
        return cb(
          new Error(
            `Tipe file tidak didukung (${file.mimetype}). Hanya PDF yang diterima.`,
          ),
        );
      }
      cb(null, true);
    },
  });

  const handler = m.any();

  return (req, res, next) => {
    handler(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            BadRequest(
              `File PDF terlalu besar. Maksimum ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
            ),
          );
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(BadRequest('Hanya boleh upload 1 file.'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(BadRequest('Field file tidak diharapkan.'));
        }
        if (err.message) {
          return next(BadRequest(err.message));
        }
        return next(err);
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length > 0 && !req.file) {
        req.file = files[0];
      }
      if (!req.file) {
        const contentType = req.get('content-type') ?? '';
        const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];
        logger.warn(
          {
            path: req.path,
            method: req.method,
            contentType,
            bodyKeys,
            filesCount: files.length,
          },
          'flexPdfUpload: no file detected in request',
        );
      }
      next();
    });
  };
}
