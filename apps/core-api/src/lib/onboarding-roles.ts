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

// ------------------------------------------------------------------ New Comer → Jemaat Tetap

/**
 * Promosi otomatis: jemaat yang memegang role NEW_COMER (aturan jenis NEW_COMER,
 * bukan SEMUA) dan sudah hadir ibadah ≥ N kali (reservasi status JOIN) dipindah
 * ke role JEMAAT_TETAP (+ SEMUA). N diatur di Portal (app_config.new_comer_min_hadir;
 * kosong / 0 = nonaktif).
 *
 * Per jemaat, di dalam kunci (pg_advisory_xact_lock, sama dgn grantRoles):
 *   1. Role Jemaat Tetap yang sub role-nya SUDAH dimiliki → status-nya diperbarui
 *      (tidak dibuat baris baru); baris aktif ganda dgn sub role sama dinonaktifkan.
 *   2. Yang belum dimiliki → dibuat.
 *   3. Role New Comer yang sub role-nya tidak dipakai Jemaat Tetap → dinonaktifkan
 *      (isActive=false, tanggalSelesai=hari ini). Riwayat tetap ada.
 */
export async function getNewComerMinHadir(): Promise<number | null> {
  const row = await prisma.appConfig.findUnique({ where: { id: 'global' }, select: { newComerMinHadir: true } });
  const n = row?.newComerMinHadir ?? null;
  return n && n > 0 ? n : null;
}

async function newComerRules() {
  return prisma.onboardingRoleRule.findMany({
    where: { jenis: 'NEW_COMER' },
    select: { roleId: true, subRoleId: true, subRoleStatusId: true },
  });
}

/** Filter JemaatRole aktif yang cocok dengan salah satu aturan New Comer. */
function newComerRoleWhere(rules: { roleId: string; subRoleId: string; subRoleStatusId: string | null }[]): Prisma.JemaatRoleWhereInput {
  return {
    isActive: true,
    OR: rules.map((r) => ({ roleId: r.roleId, subRoleId: r.subRoleId, ...(r.subRoleStatusId ? { subRoleStatusId: r.subRoleStatusId } : {}) })),
  };
}

/** Jemaat New Comer yang sudah memenuhi syarat hadir (urut kehadiran terbanyak). */
export async function newComerEligible(minHadir: number): Promise<{ jemaatId: string; hadir: number }[]> {
  const rules = await newComerRules();
  if (!rules.length) return [];
  const ids = (
    await prisma.jemaat.findMany({
      where: { isActive: true, isTamu: false, jemaatRoles: { some: newComerRoleWhere(rules) } },
      select: { id: true },
    })
  ).map((j) => j.id);
  const out: { jemaatId: string; hadir: number }[] = [];
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    const rows = await prisma.reservasi.groupBy({
      by: ['jemaatId'],
      where: { jemaatId: { in: chunk }, status: 'JOIN' },
      _count: { _all: true },
      having: { jemaatId: { _count: { gte: minHadir } } },
    });
    for (const r of rows) out.push({ jemaatId: r.jemaatId, hadir: r._count._all });
  }
  return out.sort((a, b) => b.hadir - a.hadir);
}

/** Promosikan satu jemaat. Mengembalikan true bila ada perubahan. */
async function promoteOne(
  jemaatId: string,
  ncRules: { roleId: string; subRoleId: string; subRoleStatusId: string | null }[],
  jtRoles: RoleSpec[],
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'jemaat-role:' + jemaatId}))`;
    const active = await tx.jemaatRole.findMany({
      where: { jemaatId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, roleId: true, subRoleId: true, subRoleStatusId: true },
    });
    const isNc = (r: (typeof active)[number]) =>
      ncRules.some((n) => n.roleId === r.roleId && n.subRoleId === r.subRoleId && (!n.subRoleStatusId || n.subRoleStatusId === r.subRoleStatusId));
    // Dicek ulang di dalam kunci (bisa sudah dipromosikan proses lain / diubah admin).
    if (!active.some(isNc)) return false;
    const today = new Date();
    const jtSub = new Set(jtRoles.map((r) => r.subRoleId));
    const nonaktif: string[] = [];
    for (const spec of jtRoles) {
      const same = active.filter((a) => a.subRoleId === spec.subRoleId);
      if (same.length) {
        const keep = same[0]!;
        // Status ikut aturan Jemaat Tetap. Status kosong di aturan hanya menghapus
        // status bila baris itu role New Comer (role lain dibiarkan).
        if (keep.subRoleStatusId !== spec.subRoleStatusId && (spec.subRoleStatusId || isNc(keep))) {
          await tx.jemaatRole.update({ where: { id: keep.id }, data: { subRoleStatusId: spec.subRoleStatusId } });
        }
        // Hindari dobel: baris aktif lain dgn sub role yang sama dinonaktifkan.
        nonaktif.push(...same.slice(1).map((x) => x.id));
      } else {
        await tx.jemaatRole.create({
          data: {
            jemaatId,
            roleId: spec.roleId,
            subRoleId: spec.subRoleId,
            subRoleStatusId: spec.subRoleStatusId,
            isActive: true,
            catatan: 'Otomatis: New Comer → Jemaat Tetap (syarat hadir ibadah terpenuhi)',
          },
        });
      }
    }
    for (const a of active) if (isNc(a) && !jtSub.has(a.subRoleId)) nonaktif.push(a.id);
    if (nonaktif.length) {
      await tx.jemaatRole.updateMany({
        where: { id: { in: [...new Set(nonaktif)] } },
        data: { isActive: false, tanggalSelesai: today },
      });
    }
    return true;
  });
}

let promoting = false;

/** Jalankan promosi untuk semua yang memenuhi syarat (job berkala & tombol Portal). */
export async function applyNewComerPromotion(): Promise<{
  dipromosikan: number;
  gagal: number;
  kandidat: number;
  skipped?: string;
  alreadyRunning?: boolean;
}> {
  if (promoting) return { dipromosikan: 0, gagal: 0, kandidat: 0, alreadyRunning: true };
  promoting = true;
  try {
    const minHadir = await getNewComerMinHadir();
    if (!minHadir) return { dipromosikan: 0, gagal: 0, kandidat: 0, skipped: 'nonaktif' };
    const [ncRules, jtRoles] = await Promise.all([newComerRules(), onboardingRolesFor('JEMAAT_TETAP')]);
    if (!ncRules.length) return { dipromosikan: 0, gagal: 0, kandidat: 0, skipped: 'aturan-new-comer-kosong' };
    if (!jtRoles.length) return { dipromosikan: 0, gagal: 0, kandidat: 0, skipped: 'aturan-jemaat-tetap-kosong' };
    const list = await newComerEligible(minHadir);
    let dipromosikan = 0;
    let gagal = 0;
    for (const { jemaatId } of list) {
      try {
        if (await promoteOne(jemaatId, ncRules, jtRoles)) dipromosikan++;
      } catch {
        gagal++;
      }
    }
    return { dipromosikan, gagal, kandidat: list.length };
  } finally {
    promoting = false;
  }
}
