import { describe, expect, it } from 'vitest';
import { calendarDateOf, isValidTz, todayInTz, tzOffsetMs, tzOr, wallToInstant } from './tz.js';

const iso = (d: Date) => d.toISOString();

describe('tz', () => {
  it('offset', () => {
    expect(tzOffsetMs('Asia/Jakarta', new Date('2026-10-18T00:00:00Z'))).toBe(7 * 3600_000);
    expect(tzOffsetMs('Australia/Sydney', new Date('2026-12-01T00:00:00Z'))).toBe(11 * 3600_000); // AEDT
    expect(tzOffsetMs('Australia/Sydney', new Date('2026-07-01T00:00:00Z'))).toBe(10 * 3600_000);
    expect(tzOffsetMs('America/Los_Angeles', new Date('2026-07-01T00:00:00Z'))).toBe(-7 * 3600_000);
  });
  it('validasi', () => {
    expect(isValidTz('Asia/Makassar')).toBe(true);
    expect(isValidTz('Mars/Olympus')).toBe(false);
    expect(tzOr('x')).toBe('Asia/Jakarta');
  });
  it('hari ini per zona', () => {
    const now = new Date('2026-10-17T18:00:00Z');
    expect(iso(todayInTz('Asia/Jakarta', now)).slice(0, 10)).toBe('2026-10-18');
    expect(iso(todayInTz('America/New_York', now)).slice(0, 10)).toBe('2026-10-17');
  });
  it('jam dinding → instant', () => {
    expect(iso(wallToInstant('2026-10-18', 9 * 60, 'Asia/Jakarta'))).toBe('2026-10-18T02:00:00.000Z');
    expect(iso(wallToInstant('2026-10-18', 9 * 60, 'Asia/Jayapura'))).toBe('2026-10-18T00:00:00.000Z');
    expect(iso(wallToInstant('2026-12-06', 9 * 60, 'Australia/Sydney'))).toBe('2026-12-05T22:00:00.000Z');
    expect(iso(wallToInstant('2026-07-05', 10 * 60, 'America/Los_Angeles'))).toBe('2026-07-05T17:00:00.000Z');
  });
  it('tanggal event', () => {
    expect(iso(calendarDateOf(new Date('2026-10-20T00:00:00Z'), 'America/New_York')).slice(0, 10)).toBe('2026-10-20');
    expect(iso(calendarDateOf(new Date('2026-10-19T17:00:00Z'), 'Asia/Jakarta')).slice(0, 10)).toBe('2026-10-20');
  });
});
