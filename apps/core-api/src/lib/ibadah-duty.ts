/**
 * Petugas ibadah "default" (IbadahPelayananPetugas) → jadwal per tanggal.
 *
 * Aturan sama dengan detail ibadah (routes/admin/ibadah.ts): untuk tiap link
 * ibadah↔pelayanan dan tiap tanggal occurrence, kalau ada petugas khusus
 * tanggal itu (tanggalIbadah = tanggal) → itu yang berlaku (REPLACE);
 * kalau tidak → petugas default (tanggalIbadah = null).
 */
import { generateOccurrences, type IbadahForOccurrence } from './ibadah-occurrences.js';

export interface DutyRow {
  id: string;
  jemaatId: string;
  tanggalIbadah: Date | null;
  catatan: string | null;
  role: { nama: string; level: number };
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null };
}

export interface DutyLink {
  ibadah: IbadahForOccurrence & {
    id: string;
    nama: string;
    jamMulai: string;
    jamSelesai: string;
    lokasi: string | null;
    isActive: boolean;
    cabang?: { timezone: string } | null;
  };
  pelayanan: { id: string; nama: string };
  rows: DutyRow[];
}

export interface IbadahDuty {
  id: string;
  tanggal: string; // YYYY-MM-DD
  ibadahId: string;
  ibadahNama: string;
  ibadahJamMulai: string;
  ibadahJamSelesai: string;
  ibadahLokasi: string | null;
  /** Zona waktu cabang (IANA) — jam ibadah = jam dinding di zona ini. */
  timezone: string | null;
  ministryId: string;
  ministryNama: string;
  posisi: string;
  posisiLevel: number;
  notes: string | null;
  coServants: { jemaatId: string; namaLengkap: string; fotoUrl: string | null; posisi: string }[];
  source: 'TIM_IBADAH';
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function resolveIbadahDuties(
  links: DutyLink[],
  me: string,
  from: Date,
  to: Date,
  cancelled: Set<string>, // "ibadahId:YYYY-MM-DD"
): IbadahDuty[] {
  const out: IbadahDuty[] = [];
  for (const link of links) {
    if (!link.ibadah.isActive) continue;
    for (const d of generateOccurrences(link.ibadah, from, to)) {
      const tanggal = ymd(d);
      if (cancelled.has(`${link.ibadah.id}:${tanggal}`)) continue;
      const overrides = link.rows.filter((r) => r.tanggalIbadah && ymd(r.tanggalIbadah) === tanggal);
      const rows = overrides.length ? overrides : link.rows.filter((r) => r.tanggalIbadah === null);
      const mine = rows.find((r) => r.jemaatId === me);
      if (!mine) continue;
      out.push({
        id: `tim-${mine.id}-${tanggal}`,
        tanggal,
        ibadahId: link.ibadah.id,
        ibadahNama: link.ibadah.nama,
        ibadahJamMulai: link.ibadah.jamMulai,
        ibadahJamSelesai: link.ibadah.jamSelesai,
        ibadahLokasi: link.ibadah.lokasi,
        timezone: link.ibadah.cabang?.timezone ?? null,
        ministryId: link.pelayanan.id,
        ministryNama: link.pelayanan.nama,
        posisi: mine.role.nama,
        posisiLevel: mine.role.level,
        notes: mine.catatan,
        coServants: rows
          .filter((r) => r.jemaatId !== me)
          .map((r) => ({ jemaatId: r.jemaatId, namaLengkap: r.jemaat.namaLengkap, fotoUrl: r.jemaat.fotoUrl, posisi: r.role.nama })),
        source: 'TIM_IBADAH',
      });
    }
  }
  return out;
}
