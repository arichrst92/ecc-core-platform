import { describe, it, expect } from 'vitest';
import { formatPhoneDisplay, noHpSchema, normalizePhoneNumber } from '@ecc/shared-types';

describe('normalizePhoneNumber — semua negara', () => {
  it('nomor lokal Indonesia → +62', () => {
    expect(normalizePhoneNumber('0812-3456-7890')).toBe('+6281234567890');
    expect(normalizePhoneNumber('812 3456 7890')).toBe('+6281234567890');
    expect(normalizePhoneNumber('6281234567890')).toBe('+6281234567890');
    expect(normalizePhoneNumber('+62 812 3456 7890')).toBe('+6281234567890');
  });

  it('nomor internasional tetap negaranya', () => {
    expect(normalizePhoneNumber('+65 9123 4567')).toBe('+6591234567');
    expect(normalizePhoneNumber('0065 91234567')).toBe('+6591234567');
    expect(normalizePhoneNumber('+61 412 345 678')).toBe('+61412345678');
    expect(normalizePhoneNumber('+1 415 555 2671')).toBe('+14155552671');
    expect(normalizePhoneNumber('+60 12-345 6789')).toBe('+60123456789');
  });

  it('tidak valid → null', () => {
    expect(normalizePhoneNumber('123')).toBe(null);
    expect(normalizePhoneNumber('')).toBe(null);
    expect(normalizePhoneNumber(null)).toBe(null);
    expect(normalizePhoneNumber('+62 123')).toBe(null);
  });

  it('format tampilan internasional', () => {
    expect(formatPhoneDisplay('+6591234567')).toBe('+65 9123 4567');
    expect(formatPhoneDisplay('+6281234567890')).toBe('+62 812 3456 7890');
  });
});

describe('noHpSchema', () => {
  it('menormalisasi input ke E.164', () => {
    expect(noHpSchema.parse('0812 3456 7890')).toBe('+6281234567890');
    expect(noHpSchema.parse('+65 9123 4567')).toBe('+6591234567');
  });

  it('menolak nomor tidak valid', () => {
    expect(noHpSchema.safeParse('12345').success).toBe(false);
  });
});
