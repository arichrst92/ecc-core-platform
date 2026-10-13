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
