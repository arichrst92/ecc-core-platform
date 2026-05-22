/**
 * Movement — Visit (mobile self-service endpoints).
 *
 * Sub-router yang di-mount di /admin/me/visits. Semua endpoint operate
 * terhadap jemaat current (req.user.jemaatId) sebagai initiator atau target.
 *
 * Cakupan:
 *   - GET    /admin/me/visits                  → list visit yang melibatkan saya
 *   - POST   /admin/me/visits                  → create via scan QR kode
 *   - GET    /admin/me/visits/:id              → detail (harus peserta)
 *   - PATCH  /admin/me/visits/:id              → edit judul/lokasi (initiator-only)
 *   - PATCH  /admin/me/visits/:id/note         → edit own note (initiator OR target)
 *   - DELETE /admin/me/visits/:id              → batal/hapus visit (initiator-only,
 *                                                 dalam window 1 jam pasca create)
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createVisitSchema,
  updateVisitMetaSchema,
  updateVisitNoteSchema,
  myVisitsQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const meVisitRouter = Router();

// Selectors konsisten — peserta lawan ditampilkan via field `lawan` di response.
const jemaatLite = {
  id: true,
  namaLengkap: true,
  fotoUrl: true,
  noHp: true,
  cabang: { select: { id: true, nama: true } },
} as const;

function assertJemaatId(req: Parameters<Parameters<typeof meVisitRouter.get>[1]>[0]): string {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

/**
 * Bentuk response yang disesuaikan dari sisi caller: ekspos peserta lawan
 * dan flag apakah caller adalah initiator. UI mobile bisa langsung pakai.
 */
function shapeForCaller(visit: any, myJemaatId: string) {
  const iAmInitiator = visit.initiatorJemaatId === myJemaatId;
  const lawan = iAmInitiator ? visit.target : visit.initiator;
  const myNote = iAmInitiator ? visit.noteDariInitiator : visit.noteDariTarget;
  const noteLawan = iAmInitiator ? visit.noteDariTarget : visit.noteDariInitiator;
  return {
    id: visit.id,
    judul: visit.judul,
    lokasi: visit.lokasi,
    tanggalVisit: visit.tanggalVisit,
    createdAt: visit.createdAt,
    updatedAt: visit.updatedAt,
    iAmInitiator,
    lawan,
    myNote: myNote ?? null,
    noteLawan: noteLawan ?? null,
  };
}

// ============================================================
//  LIST — visit yang melibatkan saya
// ============================================================
meVisitRouter.get('/', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const q = myVisitsQuerySchema.parse(req.query);

  const where: any = {};
  if (q.role === 'initiator') where.initiatorJemaatId = jemaatId;
  else if (q.role === 'target') where.targetJemaatId = jemaatId;
  else where.OR = [{ initiatorJemaatId: jemaatId }, { targetJemaatId: jemaatId }];

  if (q.from || q.to) {
    where.tanggalVisit = {};
    if (q.from) where.tanggalVisit.gte = new Date(q.from);
    if (q.to) {
      const toEnd = new Date(q.to);
      toEnd.setUTCHours(23, 59, 59, 999);
      where.tanggalVisit.lte = toEnd;
    }
  }

  if (q.search) {
    // Search judul + lokasi (case-insensitive)
    where.AND = [
      where.AND ?? {},
      {
        OR: [
          { judul: { contains: q.search, mode: 'insensitive' } },
          { lokasi: { contains: q.search, mode: 'insensitive' } },
        ],
      },
    ];
  }

  const orderBy = { [q.sortBy ?? 'tanggalVisit']: q.sortOrder ?? 'desc' };

  const [rows, total] = await Promise.all([
    prisma.visit.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy,
      include: {
        initiator: { select: jemaatLite },
        target: { select: jemaatLite },
      },
    }),
    prisma.visit.count({ where }),
  ]);

  const data = rows.map((r) => shapeForCaller(r, jemaatId));
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ============================================================
//  CREATE via scan QR kode
// ============================================================
meVisitRouter.post('/', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = createVisitSchema.parse(req.body);

  // Resolve target by kode
  const target = await prisma.jemaat.findUnique({
    where: { kode: input.targetKode },
    select: { id: true, isActive: true, namaLengkap: true },
  });
  if (!target) throw NotFound(`Kode jemaat "${input.targetKode}" tidak ditemukan.`);
  if (!target.isActive) throw BadRequest(`Jemaat "${target.namaLengkap}" sudah nonaktif.`);
  if (target.id === jemaatId) {
    throw BadRequest('Tidak bisa create visit dengan diri sendiri.');
  }

  const created = await prisma.visit.create({
    data: {
      initiatorJemaatId: jemaatId,
      targetJemaatId: target.id,
      judul: input.judul,
      lokasi: input.lokasi,
    },
    include: {
      initiator: { select: jemaatLite },
      target: { select: jemaatLite },
    },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'visit',
    resourceId: created.id,
    resourceLabel: `${created.initiator.namaLengkap} → ${created.target.namaLengkap}: ${created.judul}`,
    after: created,
  });

  res.status(201).json({ success: true, data: shapeForCaller(created, jemaatId) });
});

// ============================================================
//  Helper: fetch + assert participation
// ============================================================
async function findMyVisitOrThrow(visitId: string, jemaatId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: {
      initiator: { select: jemaatLite },
      target: { select: jemaatLite },
    },
  });
  if (!visit) throw NotFound('Visit tidak ditemukan');
  if (visit.initiatorJemaatId !== jemaatId && visit.targetJemaatId !== jemaatId) {
    throw Forbidden('Bukan peserta visit ini');
  }
  return visit;
}

// ============================================================
//  GET detail
// ============================================================
meVisitRouter.get('/:id', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const visit = await findMyVisitOrThrow(req.params.id, jemaatId);
  res.json({ success: true, data: shapeForCaller(visit, jemaatId) });
});

// ============================================================
//  PATCH judul / lokasi — initiator-only
// ============================================================
meVisitRouter.patch('/:id', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = updateVisitMetaSchema.parse(req.body);
  const before = await findMyVisitOrThrow(req.params.id, jemaatId);
  if (before.initiatorJemaatId !== jemaatId) {
    throw Forbidden('Hanya initiator (yang scan) yang bisa mengubah judul/lokasi.');
  }
  const data: any = {};
  if (input.judul !== undefined) data.judul = input.judul;
  if (input.lokasi !== undefined) data.lokasi = input.lokasi;
  if (Object.keys(data).length === 0) {
    throw BadRequest('Tidak ada field yang diubah.');
  }

  const updated = await prisma.visit.update({
    where: { id: before.id },
    data,
    include: {
      initiator: { select: jemaatLite },
      target: { select: jemaatLite },
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'visit',
    resourceId: updated.id,
    resourceLabel: `${updated.initiator.namaLengkap} ↔ ${updated.target.namaLengkap}: ${updated.judul}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: shapeForCaller(updated, jemaatId) });
});

// ============================================================
//  PATCH own note — initiator atau target nulis note dari sisinya
// ============================================================
meVisitRouter.patch('/:id/note', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = updateVisitNoteSchema.parse(req.body);
  const before = await findMyVisitOrThrow(req.params.id, jemaatId);

  const isInitiator = before.initiatorJemaatId === jemaatId;
  const noteValue = input.note.length === 0 ? null : input.note;

  const updated = await prisma.visit.update({
    where: { id: before.id },
    data: isInitiator ? { noteDariInitiator: noteValue } : { noteDariTarget: noteValue },
    include: {
      initiator: { select: jemaatLite },
      target: { select: jemaatLite },
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'visit',
    resourceId: updated.id,
    resourceLabel: `note dari ${isInitiator ? 'initiator' : 'target'} (visit: ${updated.judul})`,
    before,
    after: updated,
    metadata: { kind: 'visit-note', side: isInitiator ? 'initiator' : 'target' },
  });
  res.json({ success: true, data: shapeForCaller(updated, jemaatId) });
});

// ============================================================
//  DELETE — initiator only, dalam window 1 jam pasca create.
//  (Untuk fix mis-scan / typo judul; setelah itu hanya admin yg bisa delete.)
// ============================================================
const DELETE_WINDOW_MS = 60 * 60 * 1000;

meVisitRouter.delete('/:id', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const visit = await findMyVisitOrThrow(req.params.id, jemaatId);
  if (visit.initiatorJemaatId !== jemaatId) {
    throw Forbidden('Hanya initiator yang bisa membatalkan visit.');
  }
  const ageMs = Date.now() - visit.createdAt.getTime();
  if (ageMs > DELETE_WINDOW_MS) {
    throw Conflict(
      'Visit hanya bisa dibatalkan dalam 1 jam setelah dibuat. Hubungi admin untuk hapus.',
    );
  }
  await prisma.visit.delete({ where: { id: visit.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'visit',
    resourceId: visit.id,
    resourceLabel: `(cancel by initiator) ${visit.judul}`,
    before: visit,
  });
  res.status(204).end();
});
