/**
 * Reservasi Saya (mobile) — siapa saja yang reservasinya saya lihat, dan
 * label relasinya. Fungsi murni supaya mudah di-test.
 *
 * Cakupan:
 *   - SELF       : reservasi saya sendiri
 *   - ANAK       : anak saya (termasuk anak pasangan)
 *   - TANGGUNGAN : jemaat yang wali utamanya saya
 *   - TAMU       : tamu yang saya undang / bawa
 *   - KELUARGA   : anggota keluarga yang saya self check-in-kan
 */
import { todayWib } from './last-attendance.js';

export type MyReservasiRelation = 'SELF' | 'ANAK' | 'TANGGUNGAN' | 'TAMU' | 'KELUARGA';

/** Batas "aktif": ibadah hari ini & mendatang (WIB) atau check-in < 24 jam. */
export function activeWindow(now: Date = new Date()) {
  return { fromTanggal: todayWib(now), joinedSince: new Date(now.getTime() - 24 * 60 * 60 * 1000) };
}

export function relationFor(
  row: { jemaatId: string; invitedByJemaatId: string | null },
  me: string,
  people: Map<string, Exclude<MyReservasiRelation, 'SELF' | 'KELUARGA'>>,
): MyReservasiRelation {
  if (row.jemaatId === me) return 'SELF';
  const r = people.get(row.jemaatId);
  if (r) return r;
  if (row.invitedByJemaatId === me) return 'TAMU';
  return 'KELUARGA';
}
