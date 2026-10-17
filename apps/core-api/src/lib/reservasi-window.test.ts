import { describe, expect, it } from 'vitest';
import { ageYears, canCancelReservasi, eligibleForKids, occurrenceStart, reservableOccurrences } from './reservasi-window.js';

const weekly = { tipeJadwal: 'WEEKLY' as const, tanggalMulai: new Date('2026-01-04T00:00:00Z'), hari: 'MINGGU' as const, jamMulai: '09:00' };

describe('occurrenceStart', () => {
  it('09:00 WIB = 02:00 UTC', () => {
    expect(occurrenceStart('2026-10-18', '09:00').toISOString()).toBe('2026-10-18T02:00:00.000Z');
  });
});

describe('reservableOccurrences', () => {
  it('Minggu ke depan 30 hari, hari ini yang sudah lewat jam mulai tidak ikut', () => {
    // Minggu 18 Okt 10:00 WIB
    const occ = reservableOccurrences(weekly, ['2026-11-01'], new Date('2026-10-18T03:00:00Z'));
    expect(occ.map((o) => o.tanggal)).toEqual(['2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15']);
    expect(occ.find((o) => o.tanggal === '2026-11-01')?.open).toBe(false);
    expect(occ.find((o) => o.tanggal === '2026-11-01')?.cancelled).toBe(true);
  });
  it('hari ini sebelum jam mulai ikut', () => {
    const occ = reservableOccurrences(weekly, [], new Date('2026-10-18T01:00:00Z'));
    expect(occ[0].tanggal).toBe('2026-10-18');
    expect(occ[0].open).toBe(true);
  });
});

describe('canCancelReservasi', () => {
  const r = { status: 'RESERVE', tanggalIbadah: new Date('2026-10-18T00:00:00Z') };
  it('sebelum jam mulai boleh', () => expect(canCancelReservasi(r, '09:00', new Date('2026-10-18T01:59:00Z'))).toBe(true));
  it('sesudah jam mulai tidak', () => expect(canCancelReservasi(r, '09:00', new Date('2026-10-18T02:00:00Z'))).toBe(false));
  it('sudah hadir tidak', () => expect(canCancelReservasi({ ...r, status: 'JOIN' }, '09:00', new Date('2026-10-17T00:00:00Z'))).toBe(false));
});

describe('ibadah anak', () => {
  const now = new Date('2026-10-17T05:00:00Z');
  it('usia', () => {
    expect(ageYears(new Date('2012-10-18T00:00:00Z'), now)).toBe(13);
    expect(ageYears(new Date('2012-10-17T00:00:00Z'), now)).toBe(14);
  });
  it('kelayakan', () => {
    expect(eligibleForKids({ tanggalLahir: new Date('2018-01-01T00:00:00Z'), isDependent: false }, now)).toBe(true);
    expect(eligibleForKids({ tanggalLahir: new Date('1990-01-01T00:00:00Z'), isDependent: false }, now)).toBe(false);
    expect(eligibleForKids({ tanggalLahir: null, isDependent: true }, now)).toBe(true);
    expect(eligibleForKids({ tanggalLahir: null, isDependent: false }, now)).toBe(false);
  });
});

describe('zona waktu cabang lain', () => {
  it('Sydney: ibadah 09:00 AEDT = 22:00Z hari sebelumnya', () => {
    expect(occurrenceStart('2026-12-06', '09:00', 'Australia/Sydney').toISOString()).toBe('2026-12-05T22:00:00.000Z');
  });
  it('Los Angeles: batal masih boleh sebelum 10:00 PDT', () => {
    const r = { status: 'RESERVE', tanggalIbadah: new Date('2026-07-05T00:00:00Z') };
    expect(canCancelReservasi(r, '10:00', new Date('2026-07-05T16:59:00Z'), 'America/Los_Angeles')).toBe(true);
    expect(canCancelReservasi(r, '10:00', new Date('2026-07-05T17:00:00Z'), 'America/Los_Angeles')).toBe(false);
  });
});
