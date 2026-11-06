import type { ErrorRequestHandler } from 'express';
import { ZodError, type ZodIssue } from 'zod';
import { Prisma } from '@ecc/database';
import { ApiError } from '../lib/errors.js';
import { MSG } from '@ecc/shared-types';
import { logger } from '../lib/logger.js';

// Map resource (Prisma model) → label ramah untuk pesan error. Default ke
// kapitalisasi nama model kalau tidak ada di mapping.
const MODEL_LABEL: Record<string, string> = {
  Sinode: 'Sinode',
  CabangGereja: 'Cabang Gereja',
  CabangRekening: 'Rekening Cabang',
  Jemaat: 'Jemaat',
  KategoriIbadah: 'Kategori Ibadah',
  Ibadah: 'Ibadah',
  Pelayanan: 'Pelayanan',
  PelayananRole: 'Role Pelayanan',
  IbadahPelayanan: 'Tautan Pelayanan',
  IbadahPelayananPetugas: 'Petugas Ibadah',
  IbadahOccurrenceStatus: 'Status Occurrence Ibadah',
  HomecellArea: 'Zona',
  Homecell: 'Homecell',
  HomecellMember: 'Anggota Homecell',
  Event: 'Event',
  EventParticipation: 'Peserta Event',
  EventPelayanan: 'Tautan Pelayanan Event',
  EventPelayananPetugas: 'Volunteer Event',
  TipeRelasi: 'Tipe Relasi',
  Role: 'Role',
  Reservasi: 'Reservasi',
  Konten: 'Konten',
  ApiKey: 'API Key',
  SinodeApiKey: 'API Key',
};

function labelFor(modelName: string | undefined): string {
  if (!modelName) return 'Data';
  return MODEL_LABEL[modelName] ?? modelName;
}

// ===== Pesan validasi Zod yang ramah (audit pesan error 2.4.6) =====
// Label field berbahasa Indonesia untuk prefix pesan; field lain → camelCase
// dipecah jadi kata ("tanggalMulai" → "Tanggal mulai").
const FIELD_LABEL: Record<string, string> = {
  namaLengkap: 'Nama lengkap',
  nama: 'Nama',
  alamat: 'Alamat',
  namaKantor: 'Nama kantor',
  statusPekerjaan: 'Pekerjaan',
  statusPernikahan: 'Status pernikahan',
  tanggalLahir: 'Tanggal lahir',
  tanggalPernikahan: 'Tanggal pernikahan',
  jenisKelamin: 'Jenis kelamin',
  judul: 'Judul',
  lokasi: 'Lokasi',
  deskripsi: 'Deskripsi',
  industri: 'Industri',
  isi: 'Isi pesan',
  catatan: 'Catatan',
  motivasi: 'Motivasi',
  alasan: 'Alasan',
  email: 'Email',
  noHp: 'No HP',
  usia: 'Usia',
  cabangId: 'Cabang',
  nominal: 'Nominal',
  url: 'Alamat web',
};

function labelField(path: (string | number)[]): string | null {
  const key = [...path].reverse().find((p): p is string => typeof p === 'string');
  if (!key) return null;
  if (FIELD_LABEL[key]) return FIELD_LABEL[key]!;
  const words = key.replace(/Id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Pesan default Zod (bahasa Inggris) → kalimat Indonesia tanpa label. */
function terjemahDefault(i: ZodIssue): string | null {
  if (!/^(Required|Invalid|Expected|String must|Number must|Array must|Too (small|big)|Unrecognized)/.test(i.message)) return null;
  switch (i.code) {
    case 'invalid_type':
      return i.received === 'undefined' || i.received === 'null' ? 'wajib diisi.' : 'formatnya tidak valid.';
    case 'too_small':
      if (i.type === 'string') return Number(i.minimum) <= 1 ? 'wajib diisi.' : `minimal ${i.minimum} karakter.`;
      if (i.type === 'array') return `minimal ${i.minimum} pilihan.`;
      return `minimal ${i.minimum}.`;
    case 'too_big':
      if (i.type === 'string') return `maksimal ${i.maximum} karakter.`;
      if (i.type === 'array') return `maksimal ${i.maximum} pilihan.`;
      return `maksimal ${i.maximum}.`;
    case 'invalid_string':
      if (i.validation === 'email') return 'formatnya tidak valid (contoh: nama@email.com).';
      if (i.validation === 'date' || i.validation === 'datetime') return 'bukan tanggal yang valid.';
      if (i.validation === 'url') return 'harus berupa alamat web yang valid.';
      return 'formatnya tidak valid.';
    case 'invalid_enum_value':
      return 'pilihannya tidak tersedia.';
    case 'invalid_date':
      return 'bukan tanggal yang valid.';
    default:
      return 'tidak valid.';
  }
}

function pesanZod(i: ZodIssue): string {
  const label = labelField(i.path);
  const terjemah = terjemahDefault(i);
  if (terjemah) return `${label ?? 'Isian'} ${terjemah}`;
  if (!label) return i.message;
  // Pesan generik dari input-rules → kalimat yang menyebut field-nya (sama dengan app 2.4.6).
  if (i.message === MSG.teks) return `${label} harus berisi huruf/angka yang bermakna, bukan hanya simbol.`;
  if (i.message === MSG.huruf) return `${label} harus berisi huruf, bukan hanya angka/simbol.`;
  const min = /^Minimal (\d+) karakter$/.exec(i.message);
  if (min) return `${label} minimal ${min[1]} karakter.`;
  const m = i.message.toLowerCase();
  const kataPertama = label.toLowerCase().split(' ')[0]!;
  // Pesan sudah menyebut field-nya ("Nama hanya boleh…", "Tanggal lahir tidak…").
  if (m.startsWith(kataPertama) || m.includes(label.toLowerCase())) return i.message;
  return `${label}: ${i.message}`;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Zod validation
  if (err instanceof ZodError) {
    // Pakai pesan validasi pertama sebagai `message` supaya client (portal,
    // mobile, ckids) langsung bisa tampilkan alasan yang jelas, mis.
    // "No HP tidak valid. Pakai 08… untuk Indonesia, atau sertakan kode negara".
    const first = err.issues[0];
    const message = first ? pesanZod(first) : 'Input tidak valid';
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message,
        details: err.flatten(),
      },
    });
    return;
  }

  // ApiError custom — sudah punya message ramah
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // ===== Prisma known errors =====
  // Translate constraint failures menjadi pesan ramah supaya user mengerti
  // bahwa operasi gagal karena data masih berelasi / sudah ada / dll.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (err.meta ?? {}) as Record<string, unknown>;
    const modelName = typeof meta.modelName === 'string' ? meta.modelName : undefined;
    const label = labelFor(modelName);

    // Log selalu untuk membantu debug — Prisma error sering misterius tanpa
    // meta-nya kelihatan di FE.
    logger.warn(
      { code: err.code, meta: err.meta, message: err.message },
      `Prisma error ${err.code}`,
    );

    // P2003 — Foreign key constraint failed.
    // Bisa dua arah:
    //   (a) DELETE/UPDATE row yang masih punya child reference.
    //   (b) INSERT/UPDATE dengan FK ke row yang tidak ada (mis. cabangId
    //       yang sudah terhapus, atau authorId yang tidak terdaftar).
    // Bedakan berdasarkan field_name (kalau ada) dan jenis operasi.
    // P2014 — The change would violate the required relation between models.
    if (err.code === 'P2003' || err.code === 'P2014') {
      const fieldName =
        typeof meta.field_name === 'string'
          ? meta.field_name
          : typeof meta.constraint === 'string'
            ? meta.constraint
            : undefined;
      const message =
        // Best heuristic: kalau ada field_name yang mengandung "_id_fkey",
        // biasanya FK target tidak ada (case b). Selain itu, tampilkan pesan
        // generic yang mencakup kedua kasus.
        fieldName
          ? `Operasi ${label} gagal karena referensi ke data lain tidak valid (${fieldName}). Periksa apakah relasi (cabang/sinode/pelayanan/jemaat) masih ada.`
          : `Operasi ${label} gagal karena terkait dengan data lain. Pastikan data referensi masih ada dan tidak ada child yang menghalangi.`;
      res.status(409).json({
        success: false,
        error: {
          code: 'CONSTRAINT_RELATION',
          message,
          details: { prismaCode: err.code, field: fieldName },
        },
      });
      return;
    }

    // P2002 — Unique constraint failed (duplikat)
    if (err.code === 'P2002') {
      const target = Array.isArray(meta.target) ? (meta.target as string[]).join(', ') : 'kolom unik';
      res.status(409).json({
        success: false,
        error: {
          code: 'CONSTRAINT_UNIQUE',
          message: `Data ${label} sudah ada (duplikat pada: ${target}).`,
          details: { prismaCode: err.code, target },
        },
      });
      return;
    }

    // P2025 — Record to delete/update does not exist
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Data ${label} tidak ditemukan.`,
          details: { prismaCode: err.code },
        },
      });
      return;
    }

    // P2023 — Inconsistent column data (mis. invalid UUID format).
    // Biasanya muncul saat client kirim string non-UUID ke column UUID.
    // Pakai pesan friendly + 400 supaya client tahu input-nya salah format,
    // bukan 500 generic.
    if (err.code === 'P2023') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT_FORMAT',
          message:
            'Format input tidak valid (kemungkinan UUID/format kolom tidak sesuai). ' +
            'Cek apakah ID yang dikirim valid UUID.',
          details: { prismaCode: err.code, hint: 'Periksa format parameter (UUID)' },
        },
      });
      return;
    }

    // Prisma error lain yang belum kita handle — log + return generic 500
    // dengan kode supaya bisa di-debug dari log.
    logger.error(
      { code: err.code, meta: err.meta },
      `Prisma error tidak terhandle: ${err.code}`,
    );
    res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: `Error database (${err.code}). Lihat log server untuk detail.`,
        details: { prismaCode: err.code },
      },
    });
    return;
  }

  // PrismaClientValidationError — input shape salah sebelum sampai DB.
  // Biasanya bug developer, tapi tetap kasih sinyal supaya bukan 500.
  if (err instanceof Prisma.PrismaClientValidationError) {
    logger.warn({ err }, 'Prisma validation error');
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Input tidak valid untuk operasi database',
      },
    });
    return;
  }

  // Unknown
  logger.error(err, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal' },
  });
};
