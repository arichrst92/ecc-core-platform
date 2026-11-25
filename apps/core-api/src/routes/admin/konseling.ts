/**
 * Konseling — Portal (People → Konseling), 2026-12. Role Access menu `konseling`
 * (read = lihat permintaan & isi; write = tugaskan, batalkan, atur konselor).
 *
 *   GET   /                      antrian + ringkasan (status, cabang, konselor, cari)
 *   GET   /config                pelayanan sumber konselor
 *   GET   /ministry-options      pilihan pelayanan + peran
 *   PUT   /config                { ministries: [{ pelayananId, pelayananRoleId? }] }
 *   GET   /konselor-options      ?requestId= → konselor (cabang & jenis kelamin sesuai, beban aktif)
 *   GET   /:id                   detail
 *   PATCH /:id/assign            { konselorId }
 *   POST  /:id/cancel            { alasan }
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { assignKonselingSchema, cancelKonselingSchema, konselingConfigSchema } from '@ecc/shared-types';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { OPEN_STATUSES, UUID_RE, konselorPelayananWhere, notifyJemaat, notifyKonselor, peopleMap } from '../../lib/konseling.js';

export const konselingRouter = Router();
const MENU = 'konseling';
const R = requireMenu(MENU);
const W = requireMenu(MENU, 'write');

const str = (req: Request, k: string) => (typeof req.query[k] === 'string' && req.query[k] ? String(req.query[k]) : undefined);
const pid = (v: string | undefined) => {
  if (!v || !UUID_RE.test(v)) throw NotFound('Permintaan konseling tidak ditemukan');
  return v;
};

async function serialize(rows: Prisma.KonselingRequestGetPayload<object>[]) {
  const people = await peopleMap(rows.flatMap((r) => [r.jemaatId, r.konselorId]));
  const cab = await prisma.cabangGereja.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.cabangId).filter((x): x is string => !!x))] } }, select: { id: true, nama: true } });
  const cm = new Map(cab.map((c) => [c.id, c.nama]));
  return rows.map((r) => ({
    ...r,
    jemaat: people.get(r.jemaatId) ?? null,
    konselor: r.konselorId ? people.get(r.konselorId) ?? null : null,
    cabang: r.cabangId ? cm.get(r.cabangId) ?? null : null,
  }));
}

konselingRouter.get('/', R, async (req, res) => {
  const status = str(req, 'status');
  const cabangId = str(req, 'cabangId');
  const konselorId = str(req, 'konselorId');
  const q = str(req, 'q');
  const where: Prisma.KonselingRequestWhereInput = {
    ...(status === 'AKTIF' ? { status: { in: OPEN_STATUSES } } : status ? { status } : {}),
    ...(cabangId && UUID_RE.test(cabangId) ? { cabangId } : {}),
    ...(konselorId && UUID_RE.test(konselorId) ? { konselorId } : {}),
  };
  if (q) {
    const ids = await prisma.jemaat.findMany({ where: { namaLengkap: { contains: q, mode: 'insensitive' } }, select: { id: true }, take: 300 });
    where.jemaatId = { in: ids.map((x) => x.id) };
  }
  const [rows, counts] = await Promise.all([
    prisma.konselingRequest.findMany({ where, orderBy: [{ createdAt: 'desc' }], take: 300 }),
    prisma.konselingRequest.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  res.json({
    success: true,
    data: await serialize(rows),
    meta: { counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])), configured: !!(await konselorPelayananWhere()) },
  });
});

// ------------------------------------------------------------------ pengaturan

async function loadConfig() {
  const cfg = await prisma.konselingKonselorPelayanan.findMany({ orderBy: { createdAt: 'asc' } });
  const [pel, roles] = await Promise.all([
    prisma.pelayanan.findMany({ where: { id: { in: cfg.map((c) => c.pelayananId) } }, select: { id: true, nama: true } }),
    prisma.pelayananRole.findMany({ where: { id: { in: cfg.map((c) => c.pelayananRoleId).filter((x): x is string => !!x) } }, select: { id: true, nama: true } }),
  ]);
  const pm = new Map(pel.map((p) => [p.id, p.nama]));
  const rm = new Map(roles.map((r) => [r.id, r.nama]));
  return cfg.map((c) => ({
    pelayananId: c.pelayananId,
    pelayananRoleId: c.pelayananRoleId,
    pelayanan: pm.get(c.pelayananId) ?? '(dihapus)',
    peran: c.pelayananRoleId ? rm.get(c.pelayananRoleId) ?? '(dihapus)' : null,
  }));
}

konselingRouter.get('/config', R, async (_req, res) => {
  const ministries = await loadConfig();
  const w = await konselorPelayananWhere();
  const konselorCount = w ? await prisma.jemaat.count({ where: { isActive: true, jemaatPelayanan: { some: w } } }) : 0;
  res.json({ success: true, data: { ministries, konselorCount } });
});

konselingRouter.get('/ministry-options', R, async (_req, res) => {
  const rows = await prisma.pelayanan.findMany({
    where: { isActive: true },
    orderBy: { nama: 'asc' },
    select: { id: true, nama: true, roles: { where: { isActive: true }, orderBy: { level: 'desc' }, select: { id: true, nama: true } } },
  });
  res.json({ success: true, data: rows });
});

konselingRouter.put('/config', W, async (req, res) => {
  const { ministries } = konselingConfigSchema.parse(req.body ?? {});
  const uniq = new Map<string, { pelayananId: string; pelayananRoleId: string | null }>();
  for (const m of ministries) uniq.set(`${m.pelayananId}:${m.pelayananRoleId ?? ''}`, { pelayananId: m.pelayananId, pelayananRoleId: m.pelayananRoleId ?? null });
  const prIds = [...uniq.values()].map((v) => v.pelayananRoleId).filter((v): v is string => !!v);
  if (prIds.length) {
    const prs = await prisma.pelayananRole.findMany({ where: { id: { in: prIds } }, select: { id: true, pelayananId: true } });
    const byId = new Map(prs.map((p) => [p.id, p.pelayananId]));
    for (const v of uniq.values()) if (v.pelayananRoleId && byId.get(v.pelayananRoleId) !== v.pelayananId) throw BadRequest('Peran tidak sesuai dengan pelayanan yang dipilih.');
  }
  const before = await loadConfig();
  await prisma.$transaction([prisma.konselingKonselorPelayanan.deleteMany({}), prisma.konselingKonselorPelayanan.createMany({ data: [...uniq.values()] })]);
  const after = await loadConfig();
  audit(req, { action: 'UPDATE', resource: 'konseling-config', resourceLabel: 'Pelayanan konselor', before, after });
  res.json({ success: true, data: { ministries: after } });
});

/** Konselor yang bisa ditugaskan: anggota pelayanan terkonfigurasi; cabang & jenis kelamin sesuai lebih dulu. */
konselingRouter.get('/konselor-options', R, async (req, res) => {
  const w = await konselorPelayananWhere();
  if (!w) {
    res.json({ success: true, data: [], meta: { configured: false } });
    return;
  }
  const rid = str(req, 'requestId');
  const r = rid && UUID_RE.test(rid) ? await prisma.konselingRequest.findUnique({ where: { id: rid } }) : null;
  const jg = r ? (await prisma.jemaat.findUnique({ where: { id: r.jemaatId }, select: { jenisKelamin: true } }))?.jenisKelamin ?? null : null;
  const all = str(req, 'all') === '1';
  const where: Prisma.JemaatWhereInput = {
    isActive: true,
    jemaatPelayanan: { some: w },
    ...(r ? { id: { not: r.jemaatId } } : {}),
    ...(r?.preferensiGender === 'SAME' && jg && !all ? { jenisKelamin: jg } : {}),
  };
  const q = str(req, 'q');
  if (q) where.namaLengkap = { contains: q, mode: 'insensitive' };
  const rows = await prisma.jemaat.findMany({
    where,
    take: 200,
    select: {
      id: true,
      namaLengkap: true,
      fotoUrl: true,
      jenisKelamin: true,
      cabangId: true,
      cabang: { select: { nama: true } },
      jemaatPelayanan: { where: w, select: { pelayanan: { select: { nama: true } }, pelayananRole: { select: { nama: true } } } },
    },
  });
  const load = await prisma.konselingRequest.groupBy({
    by: ['konselorId'],
    where: { konselorId: { in: rows.map((x) => x.id) }, status: { in: ['DITUGASKAN', 'DIJADWALKAN'] } },
    _count: { _all: true },
  });
  const lm = new Map(load.map((l) => [l.konselorId, l._count._all]));
  const data = rows
    .map(({ jemaatPelayanan, cabang, ...x }) => ({
      ...x,
      cabang: cabang?.nama ?? null,
      sameCabang: !!r?.cabangId && x.cabangId === r.cabangId,
      sameGender: !!jg && x.jenisKelamin === jg,
      pelayanan: jemaatPelayanan.map((p) => `${p.pelayanan.nama} · ${p.pelayananRole.nama}`),
      aktif: lm.get(x.id) ?? 0,
    }))
    .sort((a, b) => Number(b.sameCabang) - Number(a.sameCabang) || a.aktif - b.aktif || a.namaLengkap.localeCompare(b.namaLengkap));
  res.json({ success: true, data, meta: { configured: true, preferensiGender: r?.preferensiGender ?? 'ANY', jemaatGender: jg } });
});

// ------------------------------------------------------------------ per permintaan

konselingRouter.get('/:id', R, async (req, res) => {
  const r = await prisma.konselingRequest.findUnique({ where: { id: pid(req.params.id) } });
  if (!r) throw NotFound('Permintaan konseling tidak ditemukan');
  const [row] = await serialize([r]);
  res.json({ success: true, data: row });
});

konselingRouter.patch('/:id/assign', W, async (req, res) => {
  if (!req.user) throw Unauthorized();
  const r = await prisma.konselingRequest.findUnique({ where: { id: pid(req.params.id) } });
  if (!r) throw NotFound('Permintaan konseling tidak ditemukan');
  if (!OPEN_STATUSES.includes(r.status)) throw BadRequest('Permintaan ini sudah selesai / dibatalkan.');
  const { konselorId } = assignKonselingSchema.parse(req.body ?? {});
  if (konselorId === r.jemaatId) throw BadRequest('Konselor tidak boleh jemaat yang sama.');
  const w = await konselorPelayananWhere();
  if (!w || !(await prisma.jemaat.count({ where: { id: konselorId, isActive: true, jemaatPelayanan: { some: w } } })))
    throw BadRequest('Jemaat ini bukan konselor (bukan anggota pelayanan konselor).');
  const prev = r.konselorId;
  const u = await prisma.konselingRequest.update({
    where: { id: r.id },
    data: {
      konselorId,
      assignedById: req.user.jemaatId,
      assignedAt: new Date(),
      // Ganti konselor → jadwal lama dari konselor sebelumnya tidak berlaku.
      ...(prev && prev !== konselorId ? { status: 'DITUGASKAN', jadwalFinal: null, catatanKonselor: null } : r.status === 'BARU' ? { status: 'DITUGASKAN' } : {}),
    },
  });
  const people = await peopleMap([konselorId, r.jemaatId]);
  notifyKonselor(konselorId, 'Permintaan konseling baru', `Anda ditugaskan mendampingi ${people.get(r.jemaatId)?.namaLengkap ?? 'jemaat'}. Buka untuk melihat pokok masalah & kontaknya.`, r.id);
  if (prev && prev !== konselorId) notifyKonselor(prev, 'Tugas konseling dialihkan', 'Permintaan konseling yang ditugaskan kepada Anda dialihkan ke konselor lain.', r.id);
  notifyJemaat(r.jemaatId, 'KONSELING_UPDATED', 'Konselor sudah ditugaskan', `${people.get(konselorId)?.namaLengkap ?? 'Konselor'} akan menghubungi Anda untuk menentukan jadwal.`, r.id);
  audit(req, { action: 'UPDATE', resource: 'konseling_request', resourceId: r.id, resourceLabel: `Tugaskan konselor ${people.get(konselorId)?.namaLengkap ?? ''}` });
  const [row] = await serialize([u]);
  res.json({ success: true, data: row });
});

konselingRouter.post('/:id/cancel', W, async (req, res) => {
  const r = await prisma.konselingRequest.findUnique({ where: { id: pid(req.params.id) } });
  if (!r) throw NotFound('Permintaan konseling tidak ditemukan');
  if (!OPEN_STATUSES.includes(r.status)) throw BadRequest('Permintaan ini sudah selesai / dibatalkan.');
  const { alasan } = cancelKonselingSchema.parse(req.body ?? {});
  const u = await prisma.konselingRequest.update({
    where: { id: r.id },
    data: { status: 'DIBATALKAN', dibatalkanAt: new Date(), dibatalkanOleh: 'ADMIN', alasanBatal: alasan ?? null },
  });
  notifyJemaat(r.jemaatId, 'KONSELING_UPDATED', 'Permintaan konseling dibatalkan', alasan ? `Dibatalkan admin: ${alasan}` : 'Permintaan konseling Anda dibatalkan admin.', r.id);
  if (r.konselorId) notifyKonselor(r.konselorId, 'Konseling dibatalkan', 'Permintaan konseling yang ditugaskan kepada Anda dibatalkan admin.', r.id);
  audit(req, { action: 'UPDATE', resource: 'konseling_request', resourceId: r.id, resourceLabel: 'Konseling dibatalkan admin' });
  const [row] = await serialize([u]);
  res.json({ success: true, data: row });
});
