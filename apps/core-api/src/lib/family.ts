import { prisma } from '@ecc/database';

const FAMILY_VIA_SPOUSE = ['Anak Laki-Laki', 'Anak Perempuan', 'Ayah', 'Ibu', 'Saudara Kandung'];

/**
 * Keluarga yang boleh saya check-in-kan: relasi langsung saya, anak/ortu/
 * saudara dari pasangan saya, dan tanggungan (primaryGuardian = saya).
 * Sama dengan daftar di menu Keluarga. Map jemaatId → label relasi.
 */
export async function familyOf(jemaatId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const direct = await prisma.jemaatRelasi.findMany({
    where: { jemaatId },
    select: { jemaatTerkaitId: true, tipeRelasi: { select: { nama: true } } },
  });
  for (const r of direct) out.set(r.jemaatTerkaitId, r.tipeRelasi.nama);
  const spouseIds = direct
    .filter((r) => r.tipeRelasi.nama === 'Suami' || r.tipeRelasi.nama === 'Istri')
    .map((r) => r.jemaatTerkaitId);
  if (spouseIds.length) {
    const viaSpouse = await prisma.jemaatRelasi.findMany({
      where: { jemaatId: { in: spouseIds }, tipeRelasi: { nama: { in: FAMILY_VIA_SPOUSE } } },
      select: { jemaatTerkaitId: true, tipeRelasi: { select: { nama: true } } },
    });
    for (const r of viaSpouse) if (!out.has(r.jemaatTerkaitId)) out.set(r.jemaatTerkaitId, r.tipeRelasi.nama);
  }
  const dependents = await prisma.jemaat.findMany({
    where: { primaryGuardianId: jemaatId },
    select: { id: true },
  });
  for (const d of dependents) if (!out.has(d.id)) out.set(d.id, 'Tanggungan');
  // Tamu saya (non-anggota yang saya bawa).
  const tamu = await prisma.jemaatTamu.findMany({ where: { inviterId: jemaatId }, select: { tamuId: true } });
  for (const t of tamu) if (!out.has(t.tamuId)) out.set(t.tamuId, 'Tamu');
  out.delete(jemaatId);
  return out;
}

