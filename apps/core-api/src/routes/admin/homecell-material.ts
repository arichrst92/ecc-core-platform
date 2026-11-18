/**
 * Homecell Material (2026-11)
 *
 * Portal (menu 'homecell-material'):
 *   GET    /admin/homecell-material?cabangId=&bulan=YYYY-MM&status=&search=
 *   POST   /admin/homecell-material            multipart: file + judul, keterangan?, berlakuMulai,
 *                                               berlakuSampai?, cabangIds (JSON), isPublished, notifyLeaders
 *   PATCH  /admin/homecell-material/:id        multipart (file opsional = ganti file)
 *   DELETE /admin/homecell-material/:id
 *
 * App (Pastor zona / Zone Leader / PIC / Asisten):
 *   GET    /admin/me/homecell-material         → { isLeader, current[], previous[], newCount }
 *   POST   /admin/me/homecell-material/:id/open → catat unduhan + { fileUrl }
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flexMaterialUpload, materialExt, MATERIAL_TYPES } from '../../lib/material-upload.js';
import { deleteHomecellMaterialFile, saveHomecellMaterialFile } from '../../lib/storage.js';
import {
  dispatchHomecellMaterialNotifications,
  isCurrent,
  leaderScope,
  materialStatus,
  todayYmd,
  visibleWhere,
} from '../../lib/homecell-material.js';
import { logger } from '../../lib/logger.js';

export const homecellMaterialRouter = Router();
export const meHomecellMaterialRouter = Router();

const MAX_BYTES = 20 * 1024 * 1024; // sama dengan batas nginx API (client_max_body_size 20M)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const boolish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');
const cabangIdsField = z
  .union([z.array(z.string()), z.string()])
  .transform((v) => {
    if (Array.isArray(v)) return v;
    const t = v.trim();
    if (!t) return [];
    try {
      const j = JSON.parse(t);
      return Array.isArray(j) ? j.map(String) : [];
    } catch {
      return t.split(',').map((x) => x.trim()).filter(Boolean);
    }
  })
  .pipe(z.array(z.string().regex(UUID_RE, 'Cabang tidak valid')).max(100));

const baseSchema = z.object({
  judul: z.string().trim().min(3, 'Judul minimal 3 karakter').max(200),
  keterangan: z.string().trim().max(2000).optional().transform((v) => v || null),
  berlakuMulai: ymd,
  berlakuSampai: z.union([ymd, z.literal('')]).optional().transform((v) => v || null),
  cabangIds: cabangIdsField.optional().default([]),
  isPublished: boolish.optional().default(true),
  notifyLeaders: boolish.optional().default(true),
});

const select = {
  id: true,
  judul: true,
  keterangan: true,
  fileUrl: true,
  fileMime: true,
  fileName: true,
  fileSize: true,
  berlakuMulai: true,
  berlakuSampai: true,
  isPublished: true,
  notifyLeaders: true,
  notifiedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, namaLengkap: true } },
  cabangs: { select: { cabang: { select: { id: true, nama: true } } } },
  _count: { select: { downloads: true } },
} satisfies Prisma.HomecellMaterialSelect;

type Row = Prisma.HomecellMaterialGetPayload<{ select: typeof select }>;
const ymdOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function toDto(r: Row) {
  const { cabangs, _count, berlakuMulai, berlakuSampai, ...rest } = r;
  return {
    ...rest,
    berlakuMulai: ymdOf(berlakuMulai),
    berlakuSampai: ymdOf(berlakuSampai),
    status: materialStatus({ isPublished: r.isPublished, berlakuMulai }),
    cabangs: cabangs.map((c) => c.cabang),
    semuaCabang: cabangs.length === 0,
    downloads: _count.downloads,
  };
}

function checkRange(mulai: string, sampai: string | null) {
  if (sampai && sampai < mulai) throw BadRequest('Tanggal "sampai" tidak boleh sebelum tanggal mulai.');
}

async function assertCabangs(ids: string[]) {
  if (!ids.length) return;
  const n = await prisma.cabangGereja.count({ where: { id: { in: ids } } });
  if (n !== new Set(ids).size) throw BadRequest('Ada cabang yang tidak ditemukan.');
}

/** Kirim notifikasi (bila sudah waktunya) tanpa menahan respons. */
function kickNotifications() {
  void dispatchHomecellMaterialNotifications().catch((e) =>
    logger.warn({ err: (e as Error).message }, '[homecell-material] notifikasi gagal'),
  );
}

// ============================================================ Portal
homecellMaterialRouter.get('/', requireMenu('homecell-material', 'read'), async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: Prisma.HomecellMaterialWhereInput = {};
  const and: Prisma.HomecellMaterialWhereInput[] = [];
  if (q.cabangId && UUID_RE.test(q.cabangId)) {
    // Materi untuk cabang ini = ditujukan ke cabang ini ATAU semua cabang.
    and.push({ OR: [{ cabangs: { none: {} } }, { cabangs: { some: { cabangId: q.cabangId } } }] });
  }
  if (q.bulan && /^\d{4}-\d{2}$/.test(q.bulan)) {
    const [y, m] = q.bulan.split('-').map(Number) as [number, number];
    and.push({ berlakuMulai: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } });
  }
  const today = todayYmd();
  if (q.status === 'DRAFT') and.push({ isPublished: false });
  if (q.status === 'TERJADWAL') and.push({ isPublished: true, berlakuMulai: { gt: today } });
  if (q.status === 'TERBIT') and.push({ isPublished: true, berlakuMulai: { lte: today } });
  if (q.search?.trim()) {
    const s = q.search.trim();
    and.push({ OR: [{ judul: { contains: s, mode: 'insensitive' } }, { keterangan: { contains: s, mode: 'insensitive' } }] });
  }
  if (and.length) where.AND = and;
  const rows = await prisma.homecellMaterial.findMany({
    where,
    orderBy: [{ berlakuMulai: 'desc' }, { createdAt: 'desc' }],
    take: 500,
    select,
  });
  res.json({ success: true, data: rows.map(toDto) });
});

homecellMaterialRouter.post('/', requireMenu('homecell-material', 'write'), flexMaterialUpload(MAX_BYTES), async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = baseSchema.parse(req.body ?? {});
  checkRange(input.berlakuMulai, input.berlakuSampai);
  await assertCabangs(input.cabangIds);
  if (!req.file) throw BadRequest('File materi wajib diupload.');
  const ext = materialExt(req.file.originalname, req.file.mimetype);
  if (!ext) throw BadRequest('Tipe file tidak didukung.');

  const id = randomUUID();
  const fileUrl = await saveHomecellMaterialFile(id, ext, req.file.buffer);
  const created = await prisma.homecellMaterial.create({
    data: {
      id,
      judul: input.judul,
      keterangan: input.keterangan,
      fileUrl,
      fileMime: MATERIAL_TYPES[ext]!,
      fileName: req.file.originalname?.slice(0, 255) || null,
      fileSize: req.file.size,
      berlakuMulai: new Date(`${input.berlakuMulai}T00:00:00.000Z`),
      berlakuSampai: input.berlakuSampai ? new Date(`${input.berlakuSampai}T00:00:00.000Z`) : null,
      isPublished: input.isPublished,
      notifyLeaders: input.notifyLeaders,
      createdById: req.user.jemaatId ?? null,
      cabangs: { create: [...new Set(input.cabangIds)].map((cabangId) => ({ cabangId })) },
    },
    select,
  });
  audit(req, { action: 'CREATE', resource: 'homecell_material', resourceId: id, resourceLabel: created.judul });
  kickNotifications();
  res.status(201).json({ success: true, data: toDto(created) });
});

homecellMaterialRouter.patch('/:id', requireMenu('homecell-material', 'write'), flexMaterialUpload(MAX_BYTES), async (req, res) => {
  if (!UUID_RE.test(req.params.id ?? '')) throw NotFound('Materi tidak ditemukan');
  const before = await prisma.homecellMaterial.findUnique({ where: { id: req.params.id }, select });
  if (!before) throw NotFound('Materi tidak ditemukan');
  const input = baseSchema.partial().parse(req.body ?? {});
  const mulai = input.berlakuMulai ?? ymdOf(before.berlakuMulai)!;
  const sampai = input.berlakuSampai !== undefined ? input.berlakuSampai : ymdOf(before.berlakuSampai);
  checkRange(mulai, sampai);
  if (input.cabangIds) await assertCabangs(input.cabangIds);

  const data: Prisma.HomecellMaterialUpdateInput = {
    judul: input.judul,
    keterangan: input.keterangan,
    berlakuMulai: input.berlakuMulai ? new Date(`${input.berlakuMulai}T00:00:00.000Z`) : undefined,
    berlakuSampai: input.berlakuSampai !== undefined ? (input.berlakuSampai ? new Date(`${input.berlakuSampai}T00:00:00.000Z`) : null) : undefined,
    isPublished: input.isPublished,
    notifyLeaders: input.notifyLeaders,
  };
  let oldFile: string | null = null;
  if (req.file) {
    const ext = materialExt(req.file.originalname, req.file.mimetype);
    if (!ext) throw BadRequest('Tipe file tidak didukung.');
    data.fileUrl = await saveHomecellMaterialFile(before.id, ext, req.file.buffer);
    data.fileMime = MATERIAL_TYPES[ext]!;
    data.fileName = req.file.originalname?.slice(0, 255) || null;
    data.fileSize = req.file.size;
    oldFile = before.fileUrl;
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (input.cabangIds) {
      await tx.homecellMaterialCabang.deleteMany({ where: { materialId: before.id } });
      if (input.cabangIds.length) {
        await tx.homecellMaterialCabang.createMany({
          data: [...new Set(input.cabangIds)].map((cabangId) => ({ materialId: before.id, cabangId })),
        });
      }
    }
    return tx.homecellMaterial.update({ where: { id: before.id }, data, select });
  });
  if (oldFile) await deleteHomecellMaterialFile(oldFile).catch(() => {});
  audit(req, { action: 'UPDATE', resource: 'homecell_material', resourceId: before.id, resourceLabel: updated.judul });
  kickNotifications();
  res.json({ success: true, data: toDto(updated) });
});

homecellMaterialRouter.delete('/:id', requireMenu('homecell-material', 'delete'), async (req, res) => {
  if (!UUID_RE.test(req.params.id ?? '')) throw NotFound('Materi tidak ditemukan');
  const before = await prisma.homecellMaterial.findUnique({ where: { id: req.params.id }, select: { id: true, judul: true, fileUrl: true } });
  if (!before) throw NotFound('Materi tidak ditemukan');
  await prisma.homecellMaterial.delete({ where: { id: before.id } });
  await deleteHomecellMaterialFile(before.fileUrl).catch(() => {});
  audit(req, { action: 'DELETE', resource: 'homecell_material', resourceId: before.id, resourceLabel: before.judul });
  res.status(204).end();
});

// ============================================================ App (pemimpin)
meHomecellMaterialRouter.get('/', async (req, res) => {
  const jemaatId = req.user?.jemaatId;
  if (!jemaatId) throw Unauthorized();
  const scope = await leaderScope(jemaatId);
  if (!scope.cabangIds.length) {
    res.json({ success: true, data: { isLeader: false, roles: [], current: [], previous: [], newCount: 0 } });
    return;
  }
  const rows = await prisma.homecellMaterial.findMany({
    where: visibleWhere(scope.cabangIds),
    orderBy: [{ berlakuMulai: 'desc' }, { createdAt: 'desc' }],
    take: 300,
    select: {
      id: true,
      judul: true,
      keterangan: true,
      fileMime: true,
      fileName: true,
      fileSize: true,
      berlakuMulai: true,
      berlakuSampai: true,
      downloads: { where: { jemaatId }, select: { firstAt: true } },
    },
  });
  const items = rows.map(({ downloads, berlakuMulai, berlakuSampai, ...r }) => ({
    ...r,
    berlakuMulai: ymdOf(berlakuMulai),
    berlakuSampai: ymdOf(berlakuSampai),
    opened: downloads.length > 0,
    isCurrent: isCurrent({ berlakuMulai, berlakuSampai }),
  }));
  res.json({
    success: true,
    data: {
      isLeader: true,
      roles: scope.roles,
      current: items.filter((i) => i.isCurrent),
      previous: items.filter((i) => !i.isCurrent),
      newCount: items.filter((i) => !i.opened).length,
    },
  });
});

meHomecellMaterialRouter.post('/:id/open', async (req, res) => {
  const jemaatId = req.user?.jemaatId;
  if (!jemaatId) throw Unauthorized();
  if (!UUID_RE.test(req.params.id ?? '')) throw NotFound('Materi tidak ditemukan');
  const scope = await leaderScope(jemaatId);
  if (!scope.cabangIds.length) throw Forbidden('Materi homecell hanya untuk Pastor, Zone Leader, PIC, dan Asisten homecell.');
  const m = await prisma.homecellMaterial.findFirst({
    where: { id: req.params.id, ...visibleWhere(scope.cabangIds) },
    select: { id: true, fileUrl: true, fileName: true, fileMime: true },
  });
  if (!m) throw NotFound('Materi tidak ditemukan');
  await prisma.homecellMaterialDownload.upsert({
    where: { materialId_jemaatId: { materialId: m.id, jemaatId } },
    create: { materialId: m.id, jemaatId },
    update: { count: { increment: 1 }, lastAt: new Date() },
  });
  res.json({ success: true, data: { fileUrl: m.fileUrl, fileName: m.fileName, fileMime: m.fileMime } });
});
