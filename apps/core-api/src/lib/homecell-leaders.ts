/**
 * Pemimpin yang boleh diabsen di pertemuan homecell walau bukan anggota:
 *   PIC homecell · Zone Leader (PIC zona) · Pastor zona.
 * Dipakai jadwal pertemuan (daftar belum hadir + validasi absen).
 */
import { prisma } from '@ecc/database';

export type HomecellPeran = 'PIC' | 'ZONE_LEADER' | 'PASTOR';
export interface HomecellLeader {
  jemaatId: string;
  namaLengkap: string;
  kode: string | null;
  peran: HomecellPeran;
}

export async function homecellLeaders(homecellId: string): Promise<HomecellLeader[]> {
  const hc = await prisma.homecell.findUnique({
    where: { id: homecellId },
    select: {
      picJemaat: { select: { id: true, namaLengkap: true, kode: true, isActive: true } },
      area: {
        select: {
          picJemaat: { select: { id: true, namaLengkap: true, kode: true, isActive: true } },
          pastors: { select: { jemaat: { select: { id: true, namaLengkap: true, kode: true, isActive: true } } } },
        },
      },
    },
  });
  if (!hc) return [];
  const out = new Map<string, HomecellLeader>();
  const add = (j: { id: string; namaLengkap: string; kode: string | null; isActive: boolean } | null | undefined, peran: HomecellPeran) => {
    if (!j || !j.isActive || out.has(j.id)) return; // peran pertama (paling dekat) yang dipakai
    out.set(j.id, { jemaatId: j.id, namaLengkap: j.namaLengkap, kode: j.kode, peran });
  };
  add(hc.picJemaat, 'PIC');
  add(hc.area?.picJemaat, 'ZONE_LEADER');
  for (const p of hc.area?.pastors ?? []) add(p.jemaat, 'PASTOR');
  return [...out.values()];
}
