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
import { DEFAULT_TZ, addDays, todayInTz } from './tz.js';

export type MyReservasiRelation = 'SELF' | 'ANAK' | 'TANGGUNGAN' | 'TAMU' | 'KELUARGA';

/**
 * Batas "aktif": ibadah hari ini & mendatang (zona cabang) atau check-in
 * < 24 jam. `fromTanggal` untuk query DB dibuat longgar (kemarin UTC) karena
 * zona tiap cabang berbeda; saring akhir per baris pakai `isActiveRow`.
 */
export function activeWindow(now: Date = new Date()) {
  return {
    fromTanggal: addDays(todayInTz('UTC', now), -1),
    joinedSince: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  };
}

export function isActiveRow(
  r: { tanggalIbadah: Date; joinedAt: Date | null },
  tz: string = DEFAULT_TZ,
  now: Date = new Date(),
): boolean {
  const w = activeWindow(now);
  return r.tanggalIbadah.getTime() >= todayInTz(tz, now).getTime() || (!!r.joinedAt && r.joinedAt >= w.joinedSince);
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
