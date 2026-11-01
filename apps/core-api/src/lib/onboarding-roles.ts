/**
 * Role otomatis saat jemaat selesai mendaftar / onboarding di app.
 * Diatur di Portal → App Settings → Onboarding Config (tabel onboarding_role_rule).
 *
 * jenis: JEMAAT_TETAP / NEW_COMER (pilihan di layar daftar), SEMUA, atau
 * TANPA_ROLE (jemaat yang sudah onboard tapi belum punya role — diterapkan
 * dari Portal lewat tombol "Terapkan").
 */
import { prisma, type Prisma } from '@ecc/database';

export const ONBOARDING_JENIS = ['JEMAAT_TETAP', 'NEW_COMER', 'SEMUA', 'TANPA_ROLE'] as const;
export type OnboardingJenis = (typeof ONBOARDING_JENIS)[number];

/** Daftar role (aktif) yang harus diberikan untuk pilihan jenis jemaat. */
export async function onboardingRolesFor(jenis: 'JEMAAT_TETAP' | 'NEW_COMER' | 'TANPA_ROLE') {
  const rules = await prisma.onboardingRoleRule.findMany({
    where: {
      // TANPA_ROLE berdiri sendiri; pendaftar baru = pilihan + SEMUA.
      jenis: { in: jenis === 'TANPA_ROLE' ? ['TANPA_ROLE'] : [jenis, 'SEMUA'] },
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

type RoleSpec = { roleId: string; subRoleId: string; subRoleStatusId: string | null };

/**
 * Beri role ke satu jemaat secara aman dari balapan (double tap, dua admin,
 * job bersamaan): dikunci per jemaat (pg_advisory_xact_lock) lalu dicek ulang
 * di dalam kunci — sub role yang sudah aktif tidak digandakan.
 * onlyIfNoRole = hanya bila jemaat belum punya role aktif sama sekali.
 */
async function grantRoles(jemaatId: string, roles: RoleSpec[], onlyIfNoRole: boolean): Promise<number> {
  if (!roles.length) return 0;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'jemaat-role:' + jemaatId}))`;
    const active = await tx.jemaatRole.findMany({ where: { jemaatId, isActive: true }, select: { subRoleId: true } });
    if (onlyIfNoRole && active.length > 0) return 0;
    const have = new Set(active.map((a) => a.subRoleId));
    const todo = roles.filter((r) => !have.has(r.subRoleId));
    if (!todo.length) return 0;
    const res = await tx.jemaatRole.createMany({
      data: todo.map((r) => ({ jemaatId, roleId: r.roleId, subRoleId: r.subRoleId, subRoleStatusId: r.subRoleStatusId, isActive: true })),
    });
    return res.count;
  });
}

/**
 * Daftar akun baru (POST /auth/register) — role sesuai pilihan + SEMUA.
 * Dipanggil SETELAH akun dibuat dan dibungkus try/catch oleh pemanggil, jadi
 * kegagalan pemberian role tidak pernah menggagalkan pendaftaran.
 */
export async function grantRegisterRoles(jemaatId: string, jenis: 'JEMAAT_TETAP' | 'NEW_COMER'): Promise<number> {
  return grantRoles(jemaatId, await onboardingRolesFor(jenis), false);
}

/**
 * Wizard onboarding (login pertama jemaat yang datanya sudah ada — impor,
 * dibuat admin, atau didaftarkan keluarga). Role onboarding hanya diberikan
 * bila jemaat BELUM punya role aktif sama sekali, supaya role yang sudah diatur
 * admin/impor tidak tertimpa atau bertambah tanpa sengaja.
 */
export async function grantOnboardingRoles(jemaatId: string, jenis: 'JEMAAT_TETAP' | 'NEW_COMER'): Promise<number> {
  return grantRoles(jemaatId, await onboardingRolesFor(jenis), true);
}

// ------------------------------------------------------------------ sudah onboard, role kosong

/** Jemaat aktif (bukan tamu) yang sudah onboarding tapi tidak punya role aktif. */
export const tanpaRoleWhere: Prisma.JemaatWhereInput = {
  isActive: true,
  isTamu: false,
  onboardedAt: { not: null },
  jemaatRoles: { none: { isActive: true } },
};

let applying = false;

/**
 * Terapkan aturan TANPA_ROLE ke semua jemaat yang sudah onboard tapi role-nya
 * kosong. Per jemaat dikunci & dicek ulang (aman dijalankan berulang / dobel klik);
 * satu proses sekaligus. Kegagalan satu jemaat tidak menghentikan yang lain.
 */
export async function applyTanpaRole(): Promise<{ jemaat: number; roles: number; gagal: number; alreadyRunning?: boolean }> {
  if (applying) return { jemaat: 0, roles: 0, gagal: 0, alreadyRunning: true };
  applying = true;
  try {
    const roles = await onboardingRolesFor('TANPA_ROLE');
    if (!roles.length) return { jemaat: 0, roles: 0, gagal: 0 };
    // Ambil semua ID sekali di awal → tidak ada perulangan tanpa akhir.
    const ids = (await prisma.jemaat.findMany({ where: tanpaRoleWhere, select: { id: true } })).map((j) => j.id);
    let jemaat = 0;
    let total = 0;
    let gagal = 0;
    for (const id of ids) {
      try {
        const n = await grantRoles(id, roles, true);
        if (n > 0) {
          jemaat++;
          total += n;
        }
      } catch {
        gagal++;
      }
    }
    return { jemaat, roles: total, gagal };
  } finally {
    applying = false;
  }
}
