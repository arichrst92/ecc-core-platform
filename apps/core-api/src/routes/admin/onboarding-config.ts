/**
 * Onboarding Config (Portal → App Settings) — role yang otomatis diberikan
 * saat jemaat selesai mendaftar / onboarding di app.
 *
 *   GET /admin/onboarding-config  → { rules[], roles[] (katalog role → sub role → status) }
 *   PUT /admin/onboarding-config  { rules: [{ jenis, roleId, subRoleId, subRoleStatusId? }] }  (ganti semua)
 *   GET /admin/onboarding-config/tanpa-role         → jumlah jemaat sudah onboard tapi role kosong
 *   POST /admin/onboarding-config/tanpa-role/apply  → beri role sesuai aturan TANPA_ROLE
 *   PUT  /admin/onboarding-config/promosi          { minHadir } → New Comer → Jemaat Tetap setelah hadir N× (0 = nonaktif)
 *   GET  /admin/onboarding-config/promosi/preview  → jumlah + contoh yang memenuhi syarat sekarang
 *   POST /admin/onboarding-config/promosi/apply    → jalankan sekarang (otomatis juga tiap 30 menit)
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  ONBOARDING_JENIS,
  applyNewComerPromotion,
  applyTanpaRole,
  getNewComerMinHadir,
  newComerEligible,
  tanpaRoleWhere,
} from '../../lib/onboarding-roles.js';

export const onboardingConfigRouter = Router();
onboardingConfigRouter.use(requireMenu('onboarding-config'));

const ruleSelect = {
  id: true,
  jenis: true,
  urutan: true,
  role: { select: { id: true, nama: true, isActive: true } },
  subRole: { select: { id: true, nama: true, isActive: true } },
  subRoleStatus: { select: { id: true, nama: true, isActive: true } },
} as const;

onboardingConfigRouter.get('/', async (_req, res) => {
  const [rules, roles] = await Promise.all([
    prisma.onboardingRoleRule.findMany({ orderBy: [{ jenis: 'asc' }, { urutan: 'asc' }, { createdAt: 'asc' }], select: ruleSelect }),
    prisma.role.findMany({
      where: { isActive: true },
      orderBy: { nama: 'asc' },
      select: {
        id: true,
        nama: true,
        subRoles: {
          where: { isActive: true },
          orderBy: { nama: 'asc' },
          select: { id: true, nama: true, statuses: { where: { isActive: true }, orderBy: { nama: 'asc' }, select: { id: true, nama: true } } },
        },
      },
    }),
  ]);
  res.json({ success: true, data: { rules, roles, promosi: { minHadir: await getNewComerMinHadir() } } });
});

onboardingConfigRouter.put('/promosi', requireMenu('onboarding-config', 'write'), async (req, res) => {
  const { minHadir } = z
    .object({ minHadir: z.coerce.number().int().min(0, 'Minimal 0').max(500, 'Maksimal 500').nullable() })
    .parse(req.body ?? {});
  const before = await getNewComerMinHadir();
  const value = minHadir && minHadir > 0 ? minHadir : null;
  await prisma.appConfig.upsert({
    where: { id: 'global' },
    create: { id: 'global', newComerMinHadir: value, updatedByUserId: req.user?.sub ?? null },
    update: { newComerMinHadir: value, updatedByUserId: req.user?.sub ?? null },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'onboarding_config',
    resourceLabel: value ? `New Comer → Jemaat Tetap setelah hadir ${value}×` : 'Promosi New Comer dinonaktifkan',
    before: { minHadir: before },
    after: { minHadir: value },
  });
  res.json({ success: true, data: { minHadir: value } });
});

onboardingConfigRouter.get('/promosi/preview', async (_req, res) => {
  const minHadir = await getNewComerMinHadir();
  if (!minHadir) {
    res.json({ success: true, data: { minHadir: null, count: 0, sample: [] } });
    return;
  }
  const list = await newComerEligible(minHadir);
  const top = list.slice(0, 10);
  const jemaat = await prisma.jemaat.findMany({
    where: { id: { in: top.map((t) => t.jemaatId) } },
    select: { id: true, namaLengkap: true, kode: true, cabang: { select: { nama: true } } },
  });
  res.json({
    success: true,
    data: {
      minHadir,
      count: list.length,
      sample: top.map((t) => ({ ...jemaat.find((j) => j.id === t.jemaatId), hadir: t.hadir })).filter((x) => x.id),
    },
  });
});

onboardingConfigRouter.post('/promosi/apply', requireMenu('onboarding-config', 'write'), async (req, res) => {
  const result = await applyNewComerPromotion();
  if (result.alreadyRunning) {
    res.status(409).json({ success: false, error: { code: 'ALREADY_RUNNING', message: 'Proses sedang berjalan. Tunggu sebentar lalu muat ulang.' } });
    return;
  }
  if (result.skipped === 'nonaktif') throw BadRequest('Isi jumlah kehadiran minimal lalu simpan dulu.');
  if (result.skipped === 'aturan-new-comer-kosong') throw BadRequest('Belum ada aturan role "New Comer".');
  if (result.skipped === 'aturan-jemaat-tetap-kosong') throw BadRequest('Belum ada aturan role "Jemaat Tetap" — role New Comer tidak akan diganti.');
  audit(req, {
    action: 'UPDATE',
    resource: 'onboarding_config',
    resourceLabel: `New Comer → Jemaat Tetap: ${result.dipromosikan} jemaat`,
    metadata: { kind: 'new-comer-promotion', ...result },
  });
  res.json({ success: true, data: result });
});

const putSchema = z.object({
  rules: z
    .array(
      z.object({
        jenis: z.enum(ONBOARDING_JENIS),
        roleId: z.string().uuid(),
        subRoleId: z.string().uuid(),
        subRoleStatusId: z.string().uuid().nullish(),
      }),
    )
    .max(50),
});

onboardingConfigRouter.put('/', requireMenu('onboarding-config', 'write'), async (req, res) => {
  const { rules } = putSchema.parse(req.body ?? {});

  // Validasi: sub role milik role tsb, status milik sub role tsb.
  const subIds = [...new Set(rules.map((r) => r.subRoleId))];
  const subs = await prisma.subRole.findMany({
    where: { id: { in: subIds } },
    select: { id: true, roleId: true, statuses: { select: { id: true } } },
  });
  const subMap = new Map(subs.map((s) => [s.id, s]));
  for (const r of rules) {
    const s = subMap.get(r.subRoleId);
    if (!s || s.roleId !== r.roleId) throw BadRequest('Sub role tidak sesuai dengan role yang dipilih.');
    if (r.subRoleStatusId && !s.statuses.some((x) => x.id === r.subRoleStatusId)) {
      throw BadRequest('Status tidak sesuai dengan sub role yang dipilih.');
    }
  }
  // Satu sub role cukup sekali per jenis.
  const keys = rules.map((r) => `${r.jenis}:${r.subRoleId}`);
  if (new Set(keys).size !== keys.length) throw BadRequest('Ada sub role yang dipilih dua kali pada jenis yang sama.');

  const before = await prisma.onboardingRoleRule.findMany({ select: ruleSelect });
  await prisma.$transaction([
    prisma.onboardingRoleRule.deleteMany({}),
    prisma.onboardingRoleRule.createMany({
      data: rules.map((r, i) => ({
        jenis: r.jenis,
        roleId: r.roleId,
        subRoleId: r.subRoleId,
        subRoleStatusId: r.subRoleStatusId ?? null,
        urutan: i + 1,
      })),
    }),
  ]);
  const after = await prisma.onboardingRoleRule.findMany({
    orderBy: [{ jenis: 'asc' }, { urutan: 'asc' }],
    select: ruleSelect,
  });
  const label = (x: (typeof after)[number]) =>
    `${x.jenis}: ${x.role.nama} → ${x.subRole.nama}${x.subRoleStatus ? ` (${x.subRoleStatus.nama})` : ''}`;
  audit(req, {
    action: 'UPDATE',
    resource: 'onboarding_config',
    resourceLabel: 'Role otomatis saat onboarding',
    before: { aturan: before.map(label) },
    after: { aturan: after.map(label) },
  });
  res.json({ success: true, data: { rules: after } });
});

/** Jemaat yang sudah onboard tapi role-nya kosong (ringkasan + contoh nama). */
onboardingConfigRouter.get('/tanpa-role', async (_req, res) => {
  const [count, sample, perCabang] = await Promise.all([
    prisma.jemaat.count({ where: tanpaRoleWhere }),
    prisma.jemaat.findMany({
      where: tanpaRoleWhere,
      orderBy: { onboardedAt: 'desc' },
      take: 10,
      select: { id: true, namaLengkap: true, kode: true, cabang: { select: { nama: true } } },
    }),
    prisma.jemaat.groupBy({ by: ['cabangId'], where: tanpaRoleWhere, _count: { _all: true } }),
  ]);
  const cabang = await prisma.cabangGereja.findMany({
    where: { id: { in: perCabang.map((p) => p.cabangId) } },
    select: { id: true, nama: true },
  });
  res.json({
    success: true,
    data: {
      count,
      sample,
      perCabang: perCabang
        .map((p) => ({ cabang: cabang.find((c) => c.id === p.cabangId)?.nama ?? '-', jumlah: p._count._all }))
        .sort((a, b) => b.jumlah - a.jumlah),
    },
  });
});

onboardingConfigRouter.post('/tanpa-role/apply', requireMenu('onboarding-config', 'write'), async (req, res) => {
  const rules = await prisma.onboardingRoleRule.count({ where: { jenis: 'TANPA_ROLE' } });
  if (!rules) throw BadRequest('Belum ada aturan untuk "Sudah onboard, role kosong". Tambahkan & simpan dulu.');
  const result = await applyTanpaRole();
  if (result.alreadyRunning) {
    res.status(409).json({ success: false, error: { code: 'ALREADY_RUNNING', message: 'Proses pemberian role sedang berjalan. Tunggu sebentar lalu muat ulang.' } });
    return;
  }
  audit(req, {
    action: 'UPDATE',
    resource: 'onboarding_config',
    resourceLabel: `Beri role ke ${result.jemaat} jemaat yang role-nya kosong`,
    metadata: { kind: 'onboarding-apply-tanpa-role', jemaat: result.jemaat, rolesGranted: result.roles, gagal: result.gagal },
  });
  res.json({ success: true, data: result });
});
