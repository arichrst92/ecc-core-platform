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

/**
 * `steps` harus sudah urut. Perjalanan bersifat BERTAHAP (2026-11): mencapai
 * tahap N berarti tahap 1..N-1 juga tercapai. Penting karena tahap-tahap ECC
 * memakai role/sub-role yang sama dengan status berbeda — satu orang hanya
 * memegang satu status, jadi status tahap awal "tertimpa" status tahap lanjut.
 */
export function journeyProgress<S extends StepRequirement>(steps: S[], roles: HeldRole[]): JourneyProgress<S> {
  const met = steps.map((s) => meetsStep(s, roles));
  const highest = met.lastIndexOf(true);
  const achieved = steps.map((_, i) => i <= highest);
  const next = achieved.findIndex((a) => !a);
  return {
    steps: steps.map((s, i) => ({ ...s, achieved: achieved[i]!, isNext: i === next })),
    achievedCount: achieved.filter(Boolean).length,
    nextIndex: next < 0 ? null : next,
  };
}

/** Filter Prisma: jemaat yang memegang syarat PERSIS tahap ini (tanpa memperhitungkan tahap lanjut). */
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

// ============================================================
// Tahap saat ini (untuk daftar / export / filter jemaat di portal)
// ============================================================

export interface JourneyStage {
  /** Jumlah tahap berurutan yang sudah tercapai dari awal (0 = belum mulai). */
  stage: number;
  total: number;
  /** Judul tahap terakhir yang tercapai (null kalau belum mulai). */
  judul: string | null;
  /** Judul tahap berikutnya (null kalau semua tercapai). */
  next: string | null;
}

/** `steps` harus sudah urut. Tahap = tahap terakhir yang dicapai berurutan dari tahap 1. */
export function journeyStage<S extends StepRequirement & { judul: string }>(steps: S[], roles: HeldRole[]): JourneyStage {
  const p = journeyProgress(steps, roles);
  const stage = p.nextIndex ?? steps.length;
  return {
    stage,
    total: steps.length,
    judul: stage > 0 ? steps[stage - 1]!.judul : null,
    next: stage < steps.length ? steps[stage]!.judul : null,
  };
}

/** Label ringkas: "Tahap 2/5 · Baptis Air" / "Belum mulai (0/5)". */
export function journeyStageLabel(s: JourneyStage): string {
  if (s.total === 0) return '';
  return s.stage === 0 ? `Belum mulai (0/${s.total})` : `Tahap ${s.stage}/${s.total} · ${s.judul}`;
}

/**
 * Filter Prisma: jemaat yang tahap saat ininya = `stage`
 * (tahap 1..stage tercapai, tahap stage+1 belum). stage 0 = belum mulai.
 */
export function jemaatWhereForStage(steps: StepRequirement[], stage: number): Prisma.JemaatWhereInput {
  // Bertahap: tahap saat ini = tahap TERTINGGI yang dipegang.
  const later = steps.slice(stage).map((s) => jemaatWhereForStep(s));
  const and: Prisma.JemaatWhereInput[] = [];
  if (stage > 0) and.push(jemaatWhereForStep(steps[stage - 1]!));
  if (later.length) and.push({ NOT: { OR: later } });
  return { AND: and };
}

/** Filter Prisma: jemaat yang SUDAH MENCAPAI tahap ke-`index` (memegang tahap ini atau tahap sesudahnya). */
export function jemaatWhereReached(steps: StepRequirement[], index: number): Prisma.JemaatWhereInput {
  return { OR: steps.slice(index).map((s) => jemaatWhereForStep(s)) };
}
