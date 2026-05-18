/**
 * Generate occurrences (dates) untuk ibadah recurring di rentang tanggal.
 *
 * Aturan per tipe_jadwal:
 *   WEEKLY    — setiap 7 hari dari tanggalMulai, di hari yang sesuai `hari`
 *   BIWEEKLY  — setiap 14 hari dari tanggalMulai, di hari yang sesuai `hari`
 *   MONTHLY   — setiap bulan di tanggal yang sama dengan tanggalMulai
 *               (mis. tanggalMulai 5 Jan → 5 Feb, 5 Mar, dst.)
 *   ONCE      — sekali di tanggalMulai
 *
 * Edge case MONTHLY: kalau tanggalMulai = 31 dan bulan tujuan hanya 30 hari,
 * skip bulan tsb (atau pakai tanggal terakhir bulan). Default: skip.
 */

type TipeJadwal = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'ONCE';
type HariMinggu = 'MINGGU' | 'SENIN' | 'SELASA' | 'RABU' | 'KAMIS' | 'JUMAT' | 'SABTU';

// JS Date.getDay(): 0 = Sunday (MINGGU), 1 = Monday, ..., 6 = Saturday
const HARI_TO_DOW: Record<HariMinggu, number> = {
  MINGGU: 0, SENIN: 1, SELASA: 2, RABU: 3, KAMIS: 4, JUMAT: 5, SABTU: 6,
};

export interface IbadahForOccurrence {
  tipeJadwal: TipeJadwal;
  tanggalMulai: Date;
  hari: HariMinggu | null;
}

/**
 * Generate semua occurrence dates dalam rentang [from, to] (inclusive).
 * Return: array Date (sorted ascending), tanpa duplikat.
 */
export function generateOccurrences(
  ibadah: IbadahForOccurrence,
  from: Date,
  to: Date,
): Date[] {
  const startMs = ibadah.tanggalMulai.getTime();
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (toMs < fromMs) return [];

  const dates: Date[] = [];

  if (ibadah.tipeJadwal === 'ONCE') {
    if (startMs >= fromMs && startMs <= toMs) {
      dates.push(new Date(ibadah.tanggalMulai));
    }
    return dates;
  }

  if (ibadah.tipeJadwal === 'WEEKLY' || ibadah.tipeJadwal === 'BIWEEKLY') {
    if (!ibadah.hari) return [];
    const interval = ibadah.tipeJadwal === 'WEEKLY' ? 7 : 14;
    const targetDow = HARI_TO_DOW[ibadah.hari];

    // Cari first occurrence ≥ tanggalMulai yang jatuh di hari target
    const cur = new Date(ibadah.tanggalMulai);
    cur.setHours(0, 0, 0, 0);
    while (cur.getDay() !== targetDow) {
      cur.setDate(cur.getDate() + 1);
    }
    // Iterate by interval
    while (cur.getTime() <= toMs) {
      if (cur.getTime() >= fromMs && cur.getTime() >= startMs) {
        dates.push(new Date(cur));
      }
      cur.setDate(cur.getDate() + interval);
    }
    return dates;
  }

  if (ibadah.tipeJadwal === 'MONTHLY') {
    const dayOfMonth = ibadah.tanggalMulai.getDate();
    // Mulai dari bulan dari `from` atau dari `tanggalMulai` (yang lebih besar)
    const startMonth =
      from.getTime() > ibadah.tanggalMulai.getTime() ? from : ibadah.tanggalMulai;
    let year = startMonth.getFullYear();
    let month = startMonth.getMonth();
    // Kalau bulan saat ini sudah lewat hari `dayOfMonth`, skip ke bulan berikutnya
    if (startMonth.getDate() > dayOfMonth) {
      month += 1;
      if (month > 11) { month = 0; year += 1; }
    }
    while (true) {
      const candidate = new Date(year, month, dayOfMonth);
      // Validasi: pastikan tanggal valid (mis. 31 Feb auto-roll → skip)
      if (candidate.getMonth() !== month) {
        // Tanggal tidak valid di bulan ini (mis. Feb 31 → Mar 3) — skip
      } else if (candidate.getTime() > toMs) {
        break;
      } else if (candidate.getTime() >= fromMs && candidate.getTime() >= startMs) {
        dates.push(candidate);
      }
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      if (year - startMonth.getFullYear() > 5) break; // safety guard
    }
    return dates;
  }

  return dates;
}
