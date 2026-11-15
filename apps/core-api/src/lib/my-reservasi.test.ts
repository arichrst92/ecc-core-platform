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

describe('isActiveRow — pindah ke riwayat setelah ibadah selesai', () => {
  const ib = { jamMulai: '10:00', jamSelesai: '12:00' };
  const tgl = new Date('2026-10-18T00:00:00Z');
  const at = (wib: string) => new Date(`2026-10-18T${wib}:00+07:00`);
  it('hari ini sebelum / saat ibadah → aktif', () => {
    expect(isActiveRow({ tanggalIbadah: tgl, joinedAt: null, status: 'RESERVE' }, 'Asia/Jakarta', at('09:00'), ib)).toBe(true);
    expect(isActiveRow({ tanggalIbadah: tgl, joinedAt: at('10:05'), status: 'JOIN' }, 'Asia/Jakarta', at('11:59'), ib)).toBe(true);
  });
  it('sudah selesai → riwayat (hadir / batal)', () => {
    expect(isActiveRow({ tanggalIbadah: tgl, joinedAt: at('10:05'), status: 'JOIN' }, 'Asia/Jakarta', at('12:01'), ib)).toBe(false);
    expect(isActiveRow({ tanggalIbadah: tgl, joinedAt: null, status: 'CANCEL' }, 'Asia/Jakarta', at('12:01'), ib)).toBe(false);
  });
  it('belum check-in: aktif sampai self check-in tutup (+30 menit)', () => {
    expect(isActiveRow({ tanggalIbadah: tgl, joinedAt: null, status: 'RESERVE' }, 'Asia/Jakarta', at('12:20'), ib)).toBe(true);
    expect(isActiveRow({ tanggalIbadah: tgl, joinedAt: null, status: 'RESERVE' }, 'Asia/Jakarta', at('12:31'), ib)).toBe(false);
  });
  it('anak belum dijemput tetap aktif', () => {
    const kid = { ...ib, isKidsIbadah: true };
    expect(isActiveRow({ tanggalIbadah: tgl, joinedAt: at('10:05'), status: 'JOIN', pickupCode: '123456', pickedUpAt: null }, 'Asia/Jakarta', at('13:00'), kid)).toBe(true);
    expect(isActiveRow({ tanggalIbadah: tgl, joinedAt: at('10:05'), status: 'JOIN', pickupCode: '123456', pickedUpAt: at('12:10') }, 'Asia/Jakarta', at('13:00'), kid)).toBe(false);
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
