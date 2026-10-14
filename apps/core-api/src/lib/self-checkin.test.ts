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

import { eventSelfCheckinWindow } from './self-checkin.js';

describe('eventSelfCheckinWindow', () => {
  const ev = {
    allowSelfCheckin: true,
    butuhKehadiran: true,
    isActive: true,
    // disimpan sebagai tanggal (UTC midnight)
    tanggalMulai: new Date('2026-10-20T00:00:00Z'),
    tanggalSelesai: null,
    jamMulai: '18:00',
    jamSelesai: '21:00',
  };
  it('dibuka 17:45 WIB', () => {
    const w = eventSelfCheckinWindow(ev, wib('2026-10-20T17:45:00'));
    expect(w.available).toBe(true);
    expect(w.opensAt).toBe('2026-10-20T10:45:00.000Z');
  });
  it('17:44 belum', () => expect(eventSelfCheckinWindow(ev, wib('2026-10-20T17:44:00')).reason).toBe('TOO_EARLY'));
  it('21:01 selesai', () => expect(eventSelfCheckinWindow(ev, wib('2026-10-20T21:01:00')).reason).toBe('ENDED'));
  it('tidak diizinkan', () =>
    expect(eventSelfCheckinWindow({ ...ev, allowSelfCheckin: false }, wib('2026-10-20T18:30:00')).reason).toBe('DISABLED'));
  it('tanpa absensi', () =>
    expect(eventSelfCheckinWindow({ ...ev, butuhKehadiran: false }, wib('2026-10-20T18:30:00')).reason).toBe('NO_ATTENDANCE'));
  it('tanggalMulai disimpan sebagai tengah malam WIB (17:00Z hari sebelumnya)', () =>
    expect(
      eventSelfCheckinWindow({ ...ev, tanggalMulai: new Date('2026-10-19T17:00:00Z') }, wib('2026-10-20T18:00:00')).available,
    ).toBe(true));
  it('multi-hari: hari ke-2 masih terbuka sampai jam selesai hari terakhir', () => {
    const multi = { ...ev, tanggalSelesai: new Date('2026-10-22T00:00:00Z'), jamMulai: '08:00', jamSelesai: '17:00' };
    expect(eventSelfCheckinWindow(multi, wib('2026-10-21T12:00:00')).available).toBe(true);
    expect(eventSelfCheckinWindow(multi, wib('2026-10-22T17:01:00')).reason).toBe('ENDED');
  });
  it('tanpa jam → sepanjang hari', () =>
    expect(eventSelfCheckinWindow({ ...ev, jamMulai: null, jamSelesai: null }, wib('2026-10-20T23:30:00')).available).toBe(true));
});
