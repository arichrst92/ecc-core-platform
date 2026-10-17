/**
 * Spiritual Journey — logika murni (tanpa DB).
 *
 * Tahap tercapai kalau jemaat punya JemaatRole AKTIF yang cocok dengan
 * syarat tahap: role (wajib) + sub role (opsional) + status (opsional).
 * Linier: "tahap berikutnya" = tahap pertama (menurut urutan) yang belum
 * tercapai.
 */
import type { Prisma } from '@ecc/database';

export interface StepRequirement {
  roleId: string;
  subRoleId: string | null;
  subRoleStatusId: string | null;
}

export interface HeldRole {
  roleId: string;
  subRoleId: string;
  subRoleStatusId: string | null;
}

export function meetsStep(step: StepRequirement, roles: HeldRole[]): boolean {
  return roles.some(
    (r) =>
      r.roleId === step.roleId &&
      (!step.subRoleId || r.subRoleId === step.subRoleId) &&
      (!step.subRoleStatusId || r.subRoleStatusId === step.subRoleStatusId),
  );
}

export interface JourneyProgress<S> {
  steps: (S & { achieved: boolean; isNext: boolean })[];
  achievedCount: number;
  /** Index tahap berikutnya (belum tercapai); null kalau semua sudah. */
  nextIndex: number | null;
}

/** `steps` harus sudah urut. */
export function journeyProgress<S extends StepRequirement>(steps: S[], roles: HeldRole[]): JourneyProgress<S> {
  const achieved = steps.map((s) => meetsStep(s, roles));
  const next = achieved.findIndex((a) => !a);
  return {
    steps: steps.map((s, i) => ({ ...s, achieved: achieved[i]!, isNext: i === next })),
    achievedCount: achieved.filter(Boolean).length,
    nextIndex: next < 0 ? null : next,
  };
}

/** Filter Prisma Jemaat yang sudah mencapai tahap. */
export function jemaatWhereForStep(step: StepRequirement): Prisma.JemaatWhereInput {
  return {
    jemaatRoles: {
      some: {
        isActive: true,
        roleId: step.roleId,
        ...(step.subRoleId ? { subRoleId: step.subRoleId } : {}),
        ...(step.subRoleStatusId ? { subRoleStatusId: step.subRoleStatusId } : {}),
      },
    },
  };
}

/** Event yang memberi role/status sesuai syarat tahap (untuk "cara mendapatkan"). */
export function eventGrantsStep(
  ev: { grantRoleId: string | null; grantSubRoleId: string | null; grantSubRoleStatusId: string | null },
  step: StepRequirement,
): boolean {
  if (!ev.grantRoleId || ev.grantRoleId !== step.roleId) return false;
  if (step.subRoleId && ev.grantSubRoleId !== step.subRoleId) return false;
  if (step.subRoleStatusId && ev.grantSubRoleStatusId !== step.subRoleStatusId) return false;
  return true;
}
