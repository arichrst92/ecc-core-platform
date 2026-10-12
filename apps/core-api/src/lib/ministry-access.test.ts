import { describe, it, expect } from 'vitest';
import {
  LEADER_MIN_LEVEL,
  canManageMinistry,
  checkCanRequestJoin,
  pickMyJoinRequest,
} from './ministry-access.js';

describe('canManageMinistry', () => {
  it('Fulltimer (ALL) boleh kelola ministry mana pun', () => {
    expect(canManageMinistry('ALL', 'm1')).toBe(true);
  });

  it('leader hanya boleh kelola ministry yang dia pimpin', () => {
    const managed = new Set(['m1']);
    expect(canManageMinistry(managed, 'm1')).toBe(true);
    expect(canManageMinistry(managed, 'm2')).toBe(false);
  });

  it('jemaat biasa (set kosong) tidak boleh kelola', () => {
    expect(canManageMinistry(new Set(), 'm1')).toBe(false);
  });

  it('ambang leader = level 5 (Co-Leader ke atas)', () => {
    expect(LEADER_MIN_LEVEL).toBe(5);
  });
});

describe('checkCanRequestJoin', () => {
  it('ok kalau belum anggota dan tidak ada request pending', () => {
    expect(checkCanRequestJoin({ hasActiveMembership: false, hasPendingRequest: false })).toEqual({
      ok: true,
    });
  });

  it('409 ALREADY_MEMBER kalau sudah anggota aktif', () => {
    const r = checkCanRequestJoin({ hasActiveMembership: true, hasPendingRequest: false });
    expect(r.ok).toBe(false);
    expect((r as { code: string }).code).toBe('ALREADY_MEMBER');
  });

  it('409 JOIN_REQUEST_PENDING kalau masih menunggu persetujuan', () => {
    const r = checkCanRequestJoin({ hasActiveMembership: false, hasPendingRequest: true });
    expect((r as { code: string }).code).toBe('JOIN_REQUEST_PENDING');
  });
});

describe('pickMyJoinRequest', () => {
  const req = (status: string) => ({ id: 'r1', status });

  it('tampilkan PENDING dan REJECTED terbaru', () => {
    expect(pickMyJoinRequest(req('PENDING'), false)).toEqual(req('PENDING'));
    expect(pickMyJoinRequest(req('REJECTED'), false)).toEqual(req('REJECTED'));
  });

  it('null kalau sudah anggota aktif', () => {
    expect(pickMyJoinRequest(req('PENDING'), true)).toBe(null);
  });

  it('null kalau tidak ada request atau sudah APPROVED / CANCELLED', () => {
    expect(pickMyJoinRequest(null, false)).toBe(null);
    expect(pickMyJoinRequest(req('APPROVED'), false)).toBe(null);
    expect(pickMyJoinRequest(req('CANCELLED'), false)).toBe(null);
  });
});
