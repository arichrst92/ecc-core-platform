/**
 * Prayer Request — portal admin — /admin/prayer-request
 *
 * Akses: menu "prayer-request" (read = lihat; write = assign/tandai/konfigurasi;
 * delete = hapus). Fulltimer selalu boleh.
 *
 *   GET    /                  → daftar + filter (status, kategori, cabangId, petugasId, search) + ringkasan
 *   GET    /config            → role/sub-role petugas doa
 *   PUT    /config            → { items: [{ roleId, subRoleId? }] }
 *   GET    /petugas-options   → kandidat petugas (jemaat dgn role terkonfigurasi) ?search=&cabangId=
 *   GET    /:id               → detail
 *   PATCH  /:id/assign        → { petugasId | null } → notif in-app + WA ke petugas
 *   POST   /:id/prayed        → { catatan? } tandai sudah didoakan (atas nama admin)
 *   DELETE /:id               → hapus (soft)
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { PRAYER_KATEGORI, assignPrayerSchema, markPrayedSchema, prayerPetugasRolesSchema } from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { requireMenu } from '../../middleware/require-menu.js';
import {
  UUID_RE,
  displayStatus,
  notifyAssigned,
  notifyPrayed,
  petugasRoleWhere,
  prayerPersonSelect,
  statusWhere,
} from '../../lib/prayer.js';

export const prayerRequestRouter = Router();

const MENU = 'prayer-request';

const adminSelect = {
  id: true,
  kategori: true,
  untuk: true,
  untukNama: true,
  untukJemaat: { select: { id: true, namaLengkap: true } },
  isi: true,
  isAnonim: true,
  status: true,
  assignedAt: true,
  didoakanAt: true,
  catatanPetugas: true,
  terjawabAt: true,
  kesaksian: true,
  createdAt: true,
  updatedAt: true,
  jemaat: { select: { ...prayerPersonSelect, kode: true, noHp: true } },
  cabang: { select: { id: true, nama: true } },
  petugas: { select: prayerPersonSelect },
  assignedBy: { select: prayerPersonSelect },
  didoakanBy: { select: prayerPersonSelect },
} satisfies Prisma.PrayerRequestSelect;

type AdminRow = Prisma.PrayerRequestGetPayload<{ select: typeof adminSelect }>;

function serialize(r: AdminRow) {
  return {
    ...r,
    untukNama: r.untukNama ?? r.untukJemaat?.namaLengkap ?? null,
    displayStatus: displayStatus(r),
  };
}

function str(req: Request, k: string) {
  const v = req.query[k];
  return typeof v === 'string' && v ? v : undefined;
}

prayerRequestRouter.get('/', requireMenu(MENU), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const base: Prisma.PrayerRequestWhereInput = { deletedAt: null };
  const kategori = str(req, 'kategori');
  if (kategori && (PRAYER_KATEGORI as readonly string[]).includes(kategori)) base.kategori = kategori;
  const cabangId = str(req, 'cabangId');
  if (cabangId && UUID_RE.test(cabangId)) base.cabangId = cabangId;
  const petugasId = str(req, 'petugasId');
  if (petugasId === 'none') base.petugasId = null;
  else if (petugasId && UUID_RE.test(petugasId)) base.petugasId = petugasId;
  const search = str(req, 'search');
  if (search) {
    base.OR = [
      { isi: { contains: search, mode: 'insensitive' } },
      { untukNama: { contains: search, mode: 'insensitive' } },
      { jemaat: { namaLengkap: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const where: Prisma.PrayerRequestWhereInput = { AND: [base, statusWhere(str(req, 'status'))] };
  const [rows, total, baru, ditugaskan, didoakan, terjawab] = await Promise.all([
    prisma.prayerRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: adminSelect,
    }),
    prisma.prayerRequest.count({ where }),
    prisma.prayerRequest.count({ where: { AND: [base, statusWhere('BARU')] } }),
    prisma.prayerRequest.count({ where: { AND: [base, statusWhere('DITUGASKAN')] } }),
    prisma.prayerRequest.count({ where: { AND: [base, statusWhere('SUDAH_DIDOAKAN')] } }),
    prisma.prayerRequest.count({ where: { AND: [base, statusWhere('TERJAWAB')] } }),
  ]);
  res.json({
    success: true,
    data: rows.map(serialize),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      summary: { BARU: baru, DITUGASKAN: ditugaskan, SUDAH_DIDOAKAN: didoakan, TERJAWAB: terjawab },
    },
  });
});

// ── Konfigurasi role petugas ──────────────────────────────
async function loadConfig() {
  const rows = await prisma.prayerPetugasRole.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      roleId: true,
      subRoleId: true,
      role: { select: { nama: true } },
      subRole: { select: { nama: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    roleId: r.roleId,
    subRoleId: r.subRoleId,
    roleNama: r.role.nama,
    subRoleNama: r.subRole?.nama ?? null,
  }));
}

prayerRequestRouter.get('/config', requireMenu(MENU), async (_req, res) => {
  res.json({ success: true, data: await loadConfig() });
});

prayerRequestRouter.put('/config', requireMenu(MENU, 'write'), async (req, res) => {
  const { items } = prayerPetugasRolesSchema.parse(req.body ?? {});
  // Dedup + validasi subRole milik role.
  const uniq = new Map<string, { roleId: string; subRoleId: string | null }>();
  for (const it of items) uniq.set(`${it.roleId}:${it.subRoleId ?? ''}`, { roleId: it.roleId, subRoleId: it.subRoleId ?? null });
  const subIds = [...uniq.values()].map((v) => v.subRoleId).filter((v): v is string => !!v);
  if (subIds.length) {
    const subs = await prisma.subRole.findMany({ where: { id: { in: subIds } }, select: { id: true, roleId: true } });
    const byId = new Map(subs.map((s) => [s.id, s.roleId]));
    for (const v of uniq.values()) {
      if (v.subRoleId && byId.get(v.subRoleId) !== v.roleId) throw BadRequest('Sub role tidak sesuai dengan role.');
    }
  }
  const before = await loadConfig();
  await prisma.$transaction([
    prisma.prayerPetugasRole.deleteMany({}),
    prisma.prayerPetugasRole.createMany({ data: [...uniq.values()] }),
  ]);
  const after = await loadConfig();
  audit(req, {
    action: 'UPDATE',
    resource: 'prayer-request-config',
    resourceLabel: 'Role petugas doa',
    before,
    after,
  });
  res.json({ success: true, data: after });
});

prayerRequestRouter.get('/petugas-options', requireMenu(MENU), async (req, res) => {
  const roleWhere = await petugasRoleWhere();
  if (!roleWhere) {
    res.json({ success: true, data: [], meta: { configured: false } });
    return;
  }
  const where: Prisma.JemaatWhereInput = { isActive: true, jemaatRoles: { some: roleWhere } };
  const search = str(req, 'search');
  if (search) where.namaLengkap = { contains: search, mode: 'insensitive' };
  const cabangId = str(req, 'cabangId');
  if (cabangId && UUID_RE.test(cabangId)) where.cabangId = cabangId;
  const rows = await prisma.jemaat.findMany({
    where,
    orderBy: { namaLengkap: 'asc' },
    take: 100,
    select: {
      ...prayerPersonSelect,
      cabang: { select: { id: true, nama: true } },
      jemaatRoles: {
        where: roleWhere,
        select: { role: { select: { nama: true } }, subRole: { select: { nama: true } } },
      },
    },
  });
  // Beban tugas aktif per petugas — bantu admin membagi rata.
  const load = await prisma.prayerRequest.groupBy({
    by: ['petugasId'],
    where: { petugasId: { in: rows.map((r) => r.id) }, status: 'DITUGASKAN', terjawabAt: null, deletedAt: null },
    _count: { _all: true },
  });
  const loadMap = new Map(load.map((l) => [l.petugasId, l._count._all]));
  res.json({
    success: true,
    data: rows.map(({ jemaatRoles, ...r }) => ({
      ...r,
      roles: jemaatRoles.map((jr) => (jr.subRole ? `${jr.role.nama} · ${jr.subRole.nama}` : jr.role.nama)),
      pending: loadMap.get(r.id) ?? 0,
    })),
    meta: { configured: true },
  });
});

// ── Per item ───────────────────────────────────────────────
async function loadOne(id: string | undefined = "") {
  if (!UUID_RE.test(id)) throw NotFound('Prayer request tidak ditemukan');
  const row = await prisma.prayerRequest.findFirst({
    where: { id, deletedAt: null },
    select: { ...adminSelect, petugasId: true },
  });
  if (!row) throw NotFound('Prayer request tidak ditemukan');
  return row;
}

prayerRequestRouter.get('/:id', requireMenu(MENU), async (req, res) => {
  const row = await loadOne(req.params.id);
  res.json({ success: true, data: serialize(row) });
});

prayerRequestRouter.patch('/:id/assign', requireMenu(MENU, 'write'), async (req, res) => {
  const row = await loadOne(req.params.id);
  const { petugasId } = assignPrayerSchema.parse(req.body ?? {});
  if (petugasId) {
    const roleWhere = await petugasRoleWhere();
    const ok =
      roleWhere &&
      (await prisma.jemaat.count({ where: { id: petugasId, isActive: true, jemaatRoles: { some: roleWhere } } })) > 0;
    if (!ok) throw BadRequest('Jemaat ini bukan petugas doa. Atur role petugas di Konfigurasi.');
  }
  const changed = petugasId !== row.petugasId;
  const updated = await prisma.prayerRequest.update({
    where: { id: row.id },
    data: {
      petugasId,
      assignedById: petugasId ? req.user!.jemaatId : null,
      assignedAt: petugasId ? (changed ? new Date() : undefined) : null,
      // Status petugas: assign → DITUGASKAN (kecuali sudah didoakan); lepas → BARU.
      status: row.status === 'SUDAH_DIDOAKAN' ? undefined : petugasId ? 'DITUGASKAN' : 'BARU',
    },
    select: adminSelect,
  });
  if (petugasId && changed) void notifyAssigned(row.id);
  audit(req, {
    action: 'UPDATE',
    resource: 'prayer-request',
    resourceId: row.id,
    resourceLabel: `Assign doa dari ${row.jemaat.namaLengkap} → ${updated.petugas?.namaLengkap ?? '(kosong)'}`,
    before: { petugasId: row.petugasId },
    after: { petugasId },
  });
  res.json({ success: true, data: serialize(updated) });
});

prayerRequestRouter.post('/:id/prayed', requireMenu(MENU, 'write'), async (req, res) => {
  const row = await loadOne(req.params.id);
  const { catatan } = markPrayedSchema.parse(req.body ?? {});
  const first = row.status !== 'SUDAH_DIDOAKAN';
  const updated = await prisma.prayerRequest.update({
    where: { id: row.id },
    data: {
      status: 'SUDAH_DIDOAKAN',
      didoakanAt: first ? new Date() : undefined,
      didoakanById: first ? req.user!.jemaatId : undefined,
      catatanPetugas: catatan,
    },
    select: adminSelect,
  });
  if (first) void notifyPrayed(row.id);
  audit(req, {
    action: 'UPDATE',
    resource: 'prayer-request',
    resourceId: row.id,
    resourceLabel: `Tandai sudah didoakan: doa dari ${row.jemaat.namaLengkap}`,
  });
  res.json({ success: true, data: serialize(updated) });
});

prayerRequestRouter.delete('/:id', requireMenu(MENU, 'delete'), async (req, res) => {
  const row = await loadOne(req.params.id);
  await prisma.prayerRequest.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
  audit(req, {
    action: 'DELETE',
    resource: 'prayer-request',
    resourceId: row.id,
    resourceLabel: `Hapus doa dari ${row.jemaat.namaLengkap}`,
  });
  res.json({ success: true });
});
