import { describe, expect, it } from 'vitest';
import { generateOccurrences, nthWeekdayOfMonth } from './ibadah-occurrences.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe('jadwal Bulanan minggu ke-N', () => {
  it('nthWeekdayOfMonth: Sabtu kedua November 2026 = 14', () => {
    expect(ymd(nthWeekdayOfMonth(2026, 10, 6, 2))).toBe('2026-11-14');
  });
  it('Sabtu minggu kedua tiap bulan', () => {
    const ib = { tipeJadwal: 'MONTHLY' as const, tanggalMulai: new Date('2026-11-01'), hari: 'SABTU' as const, mingguKe: 2 };
    expect(generateOccurrences(ib, new Date('2026-10-01'), new Date('2027-01-31')).map(ymd)).toEqual(['2026-11-14', '2026-12-12', '2027-01-09']);
  });
  it('tanpa mingguKe tetap pola tanggal lama', () => {
    const ib = { tipeJadwal: 'MONTHLY' as const, tanggalMulai: new Date('2026-11-05'), hari: null, mingguKe: null };
    expect(generateOccurrences(ib, new Date('2026-11-01'), new Date('2027-01-31')).map(ymd)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05']);
  });
});
