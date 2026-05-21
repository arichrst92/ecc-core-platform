import { Router } from 'express';
import multer from 'multer';
import { prisma } from '@ecc/database';
import {
  createJemaatSchema,
  updateJemaatSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  parseCsv,
  validateRows,
  generateTemplateCsv,
  type RowValidation,
} from '../../lib/import-csv.js';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';
import { logger } from '../../lib/logger.js';

// Helper: generate kode jemaat unik (mirip pattern reservasi).
async function generateUniqueKodeJemaat(): Promise<string> {
  return generateUniqueKode(
    async (kode) => !!(await prisma.jemaat.findUnique({ where: { kode } })),
  );
}

export const jemaatRouter = Router();

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['text/csv', 'application/vnd.ms-excel', 'application/csv', 'text/plain'].includes(
      file.mimetype,
    ) || file.originalname.toLowerCase().endsWith('.csv');
    if (!ok) return cb(new Error(`File harus CSV (got: ${file.mimetype})`));
    cb(null, true);
  },
});

// Whitelist sortBy untuk jemaat list. Hanya field yang aman & masuk akal
// di-sort yang diizinkan. Default = namaLengkap.
const JEMAAT_SORT_FIELDS = new Set([
  'namaLengkap',
  'tanggalLahir',
  'tanggalBergabung',
  'cabang',
  'createdAt',
]);

function getQueryString(req: { query: Record<string, unknown> }, key: string): string | undefined {
  const v = req.query[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

jemaatRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const cabangId = getQueryString(req, 'cabangId');
  const sinodeId = getQueryString(req, 'sinodeId');
  const isActiveStr = getQueryString(req, 'isActive');
  const jenisKelamin = getQueryString(req, 'jenisKelamin');
  const roleId = getQueryString(req, 'roleId');
  const umurMinStr = getQueryString(req, 'umurMin');
  const umurMaxStr = getQueryString(req, 'umurMax');

  const where: any = {};
  if (q.search) {
    where.OR = [
      { namaLengkap: { contains: q.search, mode: 'insensitive' } },
      { email: { contains: q.search, mode: 'insensitive' } },
      { noHp: { contains: q.search } },
    ];
  }
  if (cabangId) where.cabangId = cabangId;
  if (sinodeId) where.cabang = { sinodeId };

  // Filter Status (Aktif/Nonaktif). "true" / "false" string dari query.
  if (isActiveStr === 'true') where.isActive = true;
  else if (isActiveStr === 'false') where.isActive = false;

  // Filter Jenis Kelamin (L/P)
  if (jenisKelamin === 'L' || jenisKelamin === 'P') {
    where.jenisKelamin = jenisKelamin;
  }

  // Filter Role: ada active JemaatRole dengan roleId tertentu
  if (roleId) {
    where.jemaatRoles = { some: { isActive: true, roleId } };
  }

  // Filter usia: tanggalLahir antara (now - umurMax) .. (now - umurMin)
  // Mis. umurMin=20 umurMax=30 → tanggalLahir between (today-30y) and (today-20y).
  const umurMin = umurMinStr ? Number.parseInt(umurMinStr, 10) : undefined;
  const umurMax = umurMaxStr ? Number.parseInt(umurMaxStr, 10) : undefined;
  if (
    (umurMin !== undefined && Number.isFinite(umurMin)) ||
    (umurMax !== undefined && Number.isFinite(umurMax))
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tanggalLahirFilter: { gte?: Date; lte?: Date } = {};
    if (umurMax !== undefined && Number.isFinite(umurMax) && umurMax >= 0) {
      const min = new Date(today);
      min.setFullYear(min.getFullYear() - umurMax - 1);
      // Lahir > today - (umurMax+1) tahun → usia ≤ umurMax (inclusive)
      tanggalLahirFilter.gte = new Date(min.getTime() + 24 * 60 * 60 * 1000);
    }
    if (umurMin !== undefined && Number.isFinite(umurMin) && umurMin >= 0) {
      const max = new Date(today);
      max.setFullYear(max.getFullYear() - umurMin);
      // Lahir ≤ today - umurMin tahun → usia ≥ umurMin
      tanggalLahirFilter.lte = max;
    }
    where.tanggalLahir = tanggalLahirFilter;
  }

  // Resolve sort: whitelist field, default namaLengkap, default order asc.
  const sortBy =
    q.sortBy && JEMAAT_SORT_FIELDS.has(q.sortBy) ? q.sortBy : 'namaLengkap';
  const sortOrder = q.sortOrder === 'desc' ? 'desc' : 'asc';
  // "cabang" disorted lewat nested relation cabang.nama
  const orderBy: any =
    sortBy === 'cabang'
      ? [{ cabang: { nama: sortOrder } }, { namaLengkap: 'asc' }]
      : { [sortBy]: sortOrder };

  const [data, total] = await Promise.all([
    prisma.jemaat.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy,
      include: {
        cabang: { select: { id: true, nama: true } },
        // Aktif roles untuk tampil di kolom "Role" (compact format Role:SubRole)
        jemaatRoles: {
          where: { isActive: true },
          select: {
            role: { select: { nama: true } },
            subRole: { select: { nama: true } },
            subRoleStatus: { select: { nama: true } },
          },
        },
      },
    }),
    prisma.jemaat.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

/**
 * GET /admin/jemaat/by-pelayanan?pelayanan=Penggembalaan&role=Zone%20Leader&cabangId=...
 *
 * Return jemaat dengan ACTIVE JemaatPelayanan(pelayanan=X, role=Y).
 * Dipakai oleh dropdown PIC HomecellArea / Homecell untuk filter eligible jemaat.
 *
 * Filter opsional `cabangId` membatasi hasil hanya jemaat dari cabang tertentu.
 */
jemaatRouter.get('/by-pelayanan', async (req, res) => {
  const pelayananNama = typeof req.query.pelayanan === 'string' ? req.query.pelayanan : undefined;
  const roleNama = typeof req.query.role === 'string' ? req.query.role : undefined;
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  if (!pelayananNama) throw BadRequest('Query "pelayanan" wajib');

  const where: any = {
    isActive: true,
    jemaatPelayanan: {
      some: {
        isActive: true,
        pelayanan: { nama: pelayananNama },
        ...(roleNama ? { pelayananRole: { nama: roleNama } } : {}),
      },
    },
  };
  if (cabangId) where.cabangId = cabangId;

  const data = await prisma.jemaat.findMany({
    where,
    orderBy: { namaLengkap: 'asc' },
    select: {
      id: true,
      namaLengkap: true,
      noHp: true,
      fotoUrl: true,
      cabang: { select: { id: true, nama: true } },
    },
    take: 500,
  });
  res.json({ success: true, data });
});

// Lookup by kode (untuk scan QR). Kode di-uppercase agar tahan typo case.
jemaatRouter.get('/by-kode/:kode', async (req, res) => {
  const kode = req.params.kode?.toUpperCase().trim();
  if (!kode) throw BadRequest('Kode wajib');
  const item = await prisma.jemaat.findUnique({
    where: { kode },
    select: {
      id: true,
      kode: true,
      namaLengkap: true,
      noHp: true,
      fotoUrl: true,
      isActive: true,
      cabang: { select: { id: true, nama: true } },
    },
  });
  if (!item) throw NotFound('Kode jemaat tidak ditemukan');
  res.json({ success: true, data: item });
});

jemaatRouter.get('/:id', async (req, res) => {
  const item = await prisma.jemaat.findUnique({
    where: { id: req.params.id },
    include: {
      cabang: true,
      jemaatRoles: {
        include: { role: true, subRole: true, subRoleStatus: true },
        orderBy: { tanggalMulai: 'desc' },
      },
      relasiAsal: { include: { jemaatTerkait: true, tipeRelasi: true } },
    },
  });
  if (!item) throw NotFound('Jemaat tidak ditemukan');
  res.json({ success: true, data: item });
});

jemaatRouter.post('/', async (req, res) => {
  const input = createJemaatSchema.parse(req.body);
  const kode = await generateUniqueKodeJemaat();
  const data = {
    ...input,
    kode,
    email: input.email || null,
    tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : undefined,
    tanggalBergabung: input.tanggalBergabung ? new Date(input.tanggalBergabung) : undefined,
  };
  const created = await prisma.jemaat.create({ data });
  audit(req, { action: 'CREATE', resource: 'jemaat', resourceId: created.id, resourceLabel: created.namaLengkap, after: created });
  res.status(201).json({ success: true, data: created });
});

jemaatRouter.patch('/:id', async (req, res) => {
  const input = updateJemaatSchema.parse(req.body);
  const data = {
    ...input,
    tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : undefined,
    tanggalBergabung: input.tanggalBergabung ? new Date(input.tanggalBergabung) : undefined,
  };
  const before = await prisma.jemaat.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Jemaat tidak ditemukan');
  const updated = await prisma.jemaat.update({ where: { id: req.params.id }, data });
  audit(req, { action: 'UPDATE', resource: 'jemaat', resourceId: updated.id, resourceLabel: updated.namaLengkap, before, after: updated });
  res.json({ success: true, data: updated });
});

jemaatRouter.delete('/:id', async (req, res) => {
  const before = await prisma.jemaat.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Jemaat tidak ditemukan');
  await prisma.jemaat.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'jemaat', resourceId: before.id, resourceLabel: before.namaLengkap, before });
  res.status(204).end();
});

// ===================================================================
//  CSV Bulk Import
// ===================================================================

/**
 * GET /admin/jemaat/import/template — download template CSV dengan contoh.
 */
jemaatRouter.get('/import/template', (_req, res) => {
  const csv = generateTemplateCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="template-import-jemaat.csv"');
  res.send(csv);
});

/**
 * POST /admin/jemaat/import/preview — parse + validate CSV, return per-row report.
 * Tidak insert apapun ke DB. Frontend bisa display preview table dan biarkan user
 * fix/turunkan errors sebelum commit.
 */
jemaatRouter.post('/import/preview', csvUpload.single('file'), async (req, res) => {
  if (!req.file) throw BadRequest('File CSV wajib (field name: file)');

  let parseResult;
  try {
    parseResult = parseCsv(req.file.buffer);
  } catch (err: any) {
    throw BadRequest(err.message);
  }

  const validations = validateRows(parseResult.rows);
  const enriched = await enrichWithDbChecks(validations);

  const summary = summarize(enriched);
  res.json({ success: true, data: { rows: enriched, summary } });
});

/**
 * POST /admin/jemaat/import/commit — actually insert. Hanya row yang valid yang diinsert.
 * Wrapped dalam transaction supaya atomik (semua-or-nothing).
 * Body opsional: `skipErrors=true` (default true) untuk insert hanya yang valid;
 * jika `false`, satu error apa pun rollback semuanya.
 */
jemaatRouter.post('/import/commit', csvUpload.single('file'), async (req, res) => {
  if (!req.file) throw BadRequest('File CSV wajib (field name: file)');
  const skipErrors = req.body.skipErrors !== 'false';

  let parseResult;
  try {
    parseResult = parseCsv(req.file.buffer);
  } catch (err: any) {
    throw BadRequest(err.message);
  }

  const validations = validateRows(parseResult.rows);
  const enriched = await enrichWithDbChecks(validations);
  const validRows = enriched.filter((r) => r.errors.length === 0 && r.parsed && r.cabangId);
  const errorRows = enriched.filter((r) => r.errors.length > 0);

  if (!skipErrors && errorRows.length > 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'IMPORT_HAS_ERRORS',
        message: `${errorRows.length} row error. Set skipErrors=true untuk lewati & insert yang valid.`,
        details: { summary: summarize(enriched) },
      },
    });
  }

  // Pre-generate kode untuk semua row (di luar transaction supaya bisa retry
  // collision per kode tanpa rollback besar).
  const kodeList: string[] = [];
  for (let i = 0; i < validRows.length; i++) {
    kodeList.push(await generateUniqueKodeJemaat());
  }

  // Batch insert dalam transaction
  const inserted = await prisma.$transaction(async (tx) => {
    const created: { id: string; namaLengkap: string }[] = [];
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]!;
      const r = row.parsed!;
      const c = await tx.jemaat.create({
        data: {
          cabangId: row.cabangId!,
          namaLengkap: r.namaLengkap,
          kode: kodeList[i]!,
          email: r.email,
          noHp: r.noHp,
          jenisKelamin: r.jenisKelamin ?? undefined,
          tanggalLahir: r.tanggalLahir ?? undefined,
          alamat: r.alamat,
          tanggalBergabung: r.tanggalBergabung ?? undefined,
        },
        select: { id: true, namaLengkap: true },
      });
      created.push(c);
    }
    return created;
  });

  // Audit di luar transaction (fire-and-forget)
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat',
    resourceLabel: `Bulk import ${inserted.length} jemaat`,
    metadata: {
      totalRows: parseResult.totalRows,
      insertedCount: inserted.length,
      errorCount: errorRows.length,
      skipErrors,
    },
  });

  logger.info(
    { inserted: inserted.length, errors: errorRows.length, total: parseResult.totalRows },
    'CSV jemaat import committed',
  );

  res.json({
    success: true,
    data: {
      insertedCount: inserted.length,
      errorCount: errorRows.length,
      totalRows: parseResult.totalRows,
      inserted,
      summary: summarize(enriched),
    },
  });
});

// ----------------- helpers -----------------

interface EnrichedRow extends RowValidation {
  cabangId: string | null;
  cabangName: string | null;
  duplicateNoHp: boolean;
  duplicateEmail: boolean;
}

/** Tambah info dari DB: lookup kode_cabang → cabangId, cek duplicate noHp/email. */
async function enrichWithDbChecks(validations: RowValidation[]): Promise<EnrichedRow[]> {
  const codes = new Set(validations.map((v) => v.parsed?.kodeCabang).filter(Boolean) as string[]);
  const noHps = new Set(validations.map((v) => v.parsed?.noHp).filter(Boolean) as string[]);
  const emails = new Set(validations.map((v) => v.parsed?.email).filter(Boolean) as string[]);

  const [cabangs, existingNoHps, existingEmails] = await Promise.all([
    codes.size > 0
      ? prisma.cabangGereja.findMany({ where: { kode: { in: [...codes] } }, select: { id: true, nama: true, kode: true } })
      : Promise.resolve([]),
    noHps.size > 0
      ? prisma.jemaat.findMany({ where: { noHp: { in: [...noHps] } }, select: { noHp: true } })
      : Promise.resolve([]),
    emails.size > 0
      ? prisma.jemaat.findMany({ where: { email: { in: [...emails] } }, select: { email: true } })
      : Promise.resolve([]),
  ]);

  const cabangMap = new Map(cabangs.map((c) => [c.kode, c]));
  const dupNoHp = new Set(existingNoHps.map((j) => j.noHp));
  const dupEmail = new Set(existingEmails.map((j) => j.email));

  return validations.map((v) => {
    const cabang = v.parsed ? cabangMap.get(v.parsed.kodeCabang) : null;
    const duplicateNoHp = !!(v.parsed?.noHp && dupNoHp.has(v.parsed.noHp));
    const duplicateEmail = !!(v.parsed?.email && dupEmail.has(v.parsed.email));

    const extraErrors: string[] = [...v.errors];
    if (v.parsed && !cabang) extraErrors.push(`kode_cabang: "${v.parsed.kodeCabang}" tidak ditemukan`);
    if (duplicateNoHp) extraErrors.push(`no_hp: sudah terdaftar di sistem`);
    if (duplicateEmail) extraErrors.push(`email: sudah terdaftar di sistem`);

    return {
      ...v,
      errors: extraErrors,
      cabangId: cabang?.id ?? null,
      cabangName: cabang?.nama ?? null,
      duplicateNoHp,
      duplicateEmail,
    };
  });
}

function summarize(rows: EnrichedRow[]) {
  return {
    total: rows.length,
    valid: rows.filter((r) => r.errors.length === 0).length,
    invalid: rows.filter((r) => r.errors.length > 0).length,
  };
}
