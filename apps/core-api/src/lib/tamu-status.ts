/**
 * Status tindak lanjut tamu.
 *   DIUNDANG   — sudah diajak / dicatat
 *   TERLIBAT   — sudah hadir di ibadah, event, atau homecell (otomatis dari kehadiran)
 *   FOLLOWUP   — sedang di-follow-up tim ECC (diatur admin)
 *   TERDAFTAR  — sudah terdaftar di ECC (otomatis saat tamu daftar Els App)
 *
 * Status efektif = status tersimpan (admin) yang dinaikkan otomatis dari
 * fakta: sudah daftar Els App → TERDAFTAR; sudah hadir → minimal TERLIBAT.
 */
import { prisma } from '@ecc/database';

export const TAMU_STATUSES = ['DIUNDANG', 'TERLIBAT', 'FOLLOWUP', 'TERDAFTAR'] as const;
export type TamuStatus = (typeof TAMU_STATUSES)[number];

export const TAMU_STATUS_LABEL: Record<TamuStatus, string> = {
  DIUNDANG: 'Diundang',
  TERLIBAT: 'Sudah terlibat ibadah / event / homecell',
  FOLLOWUP: 'Sedang di-follow-up ECC',
  TERDAFTAR: 'Sudah terdaftar di ECC',
};

const RANK: Record<TamuStatus, number> = { DIUNDANG: 0, TERLIBAT: 1, FOLLOWUP: 2, TERDAFTAR: 3 };

export function normTamuStatus(v: string | null | undefined): TamuStatus {
  return (TAMU_STATUSES as readonly string[]).includes(v ?? '') ? (v as TamuStatus) : 'DIUNDANG';
}

export function effectiveTamuStatus(p: {
  stored: string | null | undefined;
  /** false = sudah jadi anggota (daftar Els App). */
  isTamu: boolean;
  hasAttended: boolean;
}): TamuStatus {
  if (!p.isTamu) return 'TERDAFTAR';
  const stored = normTamuStatus(p.stored);
  const auto: TamuStatus = p.hasAttended ? 'TERLIBAT' : 'DIUNDANG';
  return RANK[stored] >= RANK[auto] ? stored : auto;
}

export interface TamuAttendance {
  kehadiran: number;
  terakhirHadir: Date | null;
  /** Ibadah / event terakhir yang dihadiri. */
  terakhirAcara: { jenis: 'IBADAH' | 'EVENT'; id: string; nama: string; tanggal: Date } | null;
  /** Kehadiran di pertemuan homecell — dicatat terpisah dari ibadah/event. */
  kehadiranHomecell: number;
  terakhirHomecell: { id: string; nama: string; tanggal: Date } | null;
}

/** Sudah pernah hadir di ibadah / event / homecell. */
export const tamuHasAttended = (a: TamuAttendance | undefined) => !!(a && (a.kehadiran || a.kehadiranHomecell));

/** Jumlah, tanggal & acara kehadiran terakhir (ibadah JOIN + event HADIR) per jemaat. */
export async function tamuAttendance(ids: string[]): Promise<Map<string, TamuAttendance>> {
  const out = new Map<string, TamuAttendance>();
  if (!ids.length) return out;
  const [ibCount, evCount, ibLast, evLast, hcRows] = await Promise.all([
    prisma.reservasi.groupBy({
      by: ['jemaatId'],
      where: { jemaatId: { in: ids }, status: 'JOIN' },
      _count: { _all: true },
    }),
    prisma.eventParticipation.groupBy({
      by: ['jemaatId'],
      where: { jemaatId: { in: ids }, status: 'HADIR' },
      _count: { _all: true },
    }),
    prisma.reservasi.findMany({
      where: { jemaatId: { in: ids }, status: 'JOIN' },
      orderBy: [{ tanggalIbadah: 'desc' }, { joinedAt: 'desc' }],
      distinct: ['jemaatId'],
      select: { jemaatId: true, tanggalIbadah: true, ibadah: { select: { id: true, nama: true } } },
    }),
    prisma.eventParticipation.findMany({
      where: { jemaatId: { in: ids }, status: 'HADIR' },
      orderBy: [{ attendedAt: 'desc' }],
      distinct: ['jemaatId'],
      select: { jemaatId: true, attendedAt: true, event: { select: { id: true, judul: true, tanggalMulai: true } } },
    }),
    prisma.homecellTamuAttendance.findMany({
      where: { tamuId: { in: ids } },
      select: { tamuId: true, schedule: { select: { tanggal: true, homecell: { select: { id: true, nama: true } } } } },
    }),
  ]);
  const get = (id: string) => {
    let cur = out.get(id);
    if (!cur) {
      cur = { kehadiran: 0, terakhirHadir: null, terakhirAcara: null, kehadiranHomecell: 0, terakhirHomecell: null };
      out.set(id, cur);
    }
    return cur;
  };
  const consider = (id: string, acara: NonNullable<TamuAttendance['terakhirAcara']>) => {
    const cur = get(id);
    if (!cur.terakhirAcara || acara.tanggal > cur.terakhirAcara.tanggal) {
      cur.terakhirAcara = acara;
      cur.terakhirHadir = acara.tanggal;
    }
  };
  for (const r of ibCount) get(r.jemaatId).kehadiran += r._count._all;
  for (const r of evCount) get(r.jemaatId).kehadiran += r._count._all;
  for (const r of ibLast) consider(r.jemaatId, { jenis: 'IBADAH', id: r.ibadah.id, nama: r.ibadah.nama, tanggal: r.tanggalIbadah });
  for (const r of evLast) {
    const tanggal = r.attendedAt ?? r.event.tanggalMulai;
    consider(r.jemaatId, { jenis: 'EVENT', id: r.event.id, nama: r.event.judul, tanggal });
  }
  for (const r of hcRows) {
    const cur = get(r.tamuId);
    cur.kehadiranHomecell++;
    if (!cur.terakhirHomecell || r.schedule.tanggal > cur.terakhirHomecell.tanggal) {
      cur.terakhirHomecell = { id: r.schedule.homecell.id, nama: r.schedule.homecell.nama, tanggal: r.schedule.tanggal };
    }
  }
  return out;
}
