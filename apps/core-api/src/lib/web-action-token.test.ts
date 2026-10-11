import { describe, it, expect } from 'vitest';
import {
  TOKEN_TTL_MS,
  SESSION_TTL_MS,
  checkExchangeable,
  checkSession,
  generateSecret,
  hashSecret,
} from './web-action-token.js';

const NOW = new Date('2026-10-11T10:00:00Z');
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe('generateSecret / hashSecret', () => {
  it('secret acak, url-safe, 43 char', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a === b).toBe(false);
    expect(/^[A-Za-z0-9_-]{43}$/.test(a)).toBe(true);
  });

  it('hash deterministik, sha256 hex 64 char, bukan raw value', () => {
    const s = 'abc';
    expect(hashSecret(s)).toBe(hashSecret(s));
    expect(hashSecret(s)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('TTL sesuai spec (token 10 menit, session 30 menit)', () => {
    expect(TOKEN_TTL_MS).toBe(600_000);
    expect(SESSION_TTL_MS).toBe(1_800_000);
  });
});

describe('checkExchangeable', () => {
  it('not_found kalau row tidak ada', () => {
    expect(checkExchangeable(null, NOW)).toBe('not_found');
  });

  it('used kalau sudah pernah di-exchange (sekali pakai)', () => {
    expect(checkExchangeable({ usedAt: NOW, expiresAt: later(60_000) }, NOW)).toBe('used');
  });

  it('expired kalau lewat TTL', () => {
    expect(checkExchangeable({ usedAt: null, expiresAt: later(-1) }, NOW)).toBe('expired');
    expect(checkExchangeable({ usedAt: null, expiresAt: NOW }, NOW)).toBe('expired');
  });

  it('ok kalau belum dipakai dan belum expired', () => {
    expect(checkExchangeable({ usedAt: null, expiresAt: later(1) }, NOW)).toBe('ok');
  });
});

describe('checkSession', () => {
  const row = { sessionExpiresAt: later(60_000), eventId: 'event-A' };

  it('not_found kalau belum di-exchange', () => {
    expect(checkSession(null, 'event-A', NOW)).toBe('not_found');
    expect(checkSession({ sessionExpiresAt: null, eventId: 'event-A' }, 'event-A', NOW)).toBe('not_found');
  });

  it('expired kalau session lewat 30 menit', () => {
    expect(checkSession({ ...row, sessionExpiresAt: later(-1) }, 'event-A', NOW)).toBe('expired');
  });

  it('wrong_event kalau token event A dipakai di event B', () => {
    expect(checkSession(row, 'event-B', NOW)).toBe('wrong_event');
  });

  it('ok untuk event yang sama, dan untuk route tanpa eventId (session/family)', () => {
    expect(checkSession(row, 'event-A', NOW)).toBe('ok');
    expect(checkSession(row, undefined, NOW)).toBe('ok');
  });
});
