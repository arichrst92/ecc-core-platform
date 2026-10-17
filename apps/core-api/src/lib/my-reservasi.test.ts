import { describe, expect, it } from 'vitest';
import { activeWindow, isActiveRow, relationFor } from './my-reservasi.js';

describe('activeWindow', () => {
  it('batas query longgar (kemarin UTC)', () => {
    const w = activeWindow(new Date('2026-10-17T18:00:00Z'));
    expect(w.fromTanggal.toISOString().slice(0, 10)).toBe('2026-10-16');
    expect(w.joinedSince.toISOString()).toBe('2026-10-16T18:00:00.000Z');
  });
  it('aktif per zona cabang', () => {
    const now = new Date('2026-10-17T18:00:00Z'); // 18 Okt di Jakarta, 17 Okt di New York
    const r = { tanggalIbadah: new Date('2026-10-17T00:00:00Z'), joinedAt: null };
    expect(isActiveRow(r, 'Asia/Jakarta', now)).toBe(false);
    expect(isActiveRow(r, 'America/New_York', now)).toBe(true);
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
