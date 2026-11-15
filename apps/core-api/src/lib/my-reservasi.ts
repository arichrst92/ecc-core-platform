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
import { DEFAULT_TZ, addDays, todayInTz, wallToInstant } from './tz.js';
import { CLOSE_AFTER_MIN, hhmmToMin } from './self-checkin.js';

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

/**
 * Tab "Aktif" Reservasi Saya:
 *   - pertemuan mendatang (tanggal > hari ini, zona cabang) → aktif;
 *   - pertemuan hari ini → aktif sampai ibadah SELESAI (jamSelesai), lalu pindah
 *     ke Riwayat. Pengecualian setelah selesai:
 *       · ibadah anak yang sudah check-in tapi belum dijemput (kode jemput masih dipakai);
 *       · masih RESERVE dan jendela self check-in belum tutup (+CLOSE_AFTER_MIN).
 *   - pertemuan lampau → riwayat, kecuali anak yang belum dijemput (check-in < 24 jam).
 * Tanpa info ibadah (pemanggil lama) → aturan lama: tanggal >= hari ini / check-in < 24 jam.
 */
export function isActiveRow(
  r: {
    tanggalIbadah: Date;
    joinedAt: Date | null;
    status?: string;
    pickupCode?: string | null;
    pickedUpAt?: Date | null;
  },
  tz: string = DEFAULT_TZ,
  now: Date = new Date(),
  ib?: { jamMulai: string; jamSelesai: string; isKidsIbadah?: boolean },
): boolean {
  const w = activeWindow(now);
  const today = todayInTz(tz, now).getTime();
  const day = r.tanggalIbadah.getTime();
  if (!ib) return day >= today || (!!r.joinedAt && r.joinedAt >= w.joinedSince);

  const kidsPendingPickup =
    !!ib.isKidsIbadah && r.status === 'JOIN' && !!r.pickupCode && !r.pickedUpAt && !!r.joinedAt && r.joinedAt >= w.joinedSince;
  if (day > today) return true;
  if (day < today) return kidsPendingPickup;

  // Hari ini: aktif sampai ibadah selesai (jam dinding cabang).
  const startMin = hhmmToMin(ib.jamMulai) ?? 0;
  let endMin = hhmmToMin(ib.jamSelesai) ?? 24 * 60 - 1;
  if (endMin <= startMin) endMin = 24 * 60 - 1;
  const ymd = r.tanggalIbadah.toISOString().slice(0, 10);
  const end = wallToInstant(ymd, endMin, tz).getTime();
  const t = now.getTime();
  if (t <= end) return true;
  if (kidsPendingPickup) return true;
  return r.status === 'RESERVE' && t <= end + CLOSE_AFTER_MIN * 60_000;
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
