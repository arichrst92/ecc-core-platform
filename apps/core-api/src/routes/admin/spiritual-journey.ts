/**
 * Spiritual Journey (portal) — /admin/spiritual-journey
 *
 *   GET    /               → tahap berurutan + jumlah jemaat yang sudah mencapai
 *                             + jumlah event mendatang yang memberi status tsb
 *   POST   /               → tambah tahap (urutan paling akhir)
 *   PATCH  /:id           → ubah tahap
 *   DELETE /:id           → hapus tahap
 *   POST   /reorder        → { ids: string[] } urutan baru
 *   GET    /:id/jemaat     → jemaat yang sudah mencapai tahap (?search=&page=)
 *   GET    /:id/candidates → cari jemaat (kode/QR, nama, no HP, email) + flag sudah mencapai
 *   POST   /:id/jemaat     → tambahkan jemaat ke tahap ini (beri JemaatRole sesuai syarat)
 *
 * Akses: fulltimer, atau menu "spiritual-journey" (read / write / delete).
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { phoneSearchTerms } from '../../lib/phone-search.js';
import { audit } from '../../lib/audit.js';
import { resolveJemaatAccess } from '../../lib/menu-access.js';
import { eventGrantsStep, jemaatWhereForStep } from '../../lib/spiritual-journey.js';

export const spiritualJourneyRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertAccess(req: Request, level: 'read' | 'write' | 'delete') {
  if (!req.user) throw Unauthorized();
  if (req.user.isFulltimer) return;
  const m = (await resolveJemaatAccess(req.user.jemaatId)).menuAccess['spiritual-journey'];
  const ok = level === 'read' ? m?.canRead : level === 'write' ? m?.canWrite : m?.canDelete;
  if (!ok) throw Forbidden('Anda tidak punya akses ke menu Spiritual Journey.');
}

export const stepInclude = {
  role: { select: { id: true, nama: true } },
  subRole: { select: { id: true, nama: true } },
  subRoleStatus: { select: { id: true, nama: true } },
} as const;

/** Validasi syarat: sub role milik role, status milik sub role. */
async function validateRequirement(roleId: string, subRoleId: string | null, subRoleStatusId: string | null) {
  const role = await prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw BadRequest('Role tidak ditemukan.');
  if (subRoleId) {
    const sr = await prisma.subRole.findUnique({ where: { id: subRoleId }, select: { roleId: true } });
    if (!sr || sr.roleId !== roleId) throw BadRequest('Sub role tidak sesuai dengan role.');
  }
  if (subRoleStatusId) {
    if (!subRoleId) throw BadRequest('Pilih sub role dulu sebelum status.');
    const st = await prisma.subRoleStatus.findUnique({ where: { id: subRoleStatusId }, select: { subRoleId: true } });
    if (!st || st.subRoleId !== subRoleId) throw BadRequest('Status tidak sesuai dengan sub role.');
  }
}

spiritualJourneyRouter.get('/', async (req, res) => {
  await assertAccess(req, 'read');
  const steps = await prisma.spiritualJourneyStep.findMany({ orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }], include: stepInclude });
  const now = new Date();
  const [counts, events] = await Promise.all([
    Promise.all(steps.map((s) => prisma.jemaat.count({ where: { isActive: true, ...jemaatWhereForStep(s) } }))),
    prisma.event.findMany({
      where: {
        isActive: true,
        grantRoleId: { not: null },
        OR: [{ tanggalSelesai: { gte: now } }, { tanggalSelesai: null, tanggalMulai: { gte: new Date(now.getTime() - 86_400_000) } }],
      },
      select: { id: true, grantRoleId: true, grantSubRoleId: true, grantSubRoleStatusId: true },
    }),
  ]);
  res.json({
    success: true,
    data: steps.map((s, i) => ({
      ...s,
      achievedCount: counts[i],
      upcomingEventCount: events.filter((e) => eventGrantsStep(e, s)).length,
    })),
  });
});

const stepSchema = z.object({
  judul: z.string().trim().min(2, 'Judul minimal 2 karakter').max(150),
  deskripsi: z.string().trim().max(2000).nullish().transform((v) => v || null),
  caraMendapatkan: z.string().trim().max(5000).nullish().transform((v) => v || null),
  ikon: z.string().trim().max(16).nullish().transform((v) => v || null),
  roleId: z.string().uuid('Role wajib dipilih'),
  subRoleId: z.string().uuid().nullish().transform((v) => v || null),
  subRoleStatusId: z.string().uuid().nullish().transform((v) => v || null),
  isActive: z.boolean().optional(),
});

spiritualJourneyRouter.post('/', async (req, res) => {
  await assertAccess(req, 'write');
  const input = stepSchema.parse(req.body ?? {});
  await validateRequirement(input.roleId, input.subRoleId, input.subRoleStatusId);
  const last = await prisma.spiritualJourneyStep.aggregate({ _max: { urutan: true } });
  const created = await prisma.spiritualJourneyStep.create({
    data: { ...input, urutan: (last._max.urutan ?? 0) + 1 },
    include: stepInclude,
  });
  audit(req, { action: 'CREATE', resource: 'spiritual_journey_step', resourceId: created.id, resourceLabel: created.judul, after: created });
  res.status(201).json({ success: true, data: created });
});

spiritualJourneyRouter.post('/reorder', async (req, res) => {
  await assertAccess(req, 'write');
  const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(req.body ?? {});
  await prisma.$transaction(ids.map((id, i) => prisma.spiritualJourneyStep.update({ where: { id }, data: { urutan: i + 1 } })));
  audit(req, { action: 'UPDATE', resource: 'spiritual_journey_step', resourceLabel: 'Ubah urutan Spiritual Journey', metadata: { ids } });
  res.json({ success: true, data: { reordered: ids.length } });
});

spiritualJourneyRouter.patch('/:id', async (req, res) => {
  await assertAccess(req, 'write');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Tahap tidak ditemukan');
  const before = await prisma.spiritualJourneyStep.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Tahap tidak ditemukan');
  const input = stepSchema.partial().parse(req.body ?? {});
  const roleId = input.roleId ?? before.roleId;
  const subRoleId = input.subRoleId !== undefined ? input.subRoleId : before.subRoleId;
  const subRoleStatusId = input.subRoleStatusId !== undefined ? input.subRoleStatusId : before.subRoleStatusId;
  await validateRequirement(roleId, subRoleId, subRoleStatusId);
  const updated = await prisma.spiritualJourneyStep.update({ where: { id: before.id }, data: input, include: stepInclude });
  audit(req, { action: 'UPDATE', resource: 'spiritual_journey_step', resourceId: before.id, resourceLabel: updated.judul, before, after: updated });
  res.json({ success: true, data: updated });
});

spiritualJourneyRouter.delete('/:id', async (req, res) => {
  await assertAccess(req, 'delete');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Tahap tidak ditemukan');
  const before = await prisma.spiritualJourneyStep.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Tahap tidak ditemukan');
  await prisma.spiritualJourneyStep.delete({ where: { id: before.id } });
  audit(req, { action: 'DELETE', resource: 'spiritual_journey_step', resourceId: before.id, resourceLabel: before.judul, before });
  res.json({ success: true, data: { deleted: true } });
});

spiritualJourneyRouter.get('/:id/jemaat', async (req, res) => {
  await assertAccess(req, 'read');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Tahap tidak ditemukan');
  const step = await prisma.spiritualJourneyStep.findUnique({ where: { id: req.params.id } });
  if (!step) throw NotFound('Tahap tidak ditemukan');
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const cabangId = typeof req.query.cabangId === 'string' && UUID_RE.test(req.query.cabangId) ? req.query.cabangId : undefined;
  const where = {
    isActive: true,
    ...jemaatWhereForStep(step),
    ...(cabangId ? { cabangId } : {}),
    ...(search ? { namaLengkap: { contains: search, mode: 'insensitive' as const } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.jemaat.findMany({
      where,
      orderBy: { namaLengkap: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, namaLengkap: true, kode: true, fotoUrl: true, cabang: { select: { id: true, nama: true } } },
    }),
    prisma.jemaat.count({ where }),
  ]);
  res.json({ success: true, data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

/** Filter pencarian jemaat: kode (QR), nama, no HP, email. */
function jemaatSearchWhere(search: string) {
  const kode = search.trim().toUpperCase();
  return {
    OR: [
      { kode },
      { kode: { startsWith: kode } },
      { namaLengkap: { contains: search, mode: 'insensitive' as const } },
      { email: { contains: search, mode: 'insensitive' as const } },
      { noHp: { contains: search } },
      ...phoneSearchTerms(search).map((t) => ({ noHp: { contains: t } })),
    ],
  };
}

spiritualJourneyRouter.get('/:id/candidates', async (req, res) => {
  await assertAccess(req, 'write');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Tahap tidak ditemukan');
  const step = await prisma.spiritualJourneyStep.findUnique({ where: { id: req.params.id } });
  if (!step) throw NotFound('Tahap tidak ditemukan');
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length < 2) {
    res.json({ success: true, data: [] });
    return;
  }
  const rows = await prisma.jemaat.findMany({
    where: { isActive: true, ...jemaatSearchWhere(search) },
    orderBy: { namaLengkap: 'asc' },
    take: 10,
    select: {
      id: true,
      namaLengkap: true,
      kode: true,
      noHp: true,
      email: true,
      fotoUrl: true,
      cabang: { select: { id: true, nama: true } },
    },
  });
  const achievedIds = new Set(
    (
      await prisma.jemaat.findMany({
        where: { id: { in: rows.map((r) => r.id) }, ...jemaatWhereForStep(step) },
        select: { id: true },
      })
    ).map((r) => r.id),
  );
  // Kode persis di urutan pertama (hasil scan QR).
  const kode = search.toUpperCase();
  rows.sort((a, b) => Number(b.kode === kode) - Number(a.kode === kode));
  res.json({ success: true, data: rows.map((r) => ({ ...r, achieved: achievedIds.has(r.id) })) });
});

const addSchema = z
  .object({
    jemaatId: z.string().uuid().optional(),
    kode: z.string().trim().min(1).max(32).optional(),
    // Wajib kalau tahap tidak menentukan sub role (JemaatRole butuh sub role).
    subRoleId: z.string().uuid().nullish(),
    catatan: z.string().trim().max(500).nullish(),
  })
  .refine((v) => v.jemaatId || v.kode, { message: 'Pilih jemaat atau isi kode.' });

spiritualJourneyRouter.post('/:id/jemaat', async (req, res) => {
  await assertAccess(req, 'write');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Tahap tidak ditemukan');
  const step = await prisma.spiritualJourneyStep.findUnique({ where: { id: req.params.id } });
  if (!step) throw NotFound('Tahap tidak ditemukan');
  const input = addSchema.parse(req.body ?? {});

  const jemaat = await prisma.jemaat.findFirst({
    where: input.jemaatId ? { id: input.jemaatId } : { kode: input.kode!.toUpperCase() },
    select: { id: true, namaLengkap: true, isActive: true },
  });
  if (!jemaat) throw NotFound(input.kode ? `Kode jemaat "${input.kode}" tidak ditemukan.` : 'Jemaat tidak ditemukan.');
  if (!jemaat.isActive) throw BadRequest(`${jemaat.namaLengkap} tidak aktif.`);

  const already = await prisma.jemaat.count({ where: { id: jemaat.id, ...jemaatWhereForStep(step) } });
  if (already) throw Conflict(`${jemaat.namaLengkap} sudah berada di tahap "${step.judul}".`);

  let subRoleId = step.subRoleId;
  if (!subRoleId) {
    if (!input.subRoleId) throw BadRequest('Tahap ini tidak menentukan sub role — pilih sub role yang diberikan.');
    const sr = await prisma.subRole.findUnique({ where: { id: input.subRoleId }, select: { roleId: true } });
    if (!sr || sr.roleId !== step.roleId) throw BadRequest('Sub role tidak sesuai dengan role tahap.');
    subRoleId = input.subRoleId;
  }

  const created = await prisma.jemaatRole.create({
    data: {
      jemaatId: jemaat.id,
      roleId: step.roleId,
      subRoleId,
      subRoleStatusId: step.subRoleStatusId ?? null,
      catatan: input.catatan || `Ditambahkan ke Spiritual Journey "${step.judul}"`,
    },
    include: { role: true, subRole: true, subRoleStatus: true },
  });
  const label = `${jemaat.namaLengkap} → ${step.judul} (${created.role.nama}:${created.subRole.nama}${created.subRoleStatus ? `:${created.subRoleStatus.nama}` : ''})`;
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat_role',
    resourceId: created.id,
    resourceLabel: label,
    after: created,
    metadata: { kind: 'spiritual-journey-add', stepId: step.id },
  });
  res.status(201).json({ success: true, data: { id: created.id, jemaat: { id: jemaat.id, namaLengkap: jemaat.namaLengkap } } });
});
