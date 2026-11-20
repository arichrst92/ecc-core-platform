/**
 * Resolve menu access untuk seorang Jemaat berdasarkan JemaatRole aktif.
 *
 * Algoritma:
 *   1. Ambil semua JemaatRole(jemaatId, isActive=true) → list (roleId, subRoleId).
 *   2. Untuk setiap JemaatRole, akses per menuKey diambil dari level paling
 *      spesifik yang punya baris: Status (SubRoleStatusMenuAccess) → SubRole
 *      (SubRoleMenuAccess) → Role (RoleMenuAccess).
 *   3. Union semua akses dari semua role user: kalau ANY grant true,
 *      pakai true (permissive union per level).
 *
 * Untuk login gate: hitung `canAccessPortal` = ada minimal satu role/sub
 * dengan canAccessPortal=true. Override Status → SubRole → Role (NULL = inherit).
 */
import { prisma } from '@ecc/database';
import type { ResolvedMenuAccess, MenuAccessLevels } from '@ecc/shared-types';

export interface JemaatAccessSummary {
  canAccessPortal: boolean;
  menuAccess: ResolvedMenuAccess;
}

const EMPTY_LEVEL: MenuAccessLevels = {
  canRead: false,
  canWrite: false,
  canDelete: false,
};

export async function resolveJemaatAccess(jemaatId: string): Promise<JemaatAccessSummary> {
  // Ambil semua role aktif jemaat termasuk relasi role + subRole.
  const jemaatRoles = await prisma.jemaatRole.findMany({
    where: { jemaatId, isActive: true },
    include: {
      role: {
        include: { menuAccesses: true },
      },
      subRole: {
        include: { menuAccesses: true },
      },
      subRoleStatus: {
        include: { menuAccesses: true },
      },
    },
  });

  // Akses menu aplikasi CKids dari config pelayanan/role (Portal → Akses CKids).
  const ckids = await ckidsMenusFor(jemaatId);

  if (jemaatRoles.length === 0) {
    return withBreakGlass(jemaatId, { canAccessPortal: false, menuAccess: ckids });
  }

  // Status aktif saja yang ikut menentukan akses (status nonaktif = diabaikan).
  const statusOf = (jr: (typeof jemaatRoles)[number]) => (jr.subRoleStatus?.isActive ? jr.subRoleStatus : null);

  // Resolve canAccessPortal: Status override > SubRole override > Role (NULL = inherit).
  let canAccessPortal = false;
  for (const jr of jemaatRoles) {
    const statusFlag = statusOf(jr)?.canAccessPortal;
    const subFlag = jr.subRole?.canAccessPortal;
    const effective =
      statusFlag !== null && statusFlag !== undefined
        ? statusFlag
        : subFlag !== null && subFlag !== undefined
          ? subFlag
          : jr.role.canAccessPortal;
    if (effective) {
      canAccessPortal = true;
      break;
    }
  }

  // Resolve menu access per menuKey. Union semua role.
  const menuAccess: Record<string, MenuAccessLevels> = {};

  function unionInto(target: Record<string, MenuAccessLevels>, key: string, src: MenuAccessLevels) {
    const cur = target[key] ?? { ...EMPTY_LEVEL };
    target[key] = {
      canRead: cur.canRead || src.canRead,
      canWrite: cur.canWrite || src.canWrite,
      canDelete: cur.canDelete || src.canDelete,
    };
  }

  for (const jr of jemaatRoles) {
    // Build per-jemaatRole map dulu (SubRole-override-Role), lalu union ke total.
    // 2026-11: level paling spesifik yang SUDAH DIATUR berlaku UTUH (snapshot):
    // Status (punya baris) → Sub-role (punya baris) → Role. Menu yang tidak
    // dicentang di level itu = tidak punya akses (tidak lagi mewarisi Role).
    // Level tanpa baris sama sekali = ikut level di atasnya.
    const perRole: Record<string, MenuAccessLevels> = {};
    const st = statusOf(jr);
    const rows =
      st && st.menuAccesses.length
        ? st.menuAccesses
        : jr.subRole && jr.subRole.menuAccesses.length
          ? jr.subRole.menuAccesses
          : jr.role.menuAccesses;
    for (const ra of rows) {
      perRole[ra.menuKey] = { canRead: ra.canRead, canWrite: ra.canWrite, canDelete: ra.canDelete };
    }
    // Union perRole ke menuAccess total.
    for (const [k, v] of Object.entries(perRole)) {
      unionInto(menuAccess, k, v);
    }
  }

  for (const [k, v] of Object.entries(ckids)) unionInto(menuAccess, k, v);
  return withBreakGlass(jemaatId, { canAccessPortal, menuAccess });
}

/**
 * Pengaman darurat: jemaat di env ROLE_ACCESS_ADMIN_JEMAAT_IDS (dipisah koma)
 * selalu bisa masuk Portal & mengelola menu Role Access, supaya akses tidak
 * terkunci total karena salah atur. Menu lain tetap mengikuti Role Access.
 */
function withBreakGlass(jemaatId: string, a: JemaatAccessSummary): JemaatAccessSummary {
  const ids = (process.env.ROLE_ACCESS_ADMIN_JEMAAT_IDS ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!ids.includes(jemaatId)) return a;
  return {
    canAccessPortal: true,
    menuAccess: { ...a.menuAccess, 'role-access': { canRead: true, canWrite: true, canDelete: true } },
  };
}

/**
 * Menu CKids yang diberikan lewat keanggotaan pelayanan aktif atau role aktif
 * → `{ 'ckids:<menu>': { canRead, canWrite } }`. Satu query.
 */
async function ckidsMenusFor(jemaatId: string): Promise<Record<string, MenuAccessLevels>> {
  const rows = await prisma.ckidsMenuAccess.findMany({
    where: {
      OR: [
        { pelayanan: { isActive: true, jemaatPelayanan: { some: { jemaatId, isActive: true } } } },
        // Posisi tertentu di pelayanan (mis. Multimedia → Sound System).
        {
          pelayananRole: {
            isActive: true,
            pelayanan: { isActive: true },
            jemaatPelayanan: { some: { jemaatId, isActive: true } },
          },
        },
        { role: { isActive: true, jemaatRoles: { some: { jemaatId, isActive: true } } } },
      ],
    },
    select: { menuKey: true },
  });
  const out: Record<string, MenuAccessLevels> = {};
  for (const r of rows) out[`ckids:${r.menuKey}`] = { canRead: true, canWrite: true, canDelete: false };
  return out;
}
