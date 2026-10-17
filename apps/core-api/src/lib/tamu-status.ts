/**
 * Status tindak lanjut tamu.
 *   DIUNDANG   — sudah diajak / dicatat
 *   TERLIBAT   — sudah hadir di ibadah atau event (otomatis dari kehadiran)
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
  TERLIBAT: 'Sudah terlibat event / ibadah',
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
}

/** Jumlah & tanggal kehadiran terakhir (ibadah JOIN + event HADIR) per jemaat. */
export async function tamuAttendance(ids: string[]): Promise<Map<string, TamuAttendance>> {
  const out = new Map<string, TamuAttendance>();
  if (!ids.length) return out;
  const [ib, ev] = await Promise.all([
    prisma.reservasi.groupBy({
      by: ['jemaatId'],
      where: { jemaatId: { in: ids }, status: 'JOIN' },
      _count: { _all: true },
      _max: { tanggalIbadah: true },
    }),
    prisma.eventParticipation.groupBy({
      by: ['jemaatId'],
      where: { jemaatId: { in: ids }, status: 'HADIR' },
      _count: { _all: true },
      _max: { attendedAt: true },
    }),
  ]);
  const bump = (id: string, n: number, d: Date | null) => {
    const cur = out.get(id) ?? { kehadiran: 0, terakhirHadir: null };
    cur.kehadiran += n;
    if (d && (!cur.terakhirHadir || d > cur.terakhirHadir)) cur.terakhirHadir = d;
    out.set(id, cur);
  };
  for (const r of ib) bump(r.jemaatId, r._count._all, r._max.tanggalIbadah);
  for (const r of ev) bump(r.jemaatId, r._count._all, r._max.attendedAt);
  return out;
}
