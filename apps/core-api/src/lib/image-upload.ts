/**
 * Flexible image upload middleware untuk endpoint upload foto/bukti.
 *
 * Drop-in replacement untuk `multer.single('foto')` yang lebih mobile-friendly:
 *
 *   1. **Field name agnostic**: accept `foto`, `bukti`, `file`, `image`, atau
 *      apapun. Mobile dev tidak perlu hafal nama field per endpoint.
 *      Internal pakai `multer.any()` lalu populate `req.file` dengan file
 *      pertama yang ditemukan (drop-in compatibility).
 *
 *   2. **MIME type lebih luas**: tambah HEIC/HEIF (iOS Live Photo camera),
 *      case-insensitive matching, plus terima `application/octet-stream`
 *      yang kadang dikirim Android tanpa MIME detection.
 *
 *   3. **Error message friendly**: kalau file ditolak, sebut MIME yang
 *      dikirim + list yang diterima. Bantu mobile debug.
 *
 *   4. **Multer error translated ke 400**: file size, file count, dll
 *      di-catch dan throw BadRequest yang sesuai.
 *
 * Cara pakai:
 *
 *   import { flexImageUpload } from '../../lib/image-upload.js';
 *
 *   router.post('/foo', flexImageUpload(), async (req, res) => {
 *     if (!req.file) throw BadRequest('File foto wajib');
 *     // ...gunakan req.file.buffer
 *   });
 *
 * Kalau perlu custom size limit / field count, oper opsional ke `flexImageUpload`:
 *
 *   flexImageUpload({ maxBytes: 10 * 1024 * 1024 })
 */
import multer, { type Multer } from 'multer';
import type { RequestHandler } from 'express';
import { BadRequest } from './errors.js';
import { logger } from './logger.js';

const ACCEPTED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
]);

const ANDROID_OCTET_STREAM = 'application/octet-stream';

function isImageMime(mime: string): boolean {
  const lower = mime.toLowerCase();
  if (ACCEPTED_MIME.has(lower)) return true;
  // Android kadang kirim octet-stream + filename ber-ext .jpg/.heic
  if (lower === ANDROID_OCTET_STREAM) return true;
  // Toleran lebih: apa saja yg dimulai dengan "image/"
  return lower.startsWith('image/');
}

export interface FlexImageUploadOptions {
  /** Max file size in bytes. Default: 5 MB. */
  maxBytes?: number;
}

/**
 * Returns an Express middleware that wraps `multer.any()` and populates
 * `req.file` with the first image found, regardless of field name.
 *
 * Error multer (size limit, invalid mime, dll) di-translate ke
 * `BadRequest` dengan message ramah.
 */
export function flexImageUpload(opts: FlexImageUploadOptions = {}): RequestHandler {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const m: Multer = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (!isImageMime(file.mimetype)) {
        const accepted = [...ACCEPTED_MIME].join(', ');
        return cb(
          new Error(
            `Tipe file tidak didukung (${file.mimetype}). Diterima: ${accepted}`,
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
        // Multer error class — handle size limit, etc.
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            BadRequest(
              `File terlalu besar. Maksimum ${Math.floor(maxBytes / (1024 * 1024))} MB. ` +
                'Kompres dulu di mobile sebelum upload.',
            ),
          );
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(BadRequest('Hanya boleh upload 1 file.'));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          // Tidak akan terjadi karena pakai .any(), tapi defensive.
          return next(BadRequest('Field file tidak diharapkan.'));
        }
        // File filter rejection (Error.message dari fileFilter di atas)
        if (err.message) {
          return next(BadRequest(err.message));
        }
        return next(err);
      }

      // Populate req.file dari req.files[0] supaya drop-in compatible
      // dengan handler yang sebelumnya pakai `req.file`.
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length > 0 && !req.file) {
        req.file = files[0];
      }

      // Diagnostic logging — kalau body diterima tapi tidak ada file,
      // log info untuk bantu debug mobile dev. Pelan-pelan, hanya kalau
      // memang ada body yang relevan (multipart Content-Type).
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
            hint:
              contentType.startsWith('multipart/form-data')
                ? 'Multipart diterima tapi tidak ada file. Cek mobile FormData.append({uri, type, name}) bukan plain string.'
                : `Content-Type "${contentType}" bukan multipart/form-data. Kirim FormData (jangan JSON) dan biarkan client auto-set Content-Type dengan boundary.`,
          },
          'flexImageUpload: no file detected in request',
        );
      }
      next();
    });
  };
}
