/**
 * Tamu (portal) — /admin/tamu
 *
 *   GET   /       → daftar tamu (pernah diundang / walk-in) + pengundang,
 *                   kehadiran, status efektif. ?status=&cabangId=&search=&page=
 *   GET   /summary→ jumlah per status
 *   PATCH /:id    → { status?, catatan? } ubah status tindak lanjut
 *
 * Tamu = jemaat isTamu ATAU pernah ditambahkan sebagai tamu oleh jemaat lain
 * (supaya yang sudah daftar Els App tetap terlacak sebagai "Sudah terdaftar").
 * Akses: fulltimer, atau menu "tamu" (read / write).
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { z } from 'zod';
import { Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { resolveJemaatAccess } from '../../lib/menu-access.js';
import {
  TAMU_STATUSES,
  TAMU_STATUS_LABEL,
  effectiveTamuStatus,
  tamuAttendance,
  type TamuStatus,
} from '../../lib/tamu-status.js';

export const tamuRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertAccess(req: Request, level: 'read' | 'write') {
  if (!req.user) throw Unauthorized();
  if (req.user.isFulltimer) return;
  const m = (await resolveJemaatAccess(req.user.jemaatId)).menuAccess['tamu'];
  if (!(level === 'read' ? m?.canRead : m?.canWrite)) throw Forbidden('Anda tidak punya akses ke menu Tamu.');
}

async function loadTamu(req: Request) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const cabangId = typeof req.query.cabangId === 'string' && UUID_RE.test(req.query.cabangId) ? req.query.cabangId : undefined;
  const where: Prisma.JemaatWhereInput = {
    OR: [{ isTamu: true }, { diundangSebagaiTamu: { some: {} } }],
    ...(cabangId ? { cabangId } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { namaLengkap: { contains: search, mode: 'insensitive' } },
                { noHp: { contains: search.replace(/\D/g, '') || search } },
                { diundangSebagaiTamu: { some: { inviter: { namaLengkap: { contains: search, mode: 'insensitive' } } } } },
              ],
            },
          ],
        }
      : {}),
  };
  const rows = await prisma.jemaat.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: {
      id: true,
      namaLengkap: true,
      noHp: true,
      kode: true,
      isTamu: true,
      createdAt: true,
      tamuStatus: true,
      tamuStatusUpdatedAt: true,
      tamuCatatan: true,
      cabang: { select: { id: true, nama: true } },
      diundangSebagaiTamu: {
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, inviter: { select: { id: true, namaLengkap: true, noHp: true } } },
      },
    },
  });
  const att = await tamuAttendance(rows.map((r) => r.id));
  return rows.map((r) => {
    const a = att.get(r.id);
    const status = effectiveTamuStatus({ stored: r.tamuStatus, isTamu: r.isTamu, hasAttended: !!a?.kehadiran });
    return {
      id: r.id,
      namaLengkap: r.namaLengkap,
      noHp: r.noHp,
      kode: r.kode,
      isTamu: r.isTamu,
      cabang: r.cabang,
      pertamaDicatat: r.diundangSebagaiTamu[0]?.createdAt ?? r.createdAt,
      pengundang: r.diundangSebagaiTamu.map((x) => ({ ...x.inviter, sejak: x.createdAt })),
      kehadiran: a?.kehadiran ?? 0,
      terakhirHadir: a?.terakhirHadir ?? null,
      status,
      statusLabel: TAMU_STATUS_LABEL[status],
      statusTersimpan: r.tamuStatus,
      statusDiubah: r.tamuStatusUpdatedAt,
      catatan: r.tamuCatatan,
    };
  });
}

tamuRouter.get('/', async (req, res) => {
  await assertAccess(req, 'read');
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const all = await loadTamu(req);
  const counts = Object.fromEntries(TAMU_STATUSES.map((s) => [s, all.filter((x) => x.status === s).length])) as Record<TamuStatus, number>;
  const filtered = (TAMU_STATUSES as readonly string[]).includes(status) ? all.filter((x) => x.status === status) : all;
  res.json({
    success: true,
    data: filtered.slice((page - 1) * limit, page * limit),
    meta: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / limit),
      counts,
      totalAll: all.length,
      statusOptions: TAMU_STATUSES.map((s) => ({ value: s, label: TAMU_STATUS_LABEL[s] })),
    },
  });
});

const patchSchema = z.object({
  status: z.enum(TAMU_STATUSES).optional(),
  catatan: z.string().trim().max(2000).nullish(),
});

tamuRouter.patch('/:id', async (req, res) => {
  await assertAccess(req, 'write');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Tamu tidak ditemukan');
  const input = patchSchema.parse(req.body ?? {});
  const before = await prisma.jemaat.findUnique({
    where: { id: req.params.id },
    select: { id: true, namaLengkap: true, tamuStatus: true, tamuCatatan: true },
  });
  if (!before) throw NotFound('Tamu tidak ditemukan');
  const data: Prisma.JemaatUpdateInput = {};
  if (input.status) {
    data.tamuStatus = input.status;
    data.tamuStatusUpdatedAt = new Date();
    data.tamuStatusUpdatedById = req.user!.jemaatId;
  }
  if (input.catatan !== undefined) data.tamuCatatan = input.catatan || null;
  const updated = await prisma.jemaat.update({
    where: { id: before.id },
    data,
    select: { id: true, tamuStatus: true, tamuCatatan: true, tamuStatusUpdatedAt: true },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'tamu_status',
    resourceId: before.id,
    resourceLabel: `Tamu ${before.namaLengkap}: ${before.tamuStatus ?? 'DIUNDANG'} → ${updated.tamuStatus ?? 'DIUNDANG'}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});
