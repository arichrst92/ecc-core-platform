/**
 * Onboarding Config (Portal → App Settings) — role yang otomatis diberikan
 * saat jemaat selesai mendaftar / onboarding di app.
 *
 *   GET /admin/onboarding-config  → { rules[], roles[] (katalog role → sub role → status) }
 *   PUT /admin/onboarding-config  { rules: [{ jenis, roleId, subRoleId, subRoleStatusId? }] }  (ganti semua)
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { ONBOARDING_JENIS } from '../../lib/onboarding-roles.js';

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
  res.json({ success: true, data: { rules, roles } });
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
