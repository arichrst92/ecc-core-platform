import { describe, it, expect, vi } from 'vitest';

vi.mock('@ecc/database', () => ({ prisma: {} }));

import { pickOffer } from './duplicate-candidate.js';
import { maskEmail, maskName } from './otp-store.js';

const c = (id: string, score: number) => ({ id, namaLengkap: id, email: null, noHp: null, score });

describe('pickOffer', () => {
  it('menawarkan kandidat yang jelas unggul', () => {
    expect(pickOffer([c('a', 0.95), c('b', 0.7)])?.id).toBe('a');
  });
  it('tidak menawarkan bila skor di bawah 0.8', () => {
    expect(pickOffer([c('a', 0.79)])).toBeNull();
  });
  it('tidak menawarkan bila dua kandidat setara (ambigu)', () => {
    expect(pickOffer([c('a', 0.9), c('b', 0.85)])).toBeNull();
  });
  it('tidak ada kandidat', () => {
    expect(pickOffer([])).toBeNull();
  });
});

describe('mask', () => {
  it('menyamarkan email & nama', () => {
    expect(maskEmail('kenrick@gmail.com')).toBe('k******@gmail.com');
    expect(maskEmail('ab@x.id')).toBe('a***@x.id');
    expect(maskName('Kenrick Nathanael')).toBe('Ke***** Na*******');
    expect(maskName('Al B')).toBe('A* B*');
  });
});
