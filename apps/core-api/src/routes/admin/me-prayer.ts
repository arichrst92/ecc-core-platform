/**
 * Doa (Prayer Request) saya — mobile — /admin/me/prayer
 *
 *   GET    /                    → doa saya (?tab=aktif|terjawab)
 *   GET    /summary             → { isPetugas, assignedPending, aktif, terjawab }
 *   POST   /                    → buat
 *   GET    /assigned            → (petugas) doa yang ditugaskan ke saya (?tab=pending|done)
 *   GET    /assigned/:id        → (petugas) detail
 *   POST   /assigned/:id/prayed → (petugas) tandai sudah didoakan { catatan? }
 *   GET    /:id                 → detail milik saya
 *   PATCH  /:id                 → ubah (selama BARU/DITUGASKAN & belum terjawab)
 *   DELETE /:id                 → hapus (soft delete)
 *   POST   /:id/answered        → { answered, kesaksian? } tandai/batalkan terjawab
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { createPrayerSchema, markAnsweredSchema, markPrayedSchema, updatePrayerSchema } from '@ecc/shared-types';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { familyOf } from '../../lib/family.js';
import {
  UUID_RE,
  assignedSelect,
  isPetugasDoa,
  mineSelect,
  notifyPrayed,
  serializeAssigned,
  serializeMine,
} from '../../lib/prayer.js';

export const mePrayerRouter = Router();

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

function idParam(req: Request) {
  const id = String(req.params.id ?? '');
  if (!UUID_RE.test(id)) throw NotFound('Prayer request tidak ditemukan');
  return id;
}

async function loadMine(req: Request) {
  const u = me(req);
  const id = idParam(req);
  const row = await prisma.prayerRequest.findFirst({
    where: { id, jemaatId: u.jemaatId, deletedAt: null },
    select: mineSelect,
  });
  if (!row) throw NotFound('Prayer request tidak ditemukan');
  return { u, row };
}

/** Validasi target doa; untuk KELUARGA dengan untukJemaatId wajib anggota keluarga saya. */
async function resolveTarget(jemaatId: string, input: { untuk: string; untukNama: string | null; untukJemaatId?: string | null }) {
  if (input.untuk === 'DIRI_SENDIRI') return { untukNama: null, untukJemaatId: null };
  if (input.untuk === 'KELUARGA' && input.untukJemaatId) {
    const fam = await familyOf(jemaatId);
    if (!fam.has(input.untukJemaatId)) throw BadRequest('Anggota keluarga tidak ditemukan');
    return { untukNama: input.untukNama, untukJemaatId: input.untukJemaatId };
  }
  return { untukNama: input.untukNama, untukJemaatId: null };
}

mePrayerRouter.get('/', async (req, res) => {
  const u = me(req);
  const tab = req.query.tab === 'terjawab' ? 'terjawab' : req.query.tab === 'aktif' ? 'aktif' : 'all';
  const where: Prisma.PrayerRequestWhereInput = { jemaatId: u.jemaatId, deletedAt: null };
  if (tab === 'terjawab') where.terjawabAt = { not: null };
  if (tab === 'aktif') where.terjawabAt = null;
  const rows = await prisma.prayerRequest.findMany({
    where,
    orderBy: tab === 'terjawab' ? { terjawabAt: 'desc' } : { createdAt: 'desc' },
    take: 200,
    select: mineSelect,
  });
  res.json({ success: true, data: rows.map(serializeMine) });
});

mePrayerRouter.get('/summary', async (req, res) => {
  const u = me(req);
  const [isPetugas, assignedPending, aktif, terjawab] = await Promise.all([
    isPetugasDoa(u.jemaatId),
    prisma.prayerRequest.count({
      where: { petugasId: u.jemaatId, deletedAt: null, status: 'DITUGASKAN', terjawabAt: null },
    }),
    prisma.prayerRequest.count({ where: { jemaatId: u.jemaatId, deletedAt: null, terjawabAt: null } }),
    prisma.prayerRequest.count({ where: { jemaatId: u.jemaatId, deletedAt: null, terjawabAt: { not: null } } }),
  ]);
  // Tetap tampilkan tab petugas kalau masih ada tugas walau role sudah dicabut.
  res.json({ success: true, data: { isPetugas: isPetugas || assignedPending > 0, assignedPending, aktif, terjawab } });
});

mePrayerRouter.post('/', async (req, res) => {
  const u = me(req);
  const input = createPrayerSchema.parse(req.body ?? {});
  const target = await resolveTarget(u.jemaatId, input);
  const j = await prisma.jemaat.findUnique({ where: { id: u.jemaatId }, select: { cabangId: true } });
  const created = await prisma.prayerRequest.create({
    data: {
      jemaatId: u.jemaatId,
      cabangId: j?.cabangId ?? null,
      kategori: input.kategori,
      untuk: input.untuk,
      ...target,
      isi: input.isi,
      isAnonim: input.isAnonim,
    },
    select: mineSelect,
  });
  res.status(201).json({
    success: true,
    data: serializeMine(created),
    message: 'Prayer request terkirim. Tim ECC akan mendoakan Anda.',
  });
});

// ── Petugas ────────────────────────────────────────────────
mePrayerRouter.get('/assigned', async (req, res) => {
  const u = me(req);
  const tab = req.query.tab === 'done' ? 'done' : 'pending';
  const where: Prisma.PrayerRequestWhereInput = { petugasId: u.jemaatId, deletedAt: null };
  if (tab === 'pending') Object.assign(where, { status: 'DITUGASKAN', terjawabAt: null });
  else where.OR = [{ status: 'SUDAH_DIDOAKAN' }, { terjawabAt: { not: null } }];
  const rows = await prisma.prayerRequest.findMany({
    where,
    orderBy: tab === 'pending' ? { assignedAt: 'asc' } : { didoakanAt: 'desc' },
    take: 200,
    select: assignedSelect,
  });
  res.json({ success: true, data: rows.map(serializeAssigned) });
});

async function loadAssigned(req: Request) {
  const u = me(req);
  const id = idParam(req);
  const row = await prisma.prayerRequest.findFirst({
    where: { id, deletedAt: null },
    select: assignedSelect,
  });
  if (!row) throw NotFound('Prayer request tidak ditemukan');
  if (row.petugasId !== u.jemaatId) throw Forbidden('Prayer request ini tidak ditugaskan ke Anda.');
  return { u, row };
}

mePrayerRouter.get('/assigned/:id', async (req, res) => {
  const { row } = await loadAssigned(req);
  res.json({ success: true, data: serializeAssigned(row) });
});

mePrayerRouter.post('/assigned/:id/prayed', async (req, res) => {
  const { u, row } = await loadAssigned(req);
  const { catatan } = markPrayedSchema.parse(req.body ?? {});
  const first = row.status !== 'SUDAH_DIDOAKAN';
  const updated = await prisma.prayerRequest.update({
    where: { id: row.id },
    data: {
      status: 'SUDAH_DIDOAKAN',
      didoakanAt: first ? new Date() : undefined,
      didoakanById: first ? u.jemaatId : undefined,
      catatanPetugas: catatan,
    },
    select: assignedSelect,
  });
  if (first) void notifyPrayed(row.id);
  res.json({ success: true, data: serializeAssigned(updated), message: 'Ditandai sudah didoakan.' });
});

// ── Milik saya ─────────────────────────────────────────────
mePrayerRouter.get('/:id', async (req, res) => {
  const { row } = await loadMine(req);
  res.json({ success: true, data: serializeMine(row) });
});

mePrayerRouter.patch('/:id', async (req, res) => {
  const { u, row } = await loadMine(req);
  if (!serializeMine(row).canEdit) throw BadRequest('Prayer request yang sudah didoakan tidak bisa diubah.');
  const input = updatePrayerSchema.parse(req.body ?? {});
  const target = await resolveTarget(u.jemaatId, input);
  const updated = await prisma.prayerRequest.update({
    where: { id: row.id },
    data: { kategori: input.kategori, untuk: input.untuk, ...target, isi: input.isi, isAnonim: input.isAnonim },
    select: mineSelect,
  });
  res.json({ success: true, data: serializeMine(updated) });
});

mePrayerRouter.delete('/:id', async (req, res) => {
  const { row } = await loadMine(req);
  await prisma.prayerRequest.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
  res.json({ success: true, message: 'Prayer request dihapus.' });
});

mePrayerRouter.post('/:id/answered', async (req, res) => {
  const { row } = await loadMine(req);
  const { answered, kesaksian } = markAnsweredSchema.parse(req.body ?? {});
  const updated = await prisma.prayerRequest.update({
    where: { id: row.id },
    data: answered
      ? { terjawabAt: row.terjawabAt ?? new Date(), kesaksian }
      : { terjawabAt: null, kesaksian: null },
    select: mineSelect,
  });
  res.json({
    success: true,
    data: serializeMine(updated),
    message: answered ? 'Puji Tuhan! Doa ditandai sudah terjawab.' : 'Tanda terjawab dibatalkan.',
  });
});
