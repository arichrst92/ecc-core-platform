import { Router } from 'express';
import { prisma } from '@ecc/database';
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
  if (!UUID_PARAM.test(req.params.id)) return next();
  const pel = await prisma.pelayanan.findUnique({
    where: { id: req.params.id },
    select: { id: true, nama: true, deskripsi: true, isActive: true, roles: { where: { isActive: true }, orderBy: { level: 'desc' }, select: { id: true, nama: true, level: true } } },
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
        select: { pelayananRole: { select: { nama: true } } },
        take: 1,
      },
    },
  });
  const kode = search.toUpperCase();
  rows.sort((a, b) => Number(b.kode === kode) - Number(a.kode === kode));
  res.json({
    success: true,
    data: rows.map(({ jemaatPelayanan, ...j }) => ({ ...j, memberRole: jemaatPelayanan[0]?.pelayananRole.nama ?? null })),
  });
});

pelayananRouter.post('/', async (req, res) => {
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
  const before = await prisma.pelayanan.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Pelayanan tidak ditemukan');
  await prisma.pelayanan.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'pelayanan',
    resourceId: before.id,
    resourceLabel: before.nama,
    before,
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
  const data = await prisma.jemaatPelayanan.findMany({
    where: { jemaatId: req.params.jemaatId },
    orderBy: [{ isActive: 'desc' }, { tanggalMulai: 'desc' }],
    include: {
      pelayanan: { select: { id: true, nama: true } },
      pelayananRole: { select: { id: true, nama: true, level: true } },
    },
  });
  res.json({ success: true, data });
});

pelayananRouter.post('/assign', async (req, res) => {
  const input = assignJemaatPelayananSchema.parse(req.body);
  // Validasi: role harus belong ke pelayanan yang sama
  const role = await prisma.pelayananRole.findUnique({ where: { id: input.pelayananRoleId } });
  if (!role || role.pelayananId !== input.pelayananId) {
    throw BadRequest('Role tidak terkait dengan pelayanan yang dipilih');
  }
  // Satu keanggotaan aktif per jemaat per pelayanan (ganti role lewat PATCH).
  const existing = await prisma.jemaatPelayanan.findFirst({
    where: { jemaatId: input.jemaatId, pelayananId: input.pelayananId, isActive: true },
    select: { pelayananRole: { select: { nama: true } } },
  });
  if (existing) throw Conflict(`Jemaat ini sudah menjadi anggota pelayanan ini (role ${existing.pelayananRole.nama}).`);
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
  const before = await prisma.jemaatPelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayanan: { select: { nama: true } },
    },
  });
  if (!before) throw NotFound('Penugasan tidak ditemukan');
  await prisma.jemaatPelayanan.delete({ where: { id: req.params.id } });
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
  const data = await prisma.ibadahPelayanan.findMany({
    where: { ibadahId: req.params.ibadahId },
    include: { pelayanan: { select: { id: true, nama: true, deskripsi: true } } },
    orderBy: { pelayanan: { nama: 'asc' } },
  });
  res.json({ success: true, data });
});

pelayananRouter.post('/ibadah-link', async (req, res) => {
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
  const tanggalStr = typeof req.query.tanggal === 'string' ? req.query.tanggal : undefined;

  const all = await prisma.ibadahPelayananPetugas.findMany({
    where: { ibadahPelayananId: req.params.id },
    orderBy: [{ pelayananRole: { level: 'desc' } }, { jemaat: { namaLengkap: 'asc' } }],
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      pelayananRole: { select: { id: true, nama: true, level: true } },
    },
  });

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
  const input = assignPetugasSchema.parse(req.body);

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
  const input = updatePetugasSchema.parse(req.body);
  const before = await prisma.ibadahPelayananPetugas.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      ibadahPelayanan: {
        include: { pelayanan: { select: { id: true, nama: true } } },
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

  const updated = await prisma.ibadahPelayananPetugas.update({
    where: { id: req.params.id },
    data: input,
  });
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
