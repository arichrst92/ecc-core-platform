/**
 * Cek isi file (magic bytes) sebelum diproses `sharp`.
 *
 * `sharp(buffer)` mendeteksi format dari ISI file, bukan nama/MIME. Tanpa cek
 * ini, file SVG (atau yang menyamar sebagai .jpg / octet-stream) akan diproses
 * librsvg — library yang terkena CVE-2026-96889 (RCE). Hanya format foto raster
 * yang diterima: JPEG, PNG, GIF, WebP, HEIC/HEIF/AVIF, TIFF, BMP.
 */
import { BadRequest } from './errors.js';

const ISO_BMFF_BRANDS = new Set([
  'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs',
  'mif1', 'msf1', 'miaf', 'heif', 'avif', 'avis',
]);

export function detectRasterImage(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  const head6 = buf.subarray(0, 6).toString('latin1');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') return 'gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
      (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)) return 'tiff';
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'bmp';
  // HEIC / HEIF / AVIF: box "ftyp" di offset 4; cek major + compatible brands.
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const boxSize = Math.min(buf.readUInt32BE(0) || 32, buf.length, 256);
    for (let i = 8; i + 4 <= boxSize; i += 4) {
      if (i === 12) continue; // minor_version
      if (ISO_BMFF_BRANDS.has(buf.subarray(i, i + 4).toString('latin1'))) return 'heif';
    }
  }
  return null;
}

/** Lempar 400 kalau bukan foto raster yang dikenal. Mengembalikan buffer (untuk dipakai inline). */
export function assertRasterImage(buf: Buffer): Buffer {
  if (!detectRasterImage(buf)) {
    throw BadRequest('Format gambar tidak didukung. Gunakan foto JPG, PNG, WebP, GIF, atau HEIC.');
  }
  return buf;
}
