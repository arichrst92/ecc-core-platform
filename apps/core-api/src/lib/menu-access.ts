/**
 * Resolve menu access untuk seorang Jemaat berdasarkan JemaatRole aktif.
 *
 * Algoritma:
 *   1. Ambil semua JemaatRole(jemaatId, isActive=true) → list (roleId, subRoleId).
 *   2. Untuk setiap pasangan, cari SubRoleMenuAccess(subRoleId, menuKey).
 *      Kalau ada → pakai itu (override Role-level).
 *      Else → fallback ke RoleMenuAccess(roleId, menuKey).
 *   3. Union semua akses dari semua role user: kalau ANY grant true,
 *      pakai true (permissive union per level).
 *
 * Untuk login gate: hitung `canAccessPortal` = ada minimal satu role/sub
 * dengan canAccessPortal=true. SubRole override (NULL = inherit Role).
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
    },
  });

  // Akses menu aplikasi CKids dari config pelayanan/role (Portal → Akses CKids).
  const ckids = await ckidsMenusFor(jemaatId);

  if (jemaatRoles.length === 0) {
    return { canAccessPortal: false, menuAccess: ckids };
  }

  // Resolve canAccessPortal: SubRole override (kalau non-null) > Role.
  let canAccessPortal = false;
  for (const jr of jemaatRoles) {
    const subFlag = jr.subRole?.canAccessPortal;
    const effective = subFlag !== null && subFlag !== undefined ? subFlag : jr.role.canAccessPortal;
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
    const perRole: Record<string, MenuAccessLevels> = {};
    for (const ra of jr.role.menuAccesses) {
      perRole[ra.menuKey] = {
        canRead: ra.canRead,
        canWrite: ra.canWrite,
        canDelete: ra.canDelete,
      };
    }
    // SubRole-level OVERRIDE Role-level untuk menuKey yang sama.
    if (jr.subRole) {
      for (const sa of jr.subRole.menuAccesses) {
        perRole[sa.menuKey] = {
          canRead: sa.canRead,
          canWrite: sa.canWrite,
          canDelete: sa.canDelete,
        };
      }
    }
    // Union perRole ke menuAccess total.
    for (const [k, v] of Object.entries(perRole)) {
      unionInto(menuAccess, k, v);
    }
  }

  for (const [k, v] of Object.entries(ckids)) unionInto(menuAccess, k, v);
  return { canAccessPortal, menuAccess };
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
        { role: { isActive: true, jemaatRoles: { some: { jemaatId, isActive: true } } } },
      ],
    },
    select: { menuKey: true },
  });
  const out: Record<string, MenuAccessLevels> = {};
  for (const r of rows) out[`ckids:${r.menuKey}`] = { canRead: true, canWrite: true, canDelete: false };
  return out;
}
