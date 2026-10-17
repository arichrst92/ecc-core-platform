import { describe, expect, it } from 'vitest';
import { activeWindow, relationFor } from './my-reservasi.js';

describe('activeWindow', () => {
  it('hari ini WIB lewat tengah malam', () => {
    const w = activeWindow(new Date('2026-10-17T18:00:00Z')); // 01:00 WIB 18 Okt
    expect(w.fromTanggal.toISOString().slice(0, 10)).toBe('2026-10-18');
    expect(w.joinedSince.toISOString()).toBe('2026-10-16T18:00:00.000Z');
  });
});

describe('relationFor', () => {
  const people = new Map([
    ['a', 'ANAK' as const],
    ['d', 'TANGGUNGAN' as const],
  ]);
  it('label relasi', () => {
    expect(relationFor({ jemaatId: 'me', invitedByJemaatId: null }, 'me', people)).toBe('SELF');
    expect(relationFor({ jemaatId: 'a', invitedByJemaatId: null }, 'me', people)).toBe('ANAK');
    expect(relationFor({ jemaatId: 'd', invitedByJemaatId: null }, 'me', people)).toBe('TANGGUNGAN');
    expect(relationFor({ jemaatId: 't', invitedByJemaatId: 'me' }, 'me', people)).toBe('TAMU');
    expect(relationFor({ jemaatId: 'x', invitedByJemaatId: null }, 'me', people)).toBe('KELUARGA');
  });
});
