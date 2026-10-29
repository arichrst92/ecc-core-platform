import { describe, expect, it, vi } from 'vitest';

vi.mock('@ecc/database', () => ({ prisma: {}, Prisma: {} }));
const { ageFrom, assertAgeAllowed } = await import('./consent.js');

const yearsAgo = (y: number, extraDays = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  d.setDate(d.getDate() - extraDays);
  return d;
};

describe('consent age rules', () => {
  it('ageFrom null bila tanggal lahir kosong', () => expect(ageFrom(null)).toBeNull());
  it('ageFrom menghitung umur penuh', () => expect(ageFrom(yearsAgo(20, 1))).toBe(20));
  it('< 13 tahun ditolak', () => expect(() => assertAgeAllowed(yearsAgo(12), 'MINOR_WITH_GUARDIAN')).toThrow());
  it('13–17 wajib izin orang tua', () => {
    expect(() => assertAgeAllowed(yearsAgo(15), 'ADULT')).toThrow();
    expect(() => assertAgeAllowed(yearsAgo(15), 'MINOR_WITH_GUARDIAN')).not.toThrow();
  });
  it('dewasa & tanpa tanggal lahir lolos', () => {
    expect(() => assertAgeAllowed(yearsAgo(30), 'ADULT')).not.toThrow();
    expect(() => assertAgeAllowed(null, 'ADULT')).not.toThrow();
  });
});
