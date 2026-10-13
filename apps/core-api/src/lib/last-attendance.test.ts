import { describe, expect, it } from 'vitest';
import { daysSince, withLastAttendance } from './last-attendance.js';

describe('daysSince (tanggal WIB)', () => {
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
  it('hari yang sama = 0', () => expect(daysSince(d('2026-10-13'), new Date('2026-10-13T10:00:00Z'))).toBe(0));
  it('kemarin = 1', () => expect(daysSince(d('2026-10-12'), new Date('2026-10-13T10:00:00Z'))).toBe(1));
  it('lewat tengah malam WIB sudah hari berikutnya', () =>
    // 2026-10-13 18:00 UTC = 14 Okt 01:00 WIB
    expect(daysSince(d('2026-10-13'), new Date('2026-10-13T18:00:00Z'))).toBe(1));
  it('masa depan → 0', () => expect(daysSince(d('2026-10-20'), new Date('2026-10-13T10:00:00Z'))).toBe(0));
  it('lintas bulan', () => expect(daysSince(d('2026-09-29'), new Date('2026-10-13T03:00:00Z'))).toBe(14));
});

describe('withLastAttendance', () => {
  it('belum pernah hadir → null', () => {
    expect(withLastAttendance('x', { a: 1 }, new Map())).toEqual({ a: 1, lastAttendedAt: null, lastAttendedDaysAgo: null });
  });
  it('isi tanggal YYYY-MM-DD', () => {
    const m = new Map([['x', { lastAttendedAt: new Date('2026-10-06T00:00:00Z'), lastAttendedDaysAgo: 7 }]]);
    expect(withLastAttendance('x', {}, m)).toEqual({ lastAttendedAt: '2026-10-06', lastAttendedDaysAgo: 7 });
  });
});

import { resolvePeriod, todayWib } from './last-attendance.js';

describe('resolvePeriod', () => {
  // Selasa 13 Okt 2026, 10:00 WIB
  const now = new Date('2026-10-13T03:00:00Z');
  const r = (p: string, f?: string, t?: string) => {
    const x = resolvePeriod(p, f, t, now);
    return x ? [x.from.toISOString().slice(0, 10), x.to.toISOString().slice(0, 10)] : null;
  };
  it('todayWib lewat tengah malam', () =>
    expect(todayWib(new Date('2026-10-13T17:30:00Z')).toISOString().slice(0, 10)).toBe('2026-10-14'));
  it('7 hari terakhir', () => expect(r('last_7d')).toEqual(['2026-10-07', '2026-10-13']));
  it('minggu ini (Senin)', () => expect(r('this_week')).toEqual(['2026-10-12', '2026-10-13']));
  it('minggu lalu', () => expect(r('last_week')).toEqual(['2026-10-05', '2026-10-11']));
  it('bulan ini', () => expect(r('this_month')).toEqual(['2026-10-01', '2026-10-13']));
  it('bulan lalu', () => expect(r('last_month')).toEqual(['2026-09-01', '2026-09-30']));
  it('30 hari', () => expect(r('last_30d')).toEqual(['2026-09-14', '2026-10-13']));
  it('custom dibalik otomatis', () => expect(r('custom', '2026-10-10', '2026-10-01')).toEqual(['2026-10-01', '2026-10-10']));
  it('custom hanya from → sampai hari ini', () => expect(r('custom', '2026-10-01')).toEqual(['2026-10-01', '2026-10-13']));
  it('custom kosong → null', () => expect(r('custom')).toBeNull());
  it('preset asing → null', () => expect(r('xyz')).toBeNull());
  it('bulan lalu saat Januari', () =>
    expect(resolvePeriod('last_month', undefined, undefined, new Date('2026-01-05T03:00:00Z'))!.from.toISOString().slice(0, 10)).toBe('2025-12-01'));
});
