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
  // Filter baru per request 2026-10-03
  const homecellId = getQueryString(req, 'homecellId');
  const homecellAreaId = getQueryString(req, 'homecellAreaId');
  const pelayananId = getQueryString(req, 'pelayananId');

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

  // Filter Homecell / Homecell Area: ada active HomecellMember
  if (homecellId) {
    where.homecellMembership = { some: { isActive: true, homecellId } };
  } else if (homecellAreaId) {
    where.homecellMembership = {
      some: { isActive: true, homecell: { areaId: homecellAreaId } },
    };
  }

  // Filter Ministry (Pelayanan): ada active JemaatPelayanan
  if (pelayananId) {
    where.jemaatPelayanan = { some: { isActive: true, pelayananId } };
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
        // Homecell Area aktif (via HomecellMember.homecell.homecellArea)
        homecellMembership: {
          where: { isActive: true },
          select: {
            homecell: {
              select: {
                id: true,
                nama: true,
                area: { select: { id: true, nama: true } },
              },
            },
          },
          take: 3,
        },
        // Pelayanan (Ministry) aktif
        jemaatPelayanan: {
          where: { isActive: true },
          select: {
            pelayanan: { select: { id: true, nama: true } },
            pelayananRole: { select: { nama: true } },
          },
          take: 3,
        },
        // User.lastLoginAt — null kalau belum pernah login / belum ada user record.
        user: { select: { lastLoginAt: true } },
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

// ============================================================
//  Export Jemaat — CSV (Excel-compat) + HTML Print View (PDF via browser)
//  Per request 2026-10-03. Reuse where-clause builder dari list endpoint
//  supaya filter konsisten (cabang, homecell, pelayanan, usia, dst).
// ============================================================

function buildJemaatWhereFromQuery(req: any): any {
  const cabangId = getQueryString(req, 'cabangId');
  const sinodeId = getQueryString(req, 'sinodeId');
  const isActiveStr = getQueryString(req, 'isActive');
  const jenisKelamin = getQueryString(req, 'jenisKelamin');
  const roleId = getQueryString(req, 'roleId');
  const umurMinStr = getQueryString(req, 'umurMin');
  const umurMaxStr = getQueryString(req, 'umurMax');
  const homecellId = getQueryString(req, 'homecellId');
  const homecellAreaId = getQueryString(req, 'homecellAreaId');
  const pelayananId = getQueryString(req, 'pelayananId');
  const search = getQueryString(req, 'search');

  const where: any = {};
  if (search) {
    where.OR = [
      { namaLengkap: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { noHp: { contains: search } },
    ];
  }
  if (cabangId) where.cabangId = cabangId;
  if (sinodeId) where.cabang = { sinodeId };
  if (isActiveStr === 'true') where.isActive = true;
  else if (isActiveStr === 'false') where.isActive = false;
  if (jenisKelamin === 'L' || jenisKelamin === 'P') where.jenisKelamin = jenisKelamin;
  if (roleId) where.jemaatRoles = { some: { isActive: true, roleId } };
  if (homecellId) where.homecellMembership = { some: { isActive: true, homecellId } };
  else if (homecellAreaId)
    where.homecellMembership = { some: { isActive: true, homecell: { areaId: homecellAreaId } } };
  if (pelayananId) where.jemaatPelayanan = { some: { isActive: true, pelayananId } };

  const umurMin = umurMinStr ? Number.parseInt(umurMinStr, 10) : undefined;
  const umurMax = umurMaxStr ? Number.parseInt(umurMaxStr, 10) : undefined;
  if (
    (umurMin !== undefined && Number.isFinite(umurMin)) ||
    (umurMax !== undefined && Number.isFinite(umurMax))
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const t: { gte?: Date; lte?: Date } = {};
    if (umurMax !== undefined && Number.isFinite(umurMax) && umurMax >= 0) {
      const min = new Date(today);
      min.setFullYear(min.getFullYear() - umurMax - 1);
      t.gte = new Date(min.getTime() + 24 * 60 * 60 * 1000);
    }
    if (umurMin !== undefined && Number.isFinite(umurMin) && umurMin >= 0) {
      const max = new Date(today);
      max.setFullYear(max.getFullYear() - umurMin);
      t.lte = max;
    }
    where.tanggalLahir = t;
  }
  return where;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function calcAge(tanggalLahir: Date | null): number | null {
  if (!tanggalLahir) return null;
  const today = new Date();
  let age = today.getFullYear() - tanggalLahir.getFullYear();
  const m = today.getMonth() - tanggalLahir.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < tanggalLahir.getDate())) age -= 1;
  return age;
}

async function fetchJemaatForExport(where: any) {
  return prisma.jemaat.findMany({
    where,
    orderBy: { namaLengkap: 'asc' },
    include: {
      cabang: { select: { nama: true } },
      jemaatRoles: {
        where: { isActive: true },
        select: {
          role: { select: { nama: true } },
          subRole: { select: { nama: true } },
          subRoleStatus: { select: { nama: true } },
        },
      },
      homecellMembership: {
        where: { isActive: true },
        select: {
          homecell: {
            select: {
              nama: true,
              area: { select: { nama: true } },
            },
          },
        },
        take: 3,
      },
      jemaatPelayanan: {
        where: { isActive: true },
        select: {
          pelayanan: { select: { nama: true } },
          pelayananRole: { select: { nama: true } },
        },
        take: 3,
      },
      user: { select: { lastLoginAt: true } },
    },
  });
}

// ============================================================
//  GET /admin/jemaat/duplicates
//  Scan 3 strategi: noHp, email, nama+tanggalLahir.
//  Return array of groups, each dgn 2+ jemaat yg match + lastLoginAt.
// ============================================================
jemaatRouter.get('/duplicates', async (_req, res) => {
  const include = {
    cabang: { select: { id: true, nama: true } },
    user: { select: { lastLoginAt: true } },
  };

  // Strategy 1: duplicate noHp (ignore null + empty)
  const noHpGroups = await prisma.jemaat.groupBy({
    by: ['noHp'],
    where: { noHp: { not: null } },
    _count: { _all: true },
    having: { noHp: { _count: { gt: 1 } } },
  });
  const noHpDup = await Promise.all(
    noHpGroups.map(async (g) => {
      if (!g.noHp) return null;
      const jemaats = await prisma.jemaat.findMany({
        where: { noHp: g.noHp },
        orderBy: { createdAt: 'asc' },
        include,
      });
      return { strategy: 'noHp' as const, value: g.noHp, jemaats };
    }),
  );

  // Strategy 2: duplicate email (ignore null + empty)
  const emailGroups = await prisma.jemaat.groupBy({
    by: ['email'],
    where: { email: { not: null } },
    _count: { _all: true },
    having: { email: { _count: { gt: 1 } } },
  });
  const emailDup = await Promise.all(
    emailGroups.map(async (g) => {
      if (!g.email) return null;
      const jemaats = await prisma.jemaat.findMany({
        where: { email: g.email },
        orderBy: { createdAt: 'asc' },
        include,
      });
      return { strategy: 'email' as const, value: g.email, jemaats };
    }),
  );

  // Strategy 3: duplicate namaLengkap + tanggalLahir (require both non-null)
  const nameGroups = await prisma.jemaat.groupBy({
    by: ['namaLengkap', 'tanggalLahir'],
    where: { tanggalLahir: { not: null } },
    _count: { _all: true },
    having: { namaLengkap: { _count: { gt: 1 } } },
  });
  const nameDup = await Promise.all(
    nameGroups.map(async (g) => {
      if (!g.tanggalLahir) return null;
      const jemaats = await prisma.jemaat.findMany({
        where: { namaLengkap: g.namaLengkap, tanggalLahir: g.tanggalLahir },
        orderBy: { createdAt: 'asc' },
        include,
      });
      return {
        strategy: 'nameAndDob' as const,
        value: `${g.namaLengkap} / ${g.tanggalLahir.toISOString().slice(0, 10)}`,
        jemaats,
      };
    }),
  );

  const groups = [
    ...noHpDup.filter((g): g is NonNullable<typeof g> => g !== null),
    ...emailDup.filter((g): g is NonNullable<typeof g> => g !== null),
    ...nameDup.filter((g): g is NonNullable<typeof g> => g !== null),
  ];

  res.json({
    success: true,
    data: {
      groups,
      summary: {
        total: groups.length,
        byNoHp: noHpDup.filter(Boolean).length,
        byEmail: emailDup.filter(Boolean).length,
        byNameAndDob: nameDup.filter(Boolean).length,
      },
    },
  });
});

jemaatRouter.get('/export', async (req, res) => {
  const format = (getQueryString(req, 'format') ?? 'csv').toLowerCase();
  const where = buildJemaatWhereFromQuery(req);
  const rows = await fetchJemaatForExport(where);

  const dataRows = rows.map((r: any) => {
    const roles = (r.jemaatRoles ?? [])
      .map((jr: any) =>
        jr.subRoleStatus
          ? `${jr.role.nama} → ${jr.subRole.nama} → ${jr.subRoleStatus.nama}`
          : `${jr.role.nama} → ${jr.subRole.nama}`,
      )
      .join('; ');
    const homecells = (r.homecellMembership ?? [])
      .map((hm: any) => hm.homecell.nama)
      .join('; ');
    const areas = Array.from(
      new Set(
        (r.homecellMembership ?? [])
          .map((hm: any) => hm.homecell.area?.nama)
          .filter(Boolean),
      ),
    ).join('; ');
    const ministries = (r.jemaatPelayanan ?? [])
      .map((jp: any) => `${jp.pelayanan.nama} (${jp.pelayananRole.nama})`)
      .join('; ');
    return {
      kode: r.kode ?? '',
      namaLengkap: r.namaLengkap ?? '',
      jenisKelamin: r.jenisKelamin ?? '',
      usia: calcAge(r.tanggalLahir) ?? '',
      noHp: r.noHp ?? '',
      email: r.email ?? '',
      alamat: r.alamat ?? '',
      cabang: r.cabang?.nama ?? '',
      roles,
      homecellArea: areas,
      homecell: homecells,
      ministry: ministries,
      status: r.isActive ? 'Aktif' : 'Nonaktif',
      tanggalBergabung: r.tanggalBergabung
        ? new Date(r.tanggalBergabung).toISOString().slice(0, 10)
        : '',
      lastLogin: r.user?.lastLoginAt
        ? new Date(r.user.lastLoginAt).toISOString().slice(0, 19).replace('T', ' ')
        : 'Belum pernah login',
    };
  });

  const HEADERS = [
    'Kode',
    'Nama Lengkap',
    'L/P',
    'Usia',
    'No HP',
    'Email',
    'Alamat',
    'Cabang',
    'Role',
    'Homecell Area',
    'Homecell',
    'Ministry',
    'Status',
    'Tanggal Bergabung',
    'Last Login',
  ];
  const KEYS: (keyof (typeof dataRows)[number])[] = [
    'kode',
    'namaLengkap',
    'jenisKelamin',
    'usia',
    'noHp',
    'email',
    'alamat',
    'cabang',
    'roles',
    'homecellArea',
    'homecell',
    'ministry',
    'status',
    'tanggalBergabung',
    'lastLogin',
  ];
  const timestamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv' || format === 'excel' || format === 'xlsx') {
    // UTF-8 BOM supaya Excel auto-detect encoding
    const bom = '﻿';
    const lines = [
      HEADERS.map(csvEscape).join(','),
      ...dataRows.map((row) => KEYS.map((k) => csvEscape(row[k])).join(',')),
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="jemaat-${timestamp}.csv"`);
    return res.send(bom + lines.join('\n'));
  }

  if (format === 'pdf' || format === 'html' || format === 'print') {
    // Server-side HTML print-view — user Ctrl+P → save as PDF.
    const tableBody = dataRows
      .map(
        (row) => `
<tr>
  <td>${escapeHtml(row.kode)}</td>
  <td>${escapeHtml(row.namaLengkap)}</td>
  <td>${escapeHtml(String(row.jenisKelamin))}</td>
  <td>${escapeHtml(String(row.usia))}</td>
  <td>${escapeHtml(row.noHp)}</td>
  <td>${escapeHtml(row.cabang)}</td>
  <td>${escapeHtml(row.homecellArea)}</td>
  <td>${escapeHtml(row.homecell)}</td>
  <td>${escapeHtml(row.ministry)}</td>
  <td>${escapeHtml(row.status)}</td>
</tr>`,
      )
      .join('');
    const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Daftar Jemaat — ${timestamp}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10px; color: #0f172a; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
  thead { background: #f1f5f9; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .footer { font-size: 10px; color: #94a3b8; margin-top: 10px; text-align: right; }
  @media print { .noprint { display: none; } }
  .noprint { padding: 10px; background: #fff7ed; border-bottom: 1px solid #fed7aa; }
  .noprint button { padding: 6px 12px; background: #ea580c; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
</style>
</head><body>
<div class="noprint">
  <strong>Print Preview — Daftar Jemaat</strong>
  &nbsp;·&nbsp; Tekan <kbd>Ctrl/Cmd + P</kbd> untuk simpan sebagai PDF.
  <button onclick="window.print()">Print / Save as PDF</button>
</div>
<div style="padding: 10mm;">
<h1>Daftar Jemaat ECC</h1>
<div class="meta">Total ${dataRows.length} jemaat · Export ${timestamp}</div>
<table>
<thead>
<tr>
  <th>Kode</th><th>Nama</th><th>L/P</th><th>Usia</th><th>No HP</th>
  <th>Cabang</th><th>Homecell Area</th><th>Homecell</th><th>Ministry</th><th>Status</th>
</tr>
</thead>
<tbody>${tableBody}</tbody>
</table>
<div class="footer">© ${new Date().getFullYear()} Elshaddai Creative Community</div>
</div>
</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }

  throw BadRequest('Format tidak dikenali. Pakai format=csv atau format=pdf.');
});

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
      user: { select: { lastLoginAt: true } },
    },
  });
  if (!item) throw NotFound('Jemaat tidak ditemukan');
  res.json({ success: true, data: item });
});

// ============================================================
//  GET /admin/jemaat/:id/profile — aggregated detail (homecell + event +
//  ibadah + group + business). Dipakai halaman detail jemaat untuk render
//  semua history dalam satu request.
// ============================================================
jemaatRouter.get('/:id/profile', async (req, res) => {
  const jemaatId = req.params.id;

  const jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { id: true, namaLengkap: true },
  });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');

  const [homecells, events, reservasi, groups, businesses, visits] = await Promise.all([
    // Homecell memberships + aggregate attendance summary
    prisma.homecellMember.findMany({
      where: { jemaatId },
      orderBy: { tanggalBergabung: 'desc' },
      include: {
        homecell: {
          select: {
            id: true,
            nama: true,
            area: { select: { id: true, nama: true } },
          },
        },
      },
    }),
    // Event history
    prisma.eventParticipation.findMany({
      where: { jemaatId },
      orderBy: { registeredAt: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        registeredAt: true,
        attendedAt: true,
        paidAt: true,
        cancelledAt: true,
        nominalBayar: true,
        event: {
          select: {
            id: true,
            slug: true,
            judul: true,
            tanggalMulai: true,
            tanggalSelesai: true,
            lokasi: true,
            tipeBayar: true,
          },
        },
      },
    }),
    // Ibadah history (via Reservasi)
    prisma.reservasi.findMany({
      where: { jemaatId },
      orderBy: { tanggalIbadah: 'desc' },
      take: 100,
      select: {
        id: true,
        status: true,
        tanggalIbadah: true,
        reservedAt: true,
        joinedAt: true,
        cancelledAt: true,
        ibadah: {
          select: { id: true, nama: true, jamMulai: true, lokasi: true },
        },
      },
    }),
    // Group memberships
    prisma.groupMember.findMany({
      where: { jemaatId },
      orderBy: { tanggalBergabung: 'desc' },
      include: {
        group: {
          select: {
            id: true,
            nama: true,
            jenis: true,
            cabang: { select: { nama: true } },
          },
        },
      },
    }),
    // Local businesses
    prisma.localBusiness.findMany({
      where: { ownerJemaatId: jemaatId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nama: true,
        industri: true,
        tipeBisnis: true,
        isActive: true,
        createdAt: true,
      },
    }),
    // Visit history — baik sebagai initiator maupun target
    prisma.visit.findMany({
      where: {
        OR: [{ initiatorJemaatId: jemaatId }, { targetJemaatId: jemaatId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        initiator: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        target: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      },
    }),
  ]);

  // Attendance per homecell — HomecellAttendance records = present only.
  // Count total scans + last attended per homecell.
  const homecellIds = homecells.map((h) => h.homecellId);
  const attendanceRows = homecellIds.length
    ? await prisma.homecellAttendance.findMany({
        where: {
          jemaatId,
        },
        orderBy: { scannedAt: 'desc' },
        select: {
          id: true,
          scannedAt: true,
          source: true,
          scheduleId: true,
          schedule: {
            select: {
              id: true,
              homecellId: true,
              tanggal: true,
            },
          },
        },
        take: 500,
      })
    : [];

  const attendanceByHomecell = new Map<
    string,
    { total: number; last: string | null; history: typeof attendanceRows }
  >();
  for (const row of attendanceRows) {
    const hcId = row.schedule?.homecellId;
    if (!hcId) continue;
    const cur = attendanceByHomecell.get(hcId) ?? {
      total: 0,
      last: null,
      history: [],
    };
    cur.total += 1;
    if (!cur.last) cur.last = row.scannedAt.toISOString();
    cur.history.push(row);
    attendanceByHomecell.set(hcId, cur);
  }

  const homecellsWithAttendance = homecells.map((hm) => {
    const att = attendanceByHomecell.get(hm.homecellId);
    return {
      ...hm,
      attendance: {
        totalHadir: att?.total ?? 0,
        lastAttended: att?.last ?? null,
        recentHistory: (att?.history ?? []).slice(0, 10),
      },
    };
  });

  res.json({
    success: true,
    data: {
      homecells: homecellsWithAttendance,
      events,
      ibadah: reservasi,
      groups,
      businesses,
      visits,
    },
  });
});

// ============================================================
//  GET /admin/jemaat/:id/export?format=pdf
//  Print-view HTML — user Ctrl+P → save as PDF.
// ============================================================
jemaatRouter.get('/:id/export', async (req, res) => {
  const format = (getQueryString(req, 'format') ?? 'pdf').toLowerCase();
  const jemaatId = req.params.id;

  const j = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    include: {
      cabang: true,
      jemaatRoles: {
        where: { isActive: true },
        include: { role: true, subRole: true, subRoleStatus: true },
      },
      jemaatPelayanan: {
        where: { isActive: true },
        include: { pelayanan: true, pelayananRole: true },
      },
      homecellMembership: {
        include: { homecell: { include: { area: true } } },
      },
      user: { select: { lastLoginAt: true } },
    },
  });
  if (!j) throw NotFound('Jemaat tidak ditemukan');

  const [events, reservasi, groups, businesses, visits] = await Promise.all([
    prisma.eventParticipation.findMany({
      where: { jemaatId },
      orderBy: { registeredAt: 'desc' },
      take: 50,
      include: { event: { select: { judul: true, tanggalMulai: true, lokasi: true } } },
    }),
    prisma.reservasi.findMany({
      where: { jemaatId },
      orderBy: { tanggalIbadah: 'desc' },
      take: 50,
      include: { ibadah: { select: { nama: true, jamMulai: true, lokasi: true } } },
    }),
    prisma.groupMember.findMany({
      where: { jemaatId },
      include: { group: { select: { nama: true, jenis: true } } },
    }),
    prisma.localBusiness.findMany({
      where: { ownerJemaatId: jemaatId },
      select: { nama: true, industri: true, tipeBisnis: true, isActive: true, createdAt: true },
    }),
    prisma.visit.findMany({
      where: { OR: [{ initiatorJemaatId: jemaatId }, { targetJemaatId: jemaatId }] },
      orderBy: { tanggalVisit: 'desc' },
      take: 50,
      include: {
        initiator: { select: { id: true, namaLengkap: true } },
        target: { select: { id: true, namaLengkap: true } },
      },
    }),
  ]);

  if (format === 'csv') {
    throw BadRequest('CSV export belum didukung untuk detail jemaat. Pakai format=pdf.');
  }

  const fmtDate = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Profil Jemaat — ${escapeHtml(j.namaLengkap)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: -apple-system, "Segoe UI", sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 10mm; }
  h1 { font-size: 20px; margin: 0 0 2px; color: #0f172a; }
  h2 { font-size: 13px; margin: 18px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #ea580c; color: #ea580c; }
  .meta { color: #64748b; font-size: 11px; }
  table { border-collapse: collapse; width: 100%; margin-top: 4px; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; vertical-align: top; }
  thead { background: #fff7ed; font-weight: 600; }
  tbody tr:nth-child(even) { background: #fafafa; }
  .grid { display: grid; grid-template-columns: 160px 1fr; gap: 4px 12px; margin-top: 8px; }
  .label { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
  .value { color: #0f172a; }
  .badge { display: inline-block; padding: 1px 6px; background: #fed7aa; color: #9a3412; border-radius: 3px; font-size: 10px; margin-right: 3px; }
  .empty { color: #94a3b8; font-style: italic; }
  @media print { .noprint { display: none; } }
  .noprint { padding: 10px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; margin-bottom: 15px; }
  .noprint button { padding: 6px 12px; background: #ea580c; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
</style></head><body>
<div class="noprint">
  <strong>Print Preview — Profil Jemaat ${escapeHtml(j.namaLengkap)}</strong>
  &nbsp;·&nbsp; Tekan <kbd>Ctrl/Cmd + P</kbd> untuk simpan sebagai PDF.
  <button onclick="window.print()">Print / Save as PDF</button>
</div>

<h1>${escapeHtml(j.namaLengkap)}</h1>
<div class="meta">
  ${j.kode ? `Kode <strong>${escapeHtml(j.kode)}</strong> · ` : ''}
  ${j.cabang?.nama ? escapeHtml(j.cabang.nama) + ' · ' : ''}
  ${j.isActive ? 'Aktif' : 'Nonaktif'}
</div>

<h2>Data Pribadi</h2>
<div class="grid">
  <div class="label">No HP</div><div class="value">${escapeHtml(j.noHp ?? '-')}</div>
  <div class="label">Email</div><div class="value">${escapeHtml(j.email ?? '-')}</div>
  <div class="label">Jenis Kelamin</div><div class="value">${j.jenisKelamin === 'L' ? 'Laki-laki' : j.jenisKelamin === 'P' ? 'Perempuan' : '-'}</div>
  <div class="label">Tanggal Lahir</div><div class="value">${fmtDate(j.tanggalLahir)}</div>
  <div class="label">Alamat</div><div class="value">${escapeHtml(j.alamat ?? '-')}</div>
  <div class="label">Tgl Bergabung</div><div class="value">${fmtDate(j.tanggalBergabung)}</div>
  <div class="label">Last Login</div><div class="value">${j.user?.lastLoginAt ? new Date(j.user.lastLoginAt).toLocaleString('id-ID') : '<span class="empty">Belum pernah login</span>'}</div>
</div>

<h2>Role & Pelayanan</h2>
${
  j.jemaatRoles.length === 0 && j.jemaatPelayanan.length === 0
    ? '<p class="empty">Belum ada role atau pelayanan.</p>'
    : `
<div>
  ${j.jemaatRoles.map((r: any) => `<span class="badge">${escapeHtml(r.role.nama)} → ${escapeHtml(r.subRole.nama)}${r.subRoleStatus ? ` → ${escapeHtml(r.subRoleStatus.nama)}` : ''}</span>`).join(' ')}
  ${j.jemaatPelayanan.map((p: any) => `<span class="badge" style="background:#d1fae5;color:#065f46;">${escapeHtml(p.pelayanan.nama)} (${escapeHtml(p.pelayananRole.nama)})</span>`).join(' ')}
</div>`
}

<h2>Homecell (${j.homecellMembership.length})</h2>
${
  j.homecellMembership.length === 0
    ? '<p class="empty">Belum tergabung di homecell.</p>'
    : `<table><thead><tr><th>Homecell</th><th>Area</th><th>Bergabung</th><th>Status</th></tr></thead><tbody>
      ${j.homecellMembership.map((h: any) => `<tr><td>${escapeHtml(h.homecell.nama)}</td><td>${escapeHtml(h.homecell.area?.nama ?? '-')}</td><td>${fmtDate(h.tanggalBergabung)}</td><td>${h.isActive ? 'Aktif' : 'Nonaktif'}</td></tr>`).join('')}
      </tbody></table>`
}

<h2>History Event (${events.length})</h2>
${
  events.length === 0
    ? '<p class="empty">Belum pernah daftar event.</p>'
    : `<table><thead><tr><th>Event</th><th>Tanggal</th><th>Lokasi</th><th>Status</th></tr></thead><tbody>
      ${events.map((e: any) => `<tr><td>${escapeHtml(e.event.judul)}</td><td>${fmtDate(e.event.tanggalMulai)}</td><td>${escapeHtml(e.event.lokasi ?? '-')}</td><td>${escapeHtml(e.status)}</td></tr>`).join('')}
      </tbody></table>`
}

<h2>History Ibadah (${reservasi.length})</h2>
${
  reservasi.length === 0
    ? '<p class="empty">Belum pernah reservasi ibadah.</p>'
    : `<table><thead><tr><th>Ibadah</th><th>Tanggal</th><th>Jam</th><th>Status</th></tr></thead><tbody>
      ${reservasi.map((r: any) => `<tr><td>${escapeHtml(r.ibadah.nama)}</td><td>${fmtDate(r.tanggalIbadah)}</td><td>${escapeHtml(r.ibadah.jamMulai ?? '-')}</td><td>${escapeHtml(r.status)}</td></tr>`).join('')}
      </tbody></table>`
}

<h2>Group / Komunitas (${groups.length})</h2>
${
  groups.length === 0
    ? '<p class="empty">Belum tergabung di group.</p>'
    : `<table><thead><tr><th>Group</th><th>Jenis</th><th>Bergabung</th><th>Status</th></tr></thead><tbody>
      ${groups.map((g: any) => `<tr><td>${escapeHtml(g.group.nama)}</td><td>${escapeHtml(g.group.jenis ?? '-')}</td><td>${fmtDate(g.tanggalBergabung)}</td><td>${g.isActive ? 'Aktif' : 'Nonaktif'}</td></tr>`).join('')}
      </tbody></table>`
}

<h2>History Visit (${visits.length})</h2>
${
  visits.length === 0
    ? '<p class="empty">Belum ada riwayat visit.</p>'
    : `<table><thead><tr><th>Judul</th><th>Dengan</th><th>Peran</th><th>Lokasi</th><th>Tanggal</th></tr></thead><tbody>
      ${visits.map((v: any) => {
        const isInit = v.initiatorJemaatId === jemaatId;
        const other = isInit ? v.target : v.initiator;
        return `<tr><td>${escapeHtml(v.judul)}</td><td>${escapeHtml(other.namaLengkap)}</td><td>${isInit ? 'Mengunjungi' : 'Dikunjungi'}</td><td>${escapeHtml(v.lokasi ?? '-')}</td><td>${fmtDate(v.tanggalVisit)}</td></tr>`;
      }).join('')}
      </tbody></table>`
}

<h2>Local Market (${businesses.length})</h2>
${
  businesses.length === 0
    ? '<p class="empty">Belum terdaftar sebagai pemilik bisnis.</p>'
    : `<table><thead><tr><th>Bisnis</th><th>Tipe</th><th>Industri</th><th>Terdaftar</th><th>Status</th></tr></thead><tbody>
      ${businesses.map((b: any) => `<tr><td>${escapeHtml(b.nama)}</td><td>${escapeHtml(b.tipeBisnis)}</td><td>${escapeHtml(b.industri ?? '-')}</td><td>${fmtDate(b.createdAt)}</td><td>${b.isActive ? 'Aktif' : 'Nonaktif'}</td></tr>`).join('')}
      </tbody></table>`
}

<p style="color:#94a3b8;font-size:9px;margin-top:20px;text-align:right;">
  © ${new Date().getFullYear()} Elshaddai Creative Community · Export ${new Date().toLocaleDateString('id-ID')}
</p>
</body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
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
