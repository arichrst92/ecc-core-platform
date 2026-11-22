/**
 * Info tambahan untuk halaman scanner petugas (app, 2026-11):
 * status jendela scan (jam buka/tutup dalam zona cabang) dan nama pengundang tamu.
 * Semua field tambahan — app lama mengabaikannya.
 */
import { prisma } from '@ecc/database';
import type { ScanWindow } from './scan-window.js';
import { tzZoneLabel, type CabangLabel } from './tz.js';

const hhmm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

export type ScanWindowInfo = {
  /** TOO_EARLY | OPEN | LATE | ENDED | NOT_TODAY | CANCELLED | OTHER_DAY */
  phase: string;
  /** Jam dinding cabang "HH:mm". */
  opensJam: string;
  closesJam: string;
  /** "Waktu Bali". */
  zona: string;
  /** Penjelasan singkat (bahasa Indonesia) bila bukan OPEN. */
  message: string | null;
};

/**
 * `tanggalIso` = tanggal yang sedang dibuka di scanner. Bila bukan hari ini
 * (zona cabang) → OTHER_DAY: scan dicatat untuk tanggal hari ini oleh server.
 */
export function scanWindowInfo(w: ScanWindow | null, cabang: CabangLabel, tanggalIso?: string): ScanWindowInfo | null {
  if (!w) return null;
  const today = w.tanggal.toISOString().slice(0, 10);
  const otherDay = !!tanggalIso && tanggalIso !== today && w.phase !== 'NOT_TODAY';
  return {
    phase: otherDay ? 'OTHER_DAY' : w.phase,
    opensJam: hhmm(w.opens, w.tz),
    closesJam: hhmm(w.closes, w.tz),
    zona: tzZoneLabel(w.tz, cabang),
    message: otherDay ? 'Tanggal ini bukan hari ini — scan hanya untuk jadwal hari ini.' : w.closedReason,
  };
}

/** Nama jemaat pengundang tamu (invitedByJemaatId) — batch. */
export async function inviterNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map();
  const rows = await prisma.jemaat.findMany({ where: { id: { in: uniq } }, select: { id: true, namaLengkap: true } });
  return new Map(rows.map((r) => [r.id, r.namaLengkap]));
}
