import { Router } from 'express';
import { prisma } from '@ecc/database';
import { requireAnyMenuP } from '../../middleware/require-menu.js';
import {
  createPelayananSchema,
  updatePelayananSchema,
  createPelayananRoleSchema,
  updatePelayananRoleSchema,
  assignJemaatPelayananSchema,
  updateJemaatPelayananSchema,
  linkIbadahPelayananSchema,
  assignPetugasSchema,
  updatePetugasSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound, BadRequest, Conflict } from '../../lib/errors.js';
import { phoneSearchTerms } from '../../lib/phone-search.js';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import {
  listTugasOptions,
  notifyTugasUpdated,
  parseTugas,
  refreshTugasNames,
  resolveTugas,
  tugasBodyInput,
  tugasDbValue,
  tugasSig,
} from '../../lib/pelayanan-tugas.js';

export const pelayananRouter = Router();
const UUID_PARAM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ===== Pelayanan (master) =====

pelayananRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [data, total] = await Promise.all([
    prisma.pelayanan.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        roles: { orderBy: { level: 'desc' } },
        // Hanya anggota AKTIF yang dihitung (riwayat nonaktif tidak).
        _count: { select: { jemaatPelayanan: { where: { isActive: true, jemaat: { isActive: true } } }, ibadahPelayanan: true } },
      },
    }),
    prisma.pelayanan.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// Path literal (mis. /by-kode, /role, /today) didaftarkan SETELAH route :param ini;
// non-UUID diteruskan ke route berikutnya supaya tidak jadi query UUID invalid (P2023).
pelayananRouter.get('/:id', async (req, res, next) => {
  if (!UUID_PARAM.test(req.params.id)) return next(); // mis. /role
  const item = await prisma.pelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      roles: { orderBy: { level: 'desc' } },
      jemaatPelayanan: {
        where: { isActive: true },
        include: {
          jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
          pelayananRole: true,
        },
      },
      ibadahPelayanan: {
        include: { ibadah: { select: { id: true, nama: true, hari: true, jamMulai: true } } },
      },
    },
  });
  if (!item) throw NotFound('Pelayanan tidak ditemukan');
  res.json({ success: true, data: item });
});

// ===== Anggota pelayanan (Portal → Pelayanan → detail) =====
// GET /admin/pelayanan/:id/members?search=&cabangId= → anggota aktif + cabang (dikelompokkan di Portal)
pelayananRouter.get('/:id/members', async (req, res, next) => {
  await requireAnyMenuP(req, ['pelayanan'], 'read');
  if (!UUID_PARAM.test(req.params.id)) return next();
  const pel = await prisma.pelayanan.findUnique({
    where: { id: req.params.id },
    select: { id: true, nama: true, deskripsi: true, ikon: true, warna: true, isActive: true, roles: { where: { isActive: true }, orderBy: { level: 'desc' }, select: { id: true, nama: true, level: true } } },
  });
  if (!pel) throw NotFound('Pelayanan tidak ditemukan');
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const cabangId = typeof req.query.cabangId === 'string' && UUID_PARAM.test(req.query.cabangId) ? req.query.cabangId : undefined;
  const rows = await prisma.jemaatPelayanan.findMany({
    where: {
      pelayananId: pel.id,
      isActive: true,
      jemaat: {
        isActive: true,
        ...(cabangId ? { cabangId } : {}),
        ...(search ? { OR: memberSearchOr(search) } : {}),
      },
    },
    orderBy: [{ jemaat: { namaLengkap: 'asc' } }],
    select: {
      id: true,
      tanggalMulai: true,
      catatan: true,
      pelayananRole: { select: { id: true, nama: true, level: true } },
      jemaat: {
        select: {
          id: true,
          namaLengkap: true,
          kode: true,
          fotoUrl: true,
          noHp: true,
          jenisKelamin: true,
          cabang: { select: { id: true, nama: true } },
        },
      },
    },
  });
  // Otoritas approval per anggota (cabang yang boleh disetujui).
  const approvers = await prisma.pelayananApprover.findMany({
    where: { pelayananId: pel.id, jemaatId: { in: rows.map((r) => r.jemaat.id) } },
    select: { jemaatId: true, cabang: { select: { id: true, nama: true } } },
    orderBy: { cabang: { nama: 'asc' } },
  });
  const byJemaat = new Map<string, { id: string; nama: string }[]>();
  for (const a of approvers) byJemaat.set(a.jemaatId, [...(byJemaat.get(a.jemaatId) ?? []), a.cabang]);
  res.json({
    success: true,
    data: { pelayanan: pel, members: rows.map((m) => ({ ...m, approvalCabang: byJemaat.get(m.jemaat.id) ?? [] })) },
  });
});

// PUT /admin/pelayanan/:id/approver/:jemaatId { cabangIds: string[] } → ganti otoritas approval
// request bergabung untuk anggota ini ([] = cabut). Anggota harus aktif.
pelayananRouter.put('/:id/approver/:jemaatId', async (req, res, next) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  if (!UUID_PARAM.test(req.params.id) || !UUID_PARAM.test(req.params.jemaatId)) return next();
  const { cabangIds } = z.object({ cabangIds: z.array(z.string().uuid()).max(50) }).parse(req.body ?? {});
  const member = await prisma.jemaatPelayanan.findFirst({
    where: { pelayananId: req.params.id, jemaatId: req.params.jemaatId, isActive: true },
    select: { jemaat: { select: { namaLengkap: true } }, pelayanan: { select: { nama: true } } },
  });
  if (!member) throw BadRequest('Otoritas hanya bisa diberikan ke anggota aktif pelayanan ini.');
  const ids = [...new Set(cabangIds)];
  if (ids.length) {
    const n = await prisma.cabangGereja.count({ where: { id: { in: ids } } });
    if (n !== ids.length) throw BadRequest('Cabang tidak ditemukan.');
  }
  const before = await prisma.pelayananApprover.findMany({
    where: { pelayananId: req.params.id, jemaatId: req.params.jemaatId },
    select: { cabang: { select: { nama: true } } },
  });
  await prisma.$transaction([
    prisma.pelayananApprover.deleteMany({ where: { pelayananId: req.params.id, jemaatId: req.params.jemaatId, cabangId: { notIn: ids } } }),
    prisma.pelayananApprover.createMany({
      data: ids.map((cabangId) => ({ pelayananId: req.params.id, jemaatId: req.params.jemaatId, cabangId })),
      skipDuplicates: true,
    }),
  ]);
  const after = await prisma.pelayananApprover.findMany({
    where: { pelayananId: req.params.id, jemaatId: req.params.jemaatId },
    select: { cabang: { select: { id: true, nama: true } } },
    orderBy: { cabang: { nama: 'asc' } },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan_approver',
    resourceId: req.params.jemaatId,
    resourceLabel: `Otoritas approval ${member.pelayanan.nama}: ${member.jemaat.namaLengkap} → ${after.map((a) => a.cabang.nama).join(', ') || '(dicabut)'}`,
    before: { cabang: before.map((b) => b.cabang.nama) },
    after: { cabang: after.map((a) => a.cabang.nama) },
  });
  res.json({ success: true, data: { cabang: after.map((a) => a.cabang) } });
});

/** Pencarian jemaat: nama, kode (QR), atau no HP (format lokal / +62). */
function memberSearchOr(search: string) {
  const kode = search.toUpperCase();
  return [
    { namaLengkap: { contains: search, mode: 'insensitive' as const } },
    { kode },
    { kode: { startsWith: kode } },
    { noHp: { contains: search } },
    ...phoneSearchTerms(search).map((t) => ({ noHp: { contains: t } })),
  ];
}

// GET /admin/pelayanan/:id/candidates?search= → cari jemaat untuk ditambahkan (+ flag sudah anggota)
pelayananRouter.get('/:id/candidates', async (req, res, next) => {
  await requireAnyMenuP(req, ['pelayanan'], 'read');
  if (!UUID_PARAM.test(req.params.id)) return next();
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search.length < 2) {
    res.json({ success: true, data: [] });
    return;
  }
  const rows = await prisma.jemaat.findMany({
    where: { isActive: true, isTamu: false, OR: memberSearchOr(search) },
    orderBy: { namaLengkap: 'asc' },
    take: 15,
    select: {
      id: true,
      namaLengkap: true,
      kode: true,
      noHp: true,
      fotoUrl: true,
      cabang: { select: { id: true, nama: true } },
      jemaatPelayanan: {
        where: { pelayananId: req.params.id, isActive: true },
        orderBy: { pelayananRole: { level: 'desc' } },
        select: { pelayananRole: { select: { id: true, nama: true } } },
      },
    },
  });
  const kode = search.toUpperCase();
  rows.sort((a, b) => Number(b.kode === kode) - Number(a.kode === kode));
  res.json({
    success: true,
    data: rows.map(({ jemaatPelayanan, ...j }) => ({
      ...j,
      memberRole: jemaatPelayanan.length ? jemaatPelayanan.map((jp) => jp.pelayananRole.nama).join(', ') : null,
      memberRoleIds: jemaatPelayanan.map((jp) => jp.pelayananRole.id),
    })),
  });
});

pelayananRouter.post('/', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const input = createPelayananSchema.parse(req.body);
  const created = await prisma.pelayanan.create({ data: input });
  audit(req, {
    action: 'CREATE',
    resource: 'pelayanan',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

pelayananRouter.patch('/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const input = updatePelayananSchema.parse(req.body);
  const before = await prisma.pelayanan.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Pelayanan tidak ditemukan');
  const updated = await prisma.pelayanan.update({ where: { id: req.params.id }, data: input });
  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

pelayananRouter.delete('/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'delete');
  const before = await prisma.pelayanan.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Pelayanan tidak ditemukan');

  // Anggota (jemaat_pelayanan) sengaja tidak ikut terhapus — riwayat pelayanan
  // jemaat penting. Minta admin mengeluarkan anggota dulu, atau nonaktifkan.
  // Termasuk keanggotaan yang memakai ROLE milik pelayanan ini walau tercatat
  // di pelayanan lain (data lama tidak konsisten) — FK role juga RESTRICT.
  const memberWhere = { OR: [{ pelayananId: before.id }, { pelayananRole: { pelayananId: before.id } }] };
  const [aktif, total] = await Promise.all([
    prisma.jemaatPelayanan.count({ where: { ...memberWhere, isActive: true } }),
    prisma.jemaatPelayanan.count({ where: memberWhere }),
  ]);
  // Hapus permanen (Portal, konfirmasi ketik nama): ?force=true&confirm=<nama>
  // → anggota & riwayat pelayanan jemaat ikut terhapus (tidak bisa dikembalikan).
  const force = req.query.force === 'true';
  if (force) {
    const confirm = typeof req.query.confirm === 'string' ? req.query.confirm.trim().toLowerCase() : '';
    if (confirm !== before.nama.trim().toLowerCase()) {
      throw BadRequest('Konfirmasi tidak cocok — ketik nama pelayanan persis untuk menghapus permanen.');
    }
  }
  if (total > 0 && !force) {
    throw Conflict(
      `Pelayanan "${before.nama}" tidak bisa dihapus karena masih tercatat ${total} anggota` +
        (aktif !== total ? ` (${aktif} aktif, ${total - aktif} riwayat)` : '') +
        '. Keluarkan anggotanya dulu, nonaktifkan pelayanan ini (data & riwayat tetap tersimpan), atau pilih Hapus permanen.',
      { reason: 'HAS_MEMBERS', members: total, active: aktif },
    );
  }

  // Susunan petugas memakai role pelayanan ini (FK RESTRICT ke role) → hapus
  // dulu secara eksplisit, lalu pelayanan (link ibadah/event, role, jadwal ikut terhapus).
  try {
    await prisma.$transaction([
      prisma.ibadahPelayananPetugas.deleteMany({ where: { pelayananRole: { pelayananId: before.id } } }),
      prisma.eventPelayananPetugas.deleteMany({ where: { pelayananRole: { pelayananId: before.id } } }),
      prisma.pelayananScheduleAssignment.deleteMany({ where: { pelayananRole: { pelayananId: before.id } } }),
      // Hanya terisi saat force (tanpa force, total sudah dipastikan 0).
      prisma.jemaatPelayanan.deleteMany({ where: memberWhere }),
      prisma.pelayanan.delete({ where: { id: before.id } }),
    ]);
  } catch (err) {
    // Masih ada data lain yang mengunci (relasi baru / data tidak konsisten) —
    // sebutkan constraint-nya supaya mudah ditelusuri, bukan pesan generik.
    const e = err as { code?: string; meta?: { field_name?: string; constraint?: string } };
    if (e.code === 'P2003') {
      throw Conflict(
        `Pelayanan "${before.nama}" masih dipakai data lain (${e.meta?.field_name ?? e.meta?.constraint ?? 'relasi'}). ` +
          'Hubungi tim IT dengan pesan ini.',
        { reason: 'FK_BLOCKED', constraint: e.meta?.field_name ?? e.meta?.constraint ?? null },
      );
    }
    throw err;
  }
  audit(req, {
    action: 'DELETE',
    resource: 'pelayanan',
    resourceId: before.id,
    resourceLabel: force ? `${before.nama} (hapus permanen, ${total} anggota)` : before.nama,
    before,
    metadata: { force, membersDeleted: force ? total : 0 },
  });
  res.status(204).end();
});

// ===== PelayananRole (per-pelayanan) =====

// Flat list semua role lintas pelayanan (untuk page Role Pelayanan).
// Filter: pelayananId (opsional)
pelayananRouter.get('/role', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const pelayananId = typeof req.query.pelayananId === 'string' ? req.query.pelayananId : undefined;
  const where: any = {};
  if (pelayananId) where.pelayananId = pelayananId;
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };

  const [data, total] = await Promise.all([
    prisma.pelayananRole.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: [{ pelayanan: { nama: 'asc' } }, { level: 'desc' }, { nama: 'asc' }],
      include: { pelayanan: { select: { id: true, nama: true } } },
    }),
    prisma.pelayananRole.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

pelayananRouter.post('/role', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const input = createPelayananRoleSchema.parse(req.body);
  const created = await prisma.pelayananRole.create({
    data: input,
    include: { pelayanan: { select: { nama: true } } },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'pelayanan_role',
    resourceId: created.id,
    resourceLabel: `${created.pelayanan.nama}:${created.nama}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

pelayananRouter.patch('/role/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const input = updatePelayananRoleSchema.parse(req.body);
  const before = await prisma.pelayananRole.findUnique({
    where: { id: req.params.id },
    include: { pelayanan: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Pelayanan role tidak ditemukan');
  const updated = await prisma.pelayananRole.update({ where: { id: req.params.id }, data: input });
  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan_role',
    resourceId: updated.id,
    resourceLabel: `${before.pelayanan.nama}:${updated.nama}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

pelayananRouter.delete('/role/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'delete');
  const before = await prisma.pelayananRole.findUnique({
    where: { id: req.params.id },
    include: { pelayanan: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Pelayanan role tidak ditemukan');
  await prisma.pelayananRole.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'pelayanan_role',
    resourceId: before.id,
    resourceLabel: `${before.pelayanan.nama}:${before.nama}`,
    before,
  });
  res.status(204).end();
});

// ===== Assign jemaat ke pelayanan =====

// List penugasan untuk 1 jemaat (semua active + history)
pelayananRouter.get('/assign/jemaat/:jemaatId', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'jemaat'], 'read');
  const data = await prisma.jemaatPelayanan.findMany({
    where: { jemaatId: req.params.jemaatId },
    orderBy: [{ isActive: 'desc' }, { tanggalMulai: 'desc' }],
    include: {
      pelayanan: { select: { id: true, nama: true, ikon: true, warna: true } },
      pelayananRole: { select: { id: true, nama: true, level: true } },
    },
  });
  res.json({ success: true, data });
});

pelayananRouter.post('/assign', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'jemaat'], 'write');
  const input = assignJemaatPelayananSchema.parse(req.body);
  // Validasi: role harus belong ke pelayanan yang sama
  const role = await prisma.pelayananRole.findUnique({ where: { id: input.pelayananRoleId } });
  if (!role || role.pelayananId !== input.pelayananId) {
    throw BadRequest('Role tidak terkait dengan pelayanan yang dipilih');
  }
  // Satu jemaat boleh punya beberapa penugasan aktif di pelayanan yang sama
  // (role berbeda). Yang ditolak hanya duplikat persis: pelayanan + role sama.
  const existing = await prisma.jemaatPelayanan.findFirst({
    where: {
      jemaatId: input.jemaatId,
      pelayananId: input.pelayananId,
      pelayananRoleId: input.pelayananRoleId,
      isActive: true,
    },
    select: { pelayananRole: { select: { nama: true } } },
  });
  if (existing) throw Conflict(`Jemaat ini sudah aktif di pelayanan ini sebagai ${existing.pelayananRole.nama}.`);
  const data = {
    ...input,
    tanggalMulai: input.tanggalMulai ? new Date(input.tanggalMulai) : new Date(),
  };
  const created = await prisma.jemaatPelayanan.create({
    data,
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayanan: { select: { nama: true } },
      pelayananRole: { select: { nama: true } },
    },
  });
  const label = `${created.jemaat.namaLengkap} as ${created.pelayanan.nama}:${created.pelayananRole.nama}`;
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat_pelayanan',
    resourceId: created.id,
    resourceLabel: label,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

pelayananRouter.patch('/assign/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'jemaat'], 'write');
  const input = updateJemaatPelayananSchema.parse(req.body);
  const before = await prisma.jemaatPelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayanan: { select: { nama: true } },
    },
  });
  if (!before) throw NotFound('Penugasan tidak ditemukan');
  const data = {
    ...input,
    tanggalSelesai: input.tanggalSelesai ? new Date(input.tanggalSelesai) : undefined,
  };
  const updated = await prisma.jemaatPelayanan.update({ where: { id: req.params.id }, data });
  // Keluar dari pelayanan → otoritas approval-nya ikut dicabut.
  if (input.isActive === false) {
    await prisma.pelayananApprover.deleteMany({ where: { pelayananId: updated.pelayananId, jemaatId: updated.jemaatId } });
  }
  const label = `${before.jemaat.namaLengkap} as ${before.pelayanan.nama}`;
  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat_pelayanan',
    resourceId: updated.id,
    resourceLabel: label,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

pelayananRouter.delete('/assign/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'jemaat'], 'delete');
  const before = await prisma.jemaatPelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayanan: { select: { nama: true } },
    },
  });
  if (!before) throw NotFound('Penugasan tidak ditemukan');
  await prisma.jemaatPelayanan.delete({ where: { id: req.params.id } });
  // Tidak ada keanggotaan aktif lain → otoritas approval ikut dicabut (supaya tidak
  // "hidup lagi" bila nanti ditambahkan kembali).
  const masih = await prisma.jemaatPelayanan.count({
    where: { jemaatId: before.jemaatId, pelayananId: before.pelayananId, isActive: true },
  });
  if (masih === 0) {
    await prisma.pelayananApprover.deleteMany({ where: { pelayananId: before.pelayananId, jemaatId: before.jemaatId } });
  }
  audit(req, {
    action: 'DELETE',
    resource: 'jemaat_pelayanan',
    resourceId: before.id,
    resourceLabel: `${before.jemaat.namaLengkap} as ${before.pelayanan.nama}`,
    before,
  });
  res.status(204).end();
});

// ===== Link pelayanan ke ibadah =====

// List pelayanan yang melayani di 1 ibadah
pelayananRouter.get('/ibadah-link/ibadah/:ibadahId', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah'], 'read');
  const data = await prisma.ibadahPelayanan.findMany({
    where: { ibadahId: req.params.ibadahId },
    include: { pelayanan: { select: { id: true, nama: true, deskripsi: true, ikon: true, warna: true } } },
    orderBy: { pelayanan: { nama: 'asc' } },
  });
  res.json({ success: true, data });
});

pelayananRouter.post('/ibadah-link', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah'], 'write');
  const input = linkIbadahPelayananSchema.parse(req.body);
  const created = await prisma.ibadahPelayanan.create({
    data: input,
    include: {
      pelayanan: { select: { nama: true } },
      ibadah: { select: { nama: true } },
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'ibadah_pelayanan',
    resourceId: created.id,
    resourceLabel: `${created.pelayanan.nama} → ${created.ibadah.nama}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

pelayananRouter.delete('/ibadah-link/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah'], 'delete');
  const before = await prisma.ibadahPelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      pelayanan: { select: { nama: true } },
      ibadah: { select: { nama: true } },
    },
  });
  if (!before) throw NotFound('Link tidak ditemukan');
  await prisma.ibadahPelayanan.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'ibadah_pelayanan',
    resourceId: before.id,
    resourceLabel: `${before.pelayanan.nama} → ${before.ibadah.nama}`,
    before,
  });
  res.status(204).end();
});

// ===== Petugas (jemaat yang bertugas di ibadah-pelayanan specific) =====

// List petugas untuk 1 ibadah-pelayanan link.
//   - Tanpa query → return SEMUA row (default + override). UI bisa group
//     berdasarkan tanggalIbadah null vs isi.
//   - ?tanggal=YYYY-MM-DD → resolved view untuk tanggal itu (snapshot
//     semantics: kalau ada override untuk tanggal → pakai override only;
//     kalau tidak → pakai default).
pelayananRouter.get('/ibadah-link/:id/petugas', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah'], 'read');
  const tanggalStr = typeof req.query.tanggal === 'string' ? req.query.tanggal : undefined;

  const rows = await prisma.ibadahPelayananPetugas.findMany({
    where: { ibadahPelayananId: req.params.id },
    orderBy: [{ pelayananRole: { level: 'desc' } }, { jemaat: { namaLengkap: 'asc' } }],
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      pelayananRole: { select: { id: true, nama: true, level: true } },
    },
  });
  // 2.5.0 — tugas dinormalisasi + nama terkini dari master.
  const all = rows.map((r) => ({ ...r, tugas: parseTugas(r.tugas) }));
  await refreshTugasNames(all.map((r) => r.tugas));

  if (!tanggalStr) {
    res.json({ success: true, data: all });
    return;
  }

  // Validate tanggal format
  const tanggalDate = new Date(tanggalStr);
  if (isNaN(tanggalDate.getTime())) {
    throw BadRequest('Format tanggal harus YYYY-MM-DD');
  }
  // Resolve snapshot
  const overrides = all.filter(
    (p) => p.tanggalIbadah && p.tanggalIbadah.toISOString().slice(0, 10) === tanggalStr,
  );
  const data = overrides.length > 0 ? overrides : all.filter((p) => p.tanggalIbadah === null);
  res.json({
    success: true,
    data,
    meta: { tanggal: tanggalStr, source: overrides.length > 0 ? 'override' : 'default' },
  });
});

// Assign petugas (default ATAU override per tanggal)
pelayananRouter.post('/petugas', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah'], 'write');
  const input = assignPetugasSchema.parse(req.body);
  const tugasIn = tugasBodyInput.parse(req.body ?? {}).tugas;

  // Validasi: pelayananRoleId harus belong ke pelayanan dari ibadahPelayanan
  const link = await prisma.ibadahPelayanan.findUnique({
    where: { id: input.ibadahPelayananId },
    include: { pelayanan: { select: { id: true, nama: true } }, ibadah: { select: { nama: true } } },
  });
  if (!link) throw NotFound('Ibadah-pelayanan link tidak ditemukan');

  const role = await prisma.pelayananRole.findUnique({ where: { id: input.pelayananRoleId } });
  if (!role) throw NotFound('Role tidak ditemukan');
  if (role.pelayananId !== link.pelayananId) {
    throw BadRequest(`Role "${role.nama}" bukan milik pelayanan ${link.pelayanan.nama}`);
  }

  const data = {
    ibadahPelayananId: input.ibadahPelayananId,
    jemaatId: input.jemaatId,
    pelayananRoleId: input.pelayananRoleId,
    catatan: input.catatan,
    tanggalIbadah: input.tanggalIbadah ? new Date(input.tanggalIbadah) : null,
    canScanAttendance: input.canScanAttendance ?? false,
    // Override tanggal tanpa pilihan tugas → warisi tugas dari susunan default.
    tugas: tugasDbValue(
      tugasIn !== undefined
        ? await resolveTugas(link.pelayananId, tugasIn ?? [])
        : input.tanggalIbadah
          ? parseTugas(
              (
                await prisma.ibadahPelayananPetugas.findFirst({
                  where: { ibadahPelayananId: link.id, jemaatId: input.jemaatId, tanggalIbadah: null },
                  select: { tugas: true },
                })
              )?.tugas,
            )
          : null,
    ),
  };

  const created = await prisma.ibadahPelayananPetugas.create({
    data,
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayananRole: { select: { nama: true } },
    },
  });
  const dateLabel = data.tanggalIbadah ? ` [${input.tanggalIbadah}]` : ' [default]';
  const label = `${created.jemaat.namaLengkap} (${created.pelayananRole.nama})${dateLabel} — ${link.pelayanan.nama} @ ${link.ibadah.nama}`;
  audit(req, {
    action: 'CREATE',
    resource: 'ibadah_pelayanan_petugas',
    resourceId: created.id,
    resourceLabel: label,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// Update petugas (mis. ganti role)
pelayananRouter.patch('/petugas/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah'], 'write');
  const input = updatePetugasSchema.parse(req.body);
  const tugasIn = tugasBodyInput.parse(req.body ?? {}).tugas;
  const before = await prisma.ibadahPelayananPetugas.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      ibadahPelayanan: {
        include: { pelayanan: { select: { id: true, nama: true } }, ibadah: { select: { nama: true } } },
      },
    },
  });
  if (!before) throw NotFound('Petugas tidak ditemukan');

  if (input.pelayananRoleId) {
    const role = await prisma.pelayananRole.findUnique({ where: { id: input.pelayananRoleId } });
    if (!role || role.pelayananId !== before.ibadahPelayanan.pelayananId) {
      throw BadRequest(`Role tidak terkait dengan pelayanan ${before.ibadahPelayanan.pelayanan.nama}`);
    }
  }

  // tugas: undefined = tidak diubah; null/[] = dikosongkan.
  const tugasNew =
    tugasIn === undefined
      ? undefined
      : await resolveTugas(before.ibadahPelayanan.pelayananId, tugasIn ?? [], parseTugas(before.tugas));
  const updated = await prisma.ibadahPelayananPetugas.update({
    where: { id: req.params.id },
    data: { ...input, ...(tugasNew !== undefined ? { tugas: tugasDbValue(tugasNew) } : {}) },
  });
  if (tugasNew !== undefined && tugasSig(before.tugas) !== tugasSig(tugasNew)) {
    const tgl = before.tanggalIbadah ? `, ${before.tanggalIbadah.toISOString().slice(0, 10)}` : '';
    void notifyTugasUpdated({
      jemaatId: before.jemaatId,
      ministry: before.ibadahPelayanan.pelayanan.nama,
      ministryId: before.ibadahPelayanan.pelayanan.id,
      label: `${before.ibadahPelayanan.ibadah.nama}${tgl}`,
      tugas: tugasNew,
    });
  }
  audit(req, {
    action: 'UPDATE',
    resource: 'ibadah_pelayanan_petugas',
    resourceId: updated.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.ibadahPelayanan.pelayanan.nama}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// Delete petugas
pelayananRouter.delete('/petugas/:id', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah'], 'delete');
  const before = await prisma.ibadahPelayananPetugas.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      ibadahPelayanan: {
        include: {
          pelayanan: { select: { nama: true } },
          ibadah: { select: { nama: true } },
        },
      },
    },
  });
  if (!before) throw NotFound('Petugas tidak ditemukan');
  await prisma.ibadahPelayananPetugas.delete({ where: { id: req.params.id } });
  const label = `${before.jemaat.namaLengkap} — ${before.ibadahPelayanan.pelayanan.nama} @ ${before.ibadahPelayanan.ibadah.nama}`;
  audit(req, {
    action: 'DELETE',
    resource: 'ibadah_pelayanan_petugas',
    resourceId: before.id,
    resourceLabel: label,
    before,
  });
  res.status(204).end();
});

// ===== Penugasan pelayanan ke ibadah & event (Portal → Pelayanan → Lihat penugasan) =====
//   GET  /admin/pelayanan/:id/penugasan  → semua ibadah aktif + event mendatang,
//        dengan tanda `linked` (pelayanan ini melayani di sana) + jumlah petugas.
//   POST /admin/pelayanan/:id/penugasan  { action: 'assign'|'unassign', ibadahIds, eventIds }
//        Tugaskan / lepas tugaskan massal. Lepas tugas = hapus link → susunan
//        petugas pelayanan ini di ibadah/event tsb ikut terhapus.
const penugasanSchema = z.object({
  action: z.enum(['assign', 'unassign']),
  ibadahIds: z.array(z.string().uuid()).max(500).default([]),
  eventIds: z.array(z.string().uuid()).max(500).default([]),
});

pelayananRouter.get('/:id/penugasan', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah', 'event'], 'read');
  if (!UUID_PARAM.test(req.params.id)) throw NotFound('Pelayanan tidak ditemukan');
  const pel = await prisma.pelayanan.findUnique({ where: { id: req.params.id }, select: { id: true, nama: true, ikon: true, warna: true } });
  if (!pel) throw NotFound('Pelayanan tidak ditemukan');

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [ibadahs, events] = await Promise.all([
    prisma.ibadah.findMany({
      where: { isActive: true },
      orderBy: [{ cabang: { nama: 'asc' } }, { urutan: 'asc' }, { jamMulai: 'asc' }],
      select: {
        id: true,
        nama: true,
        tipeJadwal: true,
        hari: true,
        jamMulai: true,
        jamSelesai: true,
        isKidsIbadah: true,
        cabang: { select: { id: true, nama: true } },
        kategoriIbadah: { select: { nama: true } },
        ibadahPelayanan: { where: { pelayananId: pel.id }, select: { id: true, _count: { select: { petugas: true } } } },
      },
    }),
    prisma.event.findMany({
      where: { isActive: true, OR: [{ tanggalSelesai: { gte: today } }, { tanggalSelesai: null, tanggalMulai: { gte: today } }] },
      orderBy: { tanggalMulai: 'asc' },
      take: 300,
      select: {
        id: true,
        judul: true,
        tanggalMulai: true,
        tanggalSelesai: true,
        jamMulai: true,
        isPublished: true,
        cabang: { select: { id: true, nama: true } },
        pelayanan: { where: { pelayananId: pel.id }, select: { id: true, _count: { select: { petugas: true } } } },
      },
    }),
  ]);

  res.json({
    success: true,
    data: {
      pelayanan: pel,
      ibadah: ibadahs.map(({ ibadahPelayanan, ...i }) => ({
        ...i,
        linked: ibadahPelayanan.length > 0,
        petugasCount: ibadahPelayanan[0]?._count.petugas ?? 0,
      })),
      events: events.map(({ pelayanan: links, ...e }) => ({
        ...e,
        linked: links.length > 0,
        petugasCount: links[0]?._count.petugas ?? 0,
      })),
    },
  });
});

pelayananRouter.post('/:id/penugasan', async (req, res) => {
  const input = penugasanSchema.parse(req.body);
  await requireAnyMenuP(req, ['pelayanan', 'ibadah', 'event'], input.action === 'assign' ? 'write' : 'delete');
  if (!UUID_PARAM.test(req.params.id)) throw NotFound('Pelayanan tidak ditemukan');
  const pel = await prisma.pelayanan.findUnique({ where: { id: req.params.id }, select: { id: true, nama: true } });
  if (!pel) throw NotFound('Pelayanan tidak ditemukan');
  if (!input.ibadahIds.length && !input.eventIds.length) throw BadRequest('Pilih minimal satu ibadah atau event.');

  let ibadahCount = 0;
  let eventCount = 0;
  if (input.action === 'assign') {
    // Hanya ibadah/event yang ada (id asing diabaikan); yang sudah ditugaskan dilewati.
    const [ibs, evs] = await Promise.all([
      input.ibadahIds.length ? prisma.ibadah.findMany({ where: { id: { in: input.ibadahIds } }, select: { id: true } }) : [],
      input.eventIds.length ? prisma.event.findMany({ where: { id: { in: input.eventIds } }, select: { id: true } }) : [],
    ]);
    const r1 = ibs.length
      ? await prisma.ibadahPelayanan.createMany({ data: ibs.map((i) => ({ ibadahId: i.id, pelayananId: pel.id })), skipDuplicates: true })
      : { count: 0 };
    const r2 = evs.length
      ? await prisma.eventPelayanan.createMany({ data: evs.map((e) => ({ eventId: e.id, pelayananId: pel.id })), skipDuplicates: true })
      : { count: 0 };
    ibadahCount = r1.count;
    eventCount = r2.count;
  } else {
    const r1 = input.ibadahIds.length
      ? await prisma.ibadahPelayanan.deleteMany({ where: { pelayananId: pel.id, ibadahId: { in: input.ibadahIds } } })
      : { count: 0 };
    const r2 = input.eventIds.length
      ? await prisma.eventPelayanan.deleteMany({ where: { pelayananId: pel.id, eventId: { in: input.eventIds } } })
      : { count: 0 };
    ibadahCount = r1.count;
    eventCount = r2.count;
  }

  audit(req, {
    action: input.action === 'assign' ? 'CREATE' : 'DELETE',
    resource: 'pelayanan_penugasan',
    resourceId: pel.id,
    resourceLabel: `${input.action === 'assign' ? 'Tugaskan' : 'Lepas tugas'} ${pel.nama}: ${ibadahCount} ibadah, ${eventCount} event`,
    metadata: { ibadahIds: input.ibadahIds, eventIds: input.eventIds, ibadahCount, eventCount },
  });
  res.json({ success: true, data: { action: input.action, ibadah: ibadahCount, event: eventCount } });
});

// ============================================================
//  2.5.0 — Master bagian/tugas petugas (Kategori → Tugas) per pelayanan.
//   GET    /admin/pelayanan/:id/tugas-kategori            (termasuk nonaktif)
//   POST   /admin/pelayanan/:id/tugas-kategori            { nama, ikon?, urutan? }
//   PATCH  /admin/pelayanan/tugas-kategori/:kid           { nama?, ikon?, urutan?, isActive? }
//   DELETE /admin/pelayanan/tugas-kategori/:kid           → nonaktif (soft)
//   POST   /admin/pelayanan/tugas-kategori/:kid/tugas     { nama, urutan? }
//   PATCH  /admin/pelayanan/tugas-item/:tid               { nama?, urutan?, isActive? }
//   DELETE /admin/pelayanan/tugas-item/:tid               → nonaktif (soft)
//  Hapus = nonaktif supaya jadwal lama (snapshot) tetap utuh; nama yang sama
//  bisa diaktifkan lagi.
// ============================================================

const kategoriBody = z.object({
  nama: z.string().trim().min(1).max(60),
  ikon: z.string().trim().max(40).nullish(),
  urutan: z.number().int().min(0).max(999).optional(),
});
const tugasItemBody = z.object({ nama: z.string().trim().min(1).max(80), urutan: z.number().int().min(0).max(999).optional() });
const isUniqueErr = (e: unknown) => (e as { code?: string })?.code === 'P2002';

pelayananRouter.get('/:id/tugas-kategori', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan', 'ibadah', 'event'], 'read');
  const pel = await prisma.pelayanan.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!pel) throw NotFound('Pelayanan tidak ditemukan');
  const includeInactive = req.query.all === '1' || req.query.all === 'true';
  res.json({ success: true, data: await listTugasOptions(pel.id, { includeInactive }) });
});

pelayananRouter.post('/:id/tugas-kategori', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const input = kategoriBody.parse(req.body ?? {});
  const pel = await prisma.pelayanan.findUnique({ where: { id: req.params.id }, select: { id: true, nama: true } });
  if (!pel) throw NotFound('Pelayanan tidak ditemukan');
  const existing = await prisma.pelayananTugasKategori.findUnique({
    where: { pelayananId_nama: { pelayananId: pel.id, nama: input.nama } },
  });
  if (existing?.isActive) throw Conflict(`Kategori "${input.nama}" sudah ada.`);
  const urutan = input.urutan ?? (await prisma.pelayananTugasKategori.count({ where: { pelayananId: pel.id } }));
  const row = existing
    ? await prisma.pelayananTugasKategori.update({
        where: { id: existing.id },
        data: { isActive: true, ikon: input.ikon ?? existing.ikon, urutan },
      })
    : await prisma.pelayananTugasKategori.create({
        data: { pelayananId: pel.id, nama: input.nama, ikon: input.ikon ?? null, urutan },
      });
  audit(req, {
    action: 'CREATE',
    resource: 'pelayanan_tugas_kategori',
    resourceId: row.id,
    resourceLabel: `Kategori tugas ${pel.nama}: ${row.nama}`,
    after: row,
  });
  res.status(201).json({ success: true, data: row });
});

pelayananRouter.patch('/tugas-kategori/:kid', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const input = kategoriBody.partial().extend({ isActive: z.boolean().optional() }).parse(req.body ?? {});
  const before = await prisma.pelayananTugasKategori.findUnique({ where: { id: req.params.kid } });
  if (!before) throw NotFound('Kategori tidak ditemukan');
  try {
    const row = await prisma.pelayananTugasKategori.update({ where: { id: before.id }, data: input });
    audit(req, {
      action: 'UPDATE',
      resource: 'pelayanan_tugas_kategori',
      resourceId: row.id,
      resourceLabel: `Kategori tugas: ${row.nama}`,
      before,
      after: row,
    });
    res.json({ success: true, data: row });
  } catch (e) {
    if (isUniqueErr(e)) throw Conflict(`Kategori "${input.nama}" sudah ada.`);
    throw e;
  }
});

pelayananRouter.delete('/tugas-kategori/:kid', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const before = await prisma.pelayananTugasKategori.findUnique({ where: { id: req.params.kid } });
  if (!before) throw NotFound('Kategori tidak ditemukan');
  await prisma.pelayananTugasKategori.update({ where: { id: before.id }, data: { isActive: false } });
  audit(req, {
    action: 'DELETE',
    resource: 'pelayanan_tugas_kategori',
    resourceId: before.id,
    resourceLabel: `Kategori tugas: ${before.nama} (nonaktif)`,
    before,
  });
  res.json({ success: true, data: { ok: true } });
});

pelayananRouter.post('/tugas-kategori/:kid/tugas', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const input = tugasItemBody.parse(req.body ?? {});
  const kat = await prisma.pelayananTugasKategori.findUnique({ where: { id: req.params.kid }, select: { id: true, nama: true } });
  if (!kat) throw NotFound('Kategori tidak ditemukan');
  const existing = await prisma.pelayananTugas.findUnique({ where: { kategoriId_nama: { kategoriId: kat.id, nama: input.nama } } });
  if (existing?.isActive) throw Conflict(`Tugas "${input.nama}" sudah ada di ${kat.nama}.`);
  const urutan = input.urutan ?? (await prisma.pelayananTugas.count({ where: { kategoriId: kat.id } }));
  const row = existing
    ? await prisma.pelayananTugas.update({ where: { id: existing.id }, data: { isActive: true, urutan } })
    : await prisma.pelayananTugas.create({ data: { kategoriId: kat.id, nama: input.nama, urutan } });
  audit(req, {
    action: 'CREATE',
    resource: 'pelayanan_tugas',
    resourceId: row.id,
    resourceLabel: `Tugas ${kat.nama} › ${row.nama}`,
    after: row,
  });
  res.status(201).json({ success: true, data: row });
});

pelayananRouter.patch('/tugas-item/:tid', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const input = tugasItemBody.partial().extend({ isActive: z.boolean().optional() }).parse(req.body ?? {});
  const before = await prisma.pelayananTugas.findUnique({ where: { id: req.params.tid } });
  if (!before) throw NotFound('Tugas tidak ditemukan');
  try {
    const row = await prisma.pelayananTugas.update({ where: { id: before.id }, data: input });
    audit(req, {
      action: 'UPDATE',
      resource: 'pelayanan_tugas',
      resourceId: row.id,
      resourceLabel: `Tugas: ${row.nama}`,
      before,
      after: row,
    });
    res.json({ success: true, data: row });
  } catch (e) {
    if (isUniqueErr(e)) throw Conflict(`Tugas "${input.nama}" sudah ada.`);
    throw e;
  }
});

pelayananRouter.delete('/tugas-item/:tid', async (req, res) => {
  await requireAnyMenuP(req, ['pelayanan'], 'write');
  const before = await prisma.pelayananTugas.findUnique({ where: { id: req.params.tid } });
  if (!before) throw NotFound('Tugas tidak ditemukan');
  await prisma.pelayananTugas.update({ where: { id: before.id }, data: { isActive: false } });
  audit(req, {
    action: 'DELETE',
    resource: 'pelayanan_tugas',
    resourceId: before.id,
    resourceLabel: `Tugas: ${before.nama} (nonaktif)`,
    before,
  });
  res.json({ success: true, data: { ok: true } });
});
