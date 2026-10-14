import { describe, expect, it } from 'vitest';
import { hhmmToMin, selfCheckinWindow } from './self-checkin.js';

// Minggu 18 Okt 2026 (WIB). tanggalMulai = Minggu 4 Okt 2026.
const base = {
  tipeJadwal: 'WEEKLY' as const,
  tanggalMulai: new Date('2026-10-04T00:00:00Z'),
  hari: 'MINGGU' as const,
  isActive: true,
  isKidsIbadah: false,
  jamMulai: '09:00',
  jamSelesai: '11:00',
};
const wib = (s: string) => new Date(`${s}+07:00`);

describe('hhmmToMin', () => {
  it('parse', () => expect(hhmmToMin('09:30')).toBe(570));
  it('salah format', () => expect(hhmmToMin('9.30')).toBeNull());
});

describe('selfCheckinWindow', () => {
  it('buka 15 menit sebelum mulai', () => {
    const w = selfCheckinWindow(base, [], wib('2026-10-18T08:45:00'));
    expect(w.available).toBe(true);
    expect(w.tanggal).toBe('2026-10-18');
    expect(w.opensAt).toBe('2026-10-18T01:45:00.000Z');
    expect(w.closesAt).toBe('2026-10-18T04:00:00.000Z');
  });
  it('terlalu awal (08:44)', () => expect(selfCheckinWindow(base, [], wib('2026-10-18T08:44:59')).reason).toBe('TOO_EARLY'));
  it('jam server UTC tidak menggeser: 01:44Z = 08:44 WIB masih tutup', () =>
    expect(selfCheckinWindow(base, [], new Date('2026-10-18T01:44:00Z')).available).toBe(false));
  it('tepat jam selesai masih bisa', () => expect(selfCheckinWindow(base, [], wib('2026-10-18T11:00:00')).available).toBe(true));
  it('saat ibadah', () => expect(selfCheckinWindow(base, [], wib('2026-10-18T10:15:00')).available).toBe(true));
  it('sudah selesai', () => expect(selfCheckinWindow(base, [], wib('2026-10-18T11:01:00')).reason).toBe('ENDED'));
  it('bukan hari ibadah', () => expect(selfCheckinWindow(base, [], wib('2026-10-19T09:30:00')).reason).toBe('NOT_TODAY'));
  it('dibatalkan', () =>
    expect(selfCheckinWindow(base, ['2026-10-18'], wib('2026-10-18T09:30:00')).reason).toBe('CANCELLED'));
  it('ibadah anak tidak bisa self check-in', () =>
    expect(selfCheckinWindow({ ...base, isKidsIbadah: true }, [], wib('2026-10-18T09:30:00')).reason).toBe('KIDS_IBADAH'));
  it('nonaktif', () =>
    expect(selfCheckinWindow({ ...base, isActive: false }, [], wib('2026-10-18T09:30:00')).reason).toBe('INACTIVE'));
  it('biweekly minggu selang', () =>
    expect(selfCheckinWindow({ ...base, tipeJadwal: 'BIWEEKLY' }, [], wib('2026-10-11T09:30:00')).reason).toBe('NOT_TODAY'));
  it('ONCE di tanggalnya', () =>
    expect(
      selfCheckinWindow({ ...base, tipeJadwal: 'ONCE', hari: null, tanggalMulai: new Date('2026-10-14T00:00:00Z'), jamMulai: '19:00', jamSelesai: '21:00' }, [], wib('2026-10-14T19:10:00')).available,
    ).toBe(true));
  it('ibadah malam WIB (UTC hari sebelumnya tidak menggeser tanggal)', () =>
    expect(selfCheckinWindow({ ...base, jamMulai: '18:00', jamSelesai: '20:00' }, [], wib('2026-10-18T18:30:00')).available).toBe(true));
});
