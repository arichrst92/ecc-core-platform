/**
 * IT Minister Team — assignment jemaat ke divisi + role.
 * Per Protokol Departemen IT ECC v0.3 (2026-09-02).
 *
 * Endpoints:
 *   GET    /admin/it-minister-team              → list all assignments (filter: divisi, isActive)
 *   GET    /admin/it-minister-team/org-chart    → hierarchical structure per divisi
 *   GET    /admin/it-minister-team/me           → current user's team assignments (untuk ops/planning app RBAC)
 *   GET    /admin/it-minister-team/:id          → detail
 *   POST   /admin/it-minister-team              → assign jemaat (validated)
 *   PATCH  /admin/it-minister-team/:id          → update (deactivate, change role, dsb)
 *   DELETE /admin/it-minister-team/:id          → hard delete (jarang, biasanya deactivate)
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const itMinisterTeamRouter = Router();

const VALID_DIVISI = ['HEAD', 'COORDINATOR', 'PRODUCT', 'DATA', 'OPERATION'] as const;
const VALID_ROLES = [
  'HEAD_IT_MINISTER',
  'IT_COORDINATOR',
  'HEAD_PRODUCT',
  'SPECIFIC_PRODUCT',
  'HEAD_DATA',
  'DATA_MEMBER',
  'HEAD_OPERATION',
  'OPERATION_L0',
  'OPERATION_L1',
  'OPERATION_L2',
] as const;

// Rule: role wajib match divisi
const ROLE_TO_DIVISI: Record<(typeof VALID_ROLES)[number], (typeof VALID_DIVISI)[number]> = {
  HEAD_IT_MINISTER: 'HEAD',
  IT_COORDINATOR: 'COORDINATOR',
  HEAD_PRODUCT: 'PRODUCT',
  SPECIFIC_PRODUCT: 'PRODUCT',
  HEAD_DATA: 'DATA',
  DATA_MEMBER: 'DATA',
  HEAD_OPERATION: 'OPERATION',
  OPERATION_L0: 'OPERATION',
  OPERATION_L1: 'OPERATION',
  OPERATION_L2: 'OPERATION',
};

// GET /admin/it-minister-team?divisi=&isActive=
itMinisterTeamRouter.get('/', async (req, res) => {
  const divisi = typeof req.query.divisi === 'string' ? req.query.divisi : undefined;
  const isActiveRaw = req.query.isActive;
  const isActive =
    isActiveRaw === 'true' ? true : isActiveRaw === 'false' ? false : undefined;

  const where: Record<string, unknown> = {};
  if (divisi && (VALID_DIVISI as readonly string[]).includes(divisi)) {
    where.divisi = divisi;
  }
  if (typeof isActive === 'boolean') where.isActive = isActive;

  const rows = await prisma.iTMinisterTeam.findMany({
    where,
    orderBy: [{ divisi: 'asc' }, { roleTitle: 'asc' }, { joinedAt: 'asc' }],
    include: {
      jemaat: {
        select: { id: true, namaLengkap: true, noHp: true, kode: true, fotoUrl: true },
      },
      cabang: { select: { id: true, nama: true, kode: true } },
    },
  });

  res.json({ success: true, data: rows });
});

// GET /admin/it-minister-team/org-chart
itMinisterTeamRouter.get('/org-chart', async (_req, res) => {
  const rows = await prisma.iTMinisterTeam.findMany({
    where: { isActive: true },
    orderBy: [{ roleTitle: 'asc' }, { joinedAt: 'asc' }],
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      cabang: { select: { id: true, nama: true } },
    },
  });

  const head = rows.find((r) => r.roleTitle === 'HEAD_IT_MINISTER') ?? null;
  const coordinator = rows.find((r) => r.roleTitle === 'IT_COORDINATOR') ?? null;

  const product = {
    head: rows.find((r) => r.roleTitle === 'HEAD_PRODUCT') ?? null,
    members: rows.filter((r) => r.roleTitle === 'SPECIFIC_PRODUCT'),
  };
  const data = {
    head: rows.find((r) => r.roleTitle === 'HEAD_DATA') ?? null,
    members: rows.filter((r) => r.roleTitle === 'DATA_MEMBER'),
  };
  const operation = {
    head: rows.find((r) => r.roleTitle === 'HEAD_OPERATION') ?? null,
    l0: rows.filter((r) => r.roleTitle === 'OPERATION_L0'),
    l1: rows.filter((r) => r.roleTitle === 'OPERATION_L1'),
    l2: rows.filter((r) => r.roleTitle === 'OPERATION_L2'),
  };

  res.json({
    success: true,
    data: { head, coordinator, product, data, operation, totalActive: rows.length },
  });
});

// GET /admin/it-minister-team/me → current user's assignments
// Dipakai ops.eccchurch.global + planning.eccchurch.global untuk RBAC gate
itMinisterTeamRouter.get('/me', async (req, res) => {
  if (!req.user) return res.json({ success: true, data: [] });
  const rows = await prisma.iTMinisterTeam.findMany({
    where: { jemaatId: req.user.jemaatId, isActive: true },
    include: { cabang: { select: { id: true, nama: true } } },
  });
  res.json({ success: true, data: rows });
});

// GET /admin/it-minister-team/:id
itMinisterTeamRouter.get('/:id', async (req, res) => {
  const row = await prisma.iTMinisterTeam.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: {
        select: { id: true, namaLengkap: true, noHp: true, kode: true, fotoUrl: true },
      },
      cabang: { select: { id: true, nama: true, kode: true } },
    },
  });
  if (!row) throw NotFound('Assignment tidak ditemukan');
  res.json({ success: true, data: row });
});

// POST /admin/it-minister-team
// Body: { jemaatId, roleTitle, cabangId?, productArea?, catatan? }
itMinisterTeamRouter.post('/', async (req, res) => {
  const body = req.body ?? {};
  const jemaatId = typeof body.jemaatId === 'string' ? body.jemaatId : null;
  const roleTitle = typeof body.roleTitle === 'string' ? body.roleTitle : null;

  if (!jemaatId) throw BadRequest('jemaatId wajib');
  if (!roleTitle || !(VALID_ROLES as readonly string[]).includes(roleTitle)) {
    throw BadRequest(`roleTitle harus salah satu: ${VALID_ROLES.join(', ')}`);
  }

  const divisi = ROLE_TO_DIVISI[roleTitle as (typeof VALID_ROLES)[number]];
  const cabangId =
    typeof body.cabangId === 'string' && body.cabangId ? body.cabangId : null;
  const productArea =
    typeof body.productArea === 'string' && body.productArea
      ? body.productArea
      : null;
  const catatan = typeof body.catatan === 'string' ? body.catatan : null;

  // Rule DATA_MEMBER wajib cabangId
  if (roleTitle === 'DATA_MEMBER' && !cabangId) {
    throw BadRequest('DATA_MEMBER wajib specify cabangId (per cabang gereja)');
  }
  // Rule SPECIFIC_PRODUCT wajib productArea
  if (roleTitle === 'SPECIFIC_PRODUCT' && !productArea) {
    throw BadRequest('SPECIFIC_PRODUCT wajib specify productArea (mis. "Els App")');
  }
  // Head role — hanya 1 orang aktif per role
  const uniqueHeadRoles = [
    'HEAD_IT_MINISTER',
    'IT_COORDINATOR',
    'HEAD_PRODUCT',
    'HEAD_DATA',
    'HEAD_OPERATION',
  ];
  if (uniqueHeadRoles.includes(roleTitle)) {
    const existing = await prisma.iTMinisterTeam.findFirst({
      where: { roleTitle: roleTitle as (typeof VALID_ROLES)[number], isActive: true },
      include: { jemaat: { select: { namaLengkap: true } } },
    });
    if (existing) {
      throw BadRequest(
        `Role ${roleTitle} sudah dipegang ${existing.jemaat.namaLengkap} — deactivate dia dulu sebelum assign yg baru.`,
      );
    }
  }
  // Cek jemaat exists
  const jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { id: true, namaLengkap: true, isActive: true },
  });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');
  if (!jemaat.isActive) throw BadRequest('Jemaat sudah nonaktif — tidak bisa di-assign.');

  // Cek cabang exists kalau supplied
  if (cabangId) {
    const c = await prisma.cabangGereja.findUnique({ where: { id: cabangId }, select: { id: true } });
    if (!c) throw BadRequest('cabangId tidak valid');
  }

  const created = await prisma.iTMinisterTeam.create({
    data: {
      jemaatId,
      divisi,
      roleTitle: roleTitle as (typeof VALID_ROLES)[number],
      cabangId,
      productArea,
      catatan,
    },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      cabang: { select: { id: true, nama: true } },
    },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'it_minister_team',
    resourceId: created.id,
    resourceLabel: `${jemaat.namaLengkap} → ${roleTitle}`,
    metadata: { kind: 'it-minister-assign', roleTitle, divisi, cabangId, productArea },
  });

  res.status(201).json({ success: true, data: created });
});

// PATCH /admin/it-minister-team/:id
// Body: { isActive?, roleTitle?, cabangId?, productArea?, catatan?, leftAt? }
itMinisterTeamRouter.patch('/:id', async (req, res) => {
  const body = req.body ?? {};
  const before = await prisma.iTMinisterTeam.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { namaLengkap: true } } },
  });
  if (!before) throw NotFound('Assignment tidak ditemukan');

  const data: Record<string, unknown> = {};
  if (typeof body.isActive === 'boolean') {
    data.isActive = body.isActive;
    if (!body.isActive && !before.leftAt) data.leftAt = new Date();
    if (body.isActive && before.leftAt) data.leftAt = null;
  }
  if (typeof body.roleTitle === 'string' && (VALID_ROLES as readonly string[]).includes(body.roleTitle)) {
    data.roleTitle = body.roleTitle;
    data.divisi = ROLE_TO_DIVISI[body.roleTitle as (typeof VALID_ROLES)[number]];
  }
  if (body.cabangId === null) data.cabangId = null;
  else if (typeof body.cabangId === 'string') data.cabangId = body.cabangId;

  if (body.productArea === null) data.productArea = null;
  else if (typeof body.productArea === 'string') data.productArea = body.productArea;

  if (body.catatan === null || typeof body.catatan === 'string') data.catatan = body.catatan;

  const updated = await prisma.iTMinisterTeam.update({
    where: { id: req.params.id },
    data,
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      cabang: { select: { id: true, nama: true } },
    },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'it_minister_team',
    resourceId: updated.id,
    resourceLabel: `${before.jemaat.namaLengkap} → ${updated.roleTitle}`,
    before,
    after: updated,
    metadata: { kind: 'it-minister-update' },
  });

  res.json({ success: true, data: updated });
});

// DELETE /admin/it-minister-team/:id
itMinisterTeamRouter.delete('/:id', async (req, res) => {
  const before = await prisma.iTMinisterTeam.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { namaLengkap: true } } },
  });
  if (!before) throw NotFound('Assignment tidak ditemukan');

  await prisma.iTMinisterTeam.delete({ where: { id: req.params.id } });

  audit(req, {
    action: 'DELETE',
    resource: 'it_minister_team',
    resourceId: before.id,
    resourceLabel: `${before.jemaat.namaLengkap} → ${before.roleTitle}`,
    before,
    metadata: { kind: 'it-minister-delete' },
  });

  res.status(204).end();
});
