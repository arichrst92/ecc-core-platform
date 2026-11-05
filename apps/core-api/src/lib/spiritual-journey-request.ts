/**
 * Request update Spiritual Journey (2.4.6) — logika pemberian tahap.
 *
 * Disetujui → tahap yang dipilih jemaat DAN semua tahap sebelumnya (menurut
 * urutan) yang belum tercapai diberikan:
 *   - Sudah punya JemaatRole aktif dgn role + sub role yang sama → status-nya
 *     diperbarui ke status tahap (bila tahap menentukan status).
 *   - Belum → JemaatRole baru dibuat.
 * Tahap tanpa sub role butuh pilihan sub role dari admin (`subRoleIds`).
 */
import { prisma, type Prisma } from '@ecc/database';
import { BadRequest, NotFound } from './errors.js';
import { meetsStep, type HeldRole } from './spiritual-journey.js';

type Tx = Prisma.TransactionClient;

export interface GrantPlanStep {
  id: string;
  judul: string;
  urutan: number;
  role: { id: string; nama: string };
  subRole: { id: string; nama: string } | null;
  subRoleStatus: { id: string; nama: string } | null;
  /** Tahap tidak menentukan sub role → admin harus memilih. */
  needsSubRole: boolean;
  subRoleOptions: { id: string; nama: string }[];
}

/** Tahap (urut) yang akan diberikan bila request untuk `targetStepId` disetujui. */
export async function grantPlan(jemaatId: string, targetStepId: string, db: Tx | typeof prisma = prisma) {
  const [steps, roles] = await Promise.all([
    db.spiritualJourneyStep.findMany({
      where: { isActive: true },
      orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
      include: {
        role: { select: { id: true, nama: true, subRoles: { where: { isActive: true }, select: { id: true, nama: true }, orderBy: { nama: 'asc' } } } },
        subRole: { select: { id: true, nama: true } },
        subRoleStatus: { select: { id: true, nama: true } },
      },
    }),
    db.jemaatRole.findMany({
      where: { jemaatId, isActive: true },
      select: { id: true, roleId: true, subRoleId: true, subRoleStatusId: true },
    }),
  ]);
  const idx = steps.findIndex((s) => s.id === targetStepId);
  if (idx < 0) throw NotFound('Tahap tidak ditemukan atau sudah tidak aktif.');
  const plan: GrantPlanStep[] = [];
  steps.slice(0, idx + 1).forEach((s, i) => {
    if (meetsStep(s, roles)) return;
    plan.push({
      id: s.id,
      judul: s.judul,
      urutan: i + 1,
      role: { id: s.role.id, nama: s.role.nama },
      subRole: s.subRole,
      subRoleStatus: s.subRoleStatus,
      needsSubRole: !s.subRoleId,
      subRoleOptions: s.subRoleId ? [] : s.role.subRoles,
    });
  });
  return { plan, steps, roles, targetIndex: idx };
}

/** Jalankan pemberian tahap di dalam transaksi. Mengembalikan jumlah tahap yang diberikan. */
export async function applyGrant(
  tx: Tx,
  jemaatId: string,
  targetStepId: string,
  subRoleIds: Record<string, string>,
  catatan: string,
): Promise<{ granted: { stepId: string; judul: string; jemaatRoleId: string; mode: 'CREATE' | 'UPDATE' }[] }> {
  const { plan, steps, roles } = await grantPlan(jemaatId, targetStepId, tx);
  const missing = plan.filter((p) => p.needsSubRole && !subRoleIds[p.id]);
  if (missing.length) {
    throw BadRequest(`Pilih sub role untuk tahap: ${missing.map((m) => m.judul).join(', ')}.`, {
      needSubRole: missing.map((m) => m.id),
    });
  }
  const held: (HeldRole & { id: string })[] = roles.map((r) => ({ ...r }));
  const granted: { stepId: string; judul: string; jemaatRoleId: string; mode: 'CREATE' | 'UPDATE' }[] = [];
  for (const p of plan) {
    const step = steps.find((s) => s.id === p.id)!;
    // Tahap bisa sudah terpenuhi oleh pemberian tahap sebelumnya (role sama).
    if (meetsStep(step, held)) continue;
    const subRoleId = step.subRoleId ?? subRoleIds[step.id]!;
    if (!step.subRoleId && !p.subRoleOptions.some((o) => o.id === subRoleId)) {
      throw BadRequest(`Sub role untuk tahap "${step.judul}" tidak sesuai dengan role-nya.`);
    }
    const existing = held.find((r) => r.roleId === step.roleId && r.subRoleId === subRoleId);
    if (existing) {
      const upd = await tx.jemaatRole.update({
        where: { id: existing.id },
        data: { subRoleStatusId: step.subRoleStatusId ?? existing.subRoleStatusId },
        select: { id: true },
      });
      existing.subRoleStatusId = step.subRoleStatusId ?? existing.subRoleStatusId;
      granted.push({ stepId: step.id, judul: step.judul, jemaatRoleId: upd.id, mode: 'UPDATE' });
    } else {
      const created = await tx.jemaatRole.create({
        data: {
          jemaatId,
          roleId: step.roleId,
          subRoleId,
          subRoleStatusId: step.subRoleStatusId ?? null,
          catatan: `${catatan} — tahap "${step.judul}"`,
        },
        select: { id: true },
      });
      held.push({ id: created.id, roleId: step.roleId, subRoleId, subRoleStatusId: step.subRoleStatusId ?? null });
      granted.push({ stepId: step.id, judul: step.judul, jemaatRoleId: created.id, mode: 'CREATE' });
    }
  }
  return { granted };
}
