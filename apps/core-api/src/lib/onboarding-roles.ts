/**
 * Role otomatis saat jemaat selesai mendaftar / onboarding di app.
 * Diatur di Portal → App Settings → Onboarding Config (tabel onboarding_role_rule).
 *
 * jenis: JEMAAT_TETAP / NEW_COMER (pilihan di layar daftar) atau SEMUA.
 */
import { prisma, type Prisma } from '@ecc/database';

export const ONBOARDING_JENIS = ['JEMAAT_TETAP', 'NEW_COMER', 'SEMUA'] as const;
export type OnboardingJenis = (typeof ONBOARDING_JENIS)[number];

/** Daftar role (aktif) yang harus diberikan untuk pilihan jenis jemaat. */
export async function onboardingRolesFor(jenis: 'JEMAAT_TETAP' | 'NEW_COMER') {
  const rules = await prisma.onboardingRoleRule.findMany({
    where: {
      jenis: { in: [jenis, 'SEMUA'] },
      role: { isActive: true },
      subRole: { isActive: true },
    },
    orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
    select: { roleId: true, subRoleId: true, subRoleStatusId: true, subRoleStatus: { select: { isActive: true } } },
  });
  // Hindari dobel (aturan SEMUA + aturan khusus untuk sub role yang sama).
  const seen = new Set<string>();
  const out: { roleId: string; subRoleId: string; subRoleStatusId: string | null }[] = [];
  for (const r of rules) {
    if (seen.has(r.subRoleId)) continue;
    seen.add(r.subRoleId);
    out.push({
      roleId: r.roleId,
      subRoleId: r.subRoleId,
      subRoleStatusId: r.subRoleStatusId && r.subRoleStatus?.isActive ? r.subRoleStatusId : null,
    });
  }
  return out;
}

/** Bentuk `jemaatRoles: { create: [...] }` untuk prisma.jemaat.create/update. */
export async function onboardingRolesCreate(
  jenis: 'JEMAAT_TETAP' | 'NEW_COMER',
): Promise<Prisma.JemaatRoleUncheckedCreateWithoutJemaatInput[] | undefined> {
  const roles = await onboardingRolesFor(jenis);
  if (!roles.length) return undefined;
  return roles.map((r) => ({ roleId: r.roleId, subRoleId: r.subRoleId, subRoleStatusId: r.subRoleStatusId, isActive: true }));
}

/**
 * Wizard onboarding (login pertama jemaat yang datanya sudah ada — impor,
 * dibuat admin, atau didaftarkan keluarga). Role onboarding hanya diberikan
 * bila jemaat BELUM punya role aktif sama sekali, supaya role yang sudah diatur
 * admin/impor tidak tertimpa atau bertambah tanpa sengaja.
 */
export async function grantOnboardingRoles(jemaatId: string, jenis: 'JEMAAT_TETAP' | 'NEW_COMER'): Promise<number> {
  const punyaRole = await prisma.jemaatRole.count({ where: { jemaatId, isActive: true } });
  if (punyaRole > 0) return 0;
  const roles = await onboardingRolesFor(jenis);
  if (!roles.length) return 0;
  const existing = await prisma.jemaatRole.findMany({
    where: { jemaatId, isActive: true, subRoleId: { in: roles.map((r) => r.subRoleId) } },
    select: { subRoleId: true },
  });
  const have = new Set(existing.map((e) => e.subRoleId));
  const todo = roles.filter((r) => !have.has(r.subRoleId));
  if (!todo.length) return 0;
  await prisma.jemaatRole.createMany({
    data: todo.map((r) => ({ jemaatId, roleId: r.roleId, subRoleId: r.subRoleId, subRoleStatusId: r.subRoleStatusId, isActive: true })),
  });
  return todo.length;
}
