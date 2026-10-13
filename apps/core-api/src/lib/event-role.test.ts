import { describe, it, expect } from 'vitest';
import { grantTrigger, isEligible, notEligibleMessage, requirementLabel } from './event-role.js';

const role = (roleId: string, subRoleId: string, subRoleStatusId: string | null = null) => ({
  roleId,
  subRoleId,
  subRoleStatusId,
});

describe('isEligible — syarat role event (salah satu cocok)', () => {
  const roles = [role('jemaat', 'tetap', 'aktif'), role('pelayan', 'worship', null)];

  it('tanpa syarat → semua boleh', () => {
    expect(isEligible([], [])).toBe(true);
  });

  it('cocok role saja (sub-role & status kosong = semua)', () => {
    expect(isEligible([{ roleId: 'pelayan', subRoleId: null, subRoleStatusId: null }], roles)).toBe(true);
  });

  it('cocok sampai status', () => {
    expect(isEligible([{ roleId: 'jemaat', subRoleId: 'tetap', subRoleStatusId: 'aktif' }], roles)).toBe(true);
    expect(isEligible([{ roleId: 'jemaat', subRoleId: 'tetap', subRoleStatusId: 'baptis' }], roles)).toBe(false);
  });

  it('salah satu dari beberapa syarat cukup', () => {
    expect(
      isEligible(
        [
          { roleId: 'fulltimer', subRoleId: null, subRoleStatusId: null },
          { roleId: 'pelayan', subRoleId: 'worship', subRoleStatusId: null },
        ],
        roles,
      ),
    ).toBe(true);
  });

  it('tidak punya role yang diminta → tidak boleh', () => {
    expect(isEligible([{ roleId: 'fulltimer', subRoleId: null, subRoleStatusId: null }], roles)).toBe(false);
    expect(isEligible([{ roleId: 'pelayan', subRoleId: 'multimedia', subRoleStatusId: null }], roles)).toBe(false);
  });
});

describe('grantTrigger', () => {
  it('event dengan absensi → saat HADIR, tanpa absensi → saat DAFTAR', () => {
    expect(grantTrigger({ butuhKehadiran: true })).toBe('HADIR');
    expect(grantTrigger({ butuhKehadiran: false })).toBe('DAFTAR');
  });
});

describe('requirementLabel', () => {
  it('format label', () => {
    expect(
      requirementLabel({ role: { nama: 'Jemaat' }, subRole: { nama: 'Tetap' }, subRoleStatus: { nama: 'Aktif' } }),
    ).toBe('Jemaat → Tetap → Aktif');
    expect(requirementLabel({ role: { nama: 'Pelayan' }, subRole: null, subRoleStatus: null })).toBe(
      'Pelayan → semua sub-role',
    );
  });
});

describe('notEligibleMessage', () => {
  it('satu syarat', () => {
    expect(notEligibleMessage(['Jemaat → Jemaat Tetap → Aktif'])).toBe(
      'Anda belum diperbolehkan mengikuti event ini. Syaratnya Anda harus Jemaat → Jemaat Tetap → Aktif terlebih dahulu.',
    );
  });
  it('beberapa syarat digabung "atau", dengan nama anggota keluarga', () => {
    expect(notEligibleMessage(['A → B', 'C → D', 'E → F'], 'Budi')).toBe(
      'Budi belum diperbolehkan mengikuti event ini. Syaratnya harus A → B, C → D atau E → F terlebih dahulu.',
    );
  });
});
