/**
 * Homecell Material — materi pertemuan dari Portal untuk pemimpin homecell.
 *
 * Yang boleh melihat & mengunduh (app): Pastor zona, Zone Leader (PIC zona),
 * PIC homecell, dan Asisten homecell — di cabang zona/homecell yang dipimpin.
 * Materi tanpa cabang = semua cabang. Tampil mulai `berlakuMulai`; tetap bisa
 * diunduh selamanya. Notifikasi in-app sekali saat materi mulai tampil.
 */
import { prisma, type Prisma } from '@ecc/database';
import { DEFAULT_TZ, todayInTz } from './tz.js';
import { createNotificationBatch } from './notification.js';

export type LeaderRole = 'PASTOR' | 'ZONE_LEADER' | 'PIC' | 'ASISTEN';

/** Cabang tempat jemaat menjadi pemimpin (kosong = bukan pemimpin). */
export async function leaderScope(jemaatId: string): Promise<{ cabangIds: string[]; roles: LeaderRole[] }> {
  const [areas, pics, asisten] = await Promise.all([
    prisma.homecellArea.findMany({
      where: { isActive: true, OR: [{ picJemaatId: jemaatId }, { pastors: { some: { jemaatId } } }] },
      select: { cabangId: true, picJemaatId: true },
    }),
    prisma.homecell.findMany({
      where: { isActive: true, picJemaatId: jemaatId },
      select: { area: { select: { cabangId: true } } },
    }),
    prisma.homecellMember.findMany({
      where: { jemaatId, isActive: true, isAsisten: true, homecell: { isActive: true } },
      select: { homecell: { select: { area: { select: { cabangId: true } } } } },
    }),
  ]);
  const cabang = new Set<string>();
  const roles = new Set<LeaderRole>();
  for (const a of areas) {
    cabang.add(a.cabangId);
    roles.add(a.picJemaatId === jemaatId ? 'ZONE_LEADER' : 'PASTOR');
  }
  for (const h of pics) {
    cabang.add(h.area.cabangId);
    roles.add('PIC');
  }
  for (const m of asisten) {
    cabang.add(m.homecell.area.cabangId);
    roles.add('ASISTEN');
  }
  return { cabangIds: [...cabang], roles: [...roles] };
}

export const todayYmd = () => todayInTz(DEFAULT_TZ);

/** Materi yang terlihat di app untuk cabang-cabang ini (terbit & sudah mulai). */
export function visibleWhere(cabangIds: string[]): Prisma.HomecellMaterialWhereInput {
  return {
    isPublished: true,
    berlakuMulai: { lte: todayYmd() },
    OR: [{ cabangs: { none: {} } }, { cabangs: { some: { cabangId: { in: cabangIds } } } }],
  };
}

export type MaterialStatus = 'DRAFT' | 'TERJADWAL' | 'TERBIT';
export function materialStatus(m: { isPublished: boolean; berlakuMulai: Date }): MaterialStatus {
  if (!m.isPublished) return 'DRAFT';
  return m.berlakuMulai.getTime() > todayYmd().getTime() ? 'TERJADWAL' : 'TERBIT';
}

/** "Minggu ini": hari ini di antara berlakuMulai..berlakuSampai (tanpa sampai = 7 hari). */
export function isCurrent(m: { berlakuMulai: Date; berlakuSampai: Date | null }): boolean {
  const t = todayYmd().getTime();
  const end = m.berlakuSampai ? m.berlakuSampai.getTime() : m.berlakuMulai.getTime() + 6 * 86_400_000;
  return m.berlakuMulai.getTime() <= t && t <= end;
}

/** Semua pemimpin (Pastor, Zone Leader, PIC, Asisten) di cabang-cabang ini (null = semua cabang). */
export async function leadersFor(cabangIds: string[] | null): Promise<string[]> {
  const cab = cabangIds ? { in: cabangIds } : undefined;
  const [areas, pastors, pics, asisten] = await Promise.all([
    prisma.homecellArea.findMany({
      where: { isActive: true, picJemaatId: { not: null }, ...(cab ? { cabangId: cab } : {}) },
      select: { picJemaatId: true },
    }),
    prisma.homecellAreaPastor.findMany({
      where: { area: { isActive: true, ...(cab ? { cabangId: cab } : {}) } },
      select: { jemaatId: true },
    }),
    prisma.homecell.findMany({
      where: { isActive: true, picJemaatId: { not: null }, ...(cab ? { area: { cabangId: cab } } : {}) },
      select: { picJemaatId: true },
    }),
    prisma.homecellMember.findMany({
      where: { isActive: true, isAsisten: true, homecell: { isActive: true, ...(cab ? { area: { cabangId: cab } } : {}) } },
      select: { jemaatId: true },
    }),
  ]);
  const ids = new Set<string>();
  areas.forEach((a) => a.picJemaatId && ids.add(a.picJemaatId));
  pastors.forEach((p) => ids.add(p.jemaatId));
  pics.forEach((h) => h.picJemaatId && ids.add(h.picJemaatId));
  asisten.forEach((m) => ids.add(m.jemaatId));
  if (!ids.size) return [];
  const active = await prisma.jemaat.findMany({ where: { id: { in: [...ids] }, isActive: true }, select: { id: true } });
  return active.map((j) => j.id);
}

/**
 * Kirim notifikasi in-app untuk materi yang baru mulai tampil (sekali per
 * materi). Dipanggil saat materi disimpan & oleh scheduled job (materi terjadwal).
 */
export async function dispatchHomecellMaterialNotifications(): Promise<{ materials: number; recipients: number }> {
  const due = await prisma.homecellMaterial.findMany({
    where: { isPublished: true, notifyLeaders: true, notifiedAt: null, berlakuMulai: { lte: todayYmd() } },
    select: { id: true, judul: true, cabangs: { select: { cabangId: true } } },
    take: 20,
  });
  let recipients = 0;
  for (const m of due) {
    // Tandai dulu → tidak dobel bila job & simpan berjalan bersamaan.
    const claimed = await prisma.homecellMaterial.updateMany({
      where: { id: m.id, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
    if (!claimed.count) continue;
    const ids = await leadersFor(m.cabangs.length ? m.cabangs.map((c) => c.cabangId) : null);
    recipients += ids.length;
    await createNotificationBatch(ids, {
      type: 'HOMECELL_MATERIAL',
      title: 'Materi homecell baru',
      body: m.judul,
      actionUrl: '/homecell-material',
      metadata: { materialId: m.id },
    });
  }
  return { materials: due.length, recipients };
}
