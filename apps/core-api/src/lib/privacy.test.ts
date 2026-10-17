import { describe, expect, it } from 'vitest';
import { DEFAULT_PRIVACY, canSee, normalizePrivacy, type Relation } from './privacy.js';

const rel = (...r: Relation[]) => new Set<Relation>(r);

describe('normalizePrivacy', () => {
  it('kosong → default', () => {
    expect(normalizePrivacy(null)).toEqual(DEFAULT_PRIVACY);
  });
  it('buang audiens tak dikenal, field lain default', () => {
    const p = normalizePrivacy({ noHp: ['KELUARGA', 'HACK'], alamat: [] });
    expect(p.noHp).toEqual(['KELUARGA']);
    expect(p.alamat).toEqual([]);
    expect(p.email).toEqual(DEFAULT_PRIVACY.email);
  });
});

describe('canSee', () => {
  const s = normalizePrivacy({ noHp: ['HOMECELL'], alamat: [], email: ['SEMUA'] });
  it('sesuai centang', () => {
    expect(canSee(s, 'noHp', rel('HOMECELL'))).toBe(true);
    expect(canSee(s, 'noHp', rel('CABANG', 'GROUP'))).toBe(false);
  });
  it('SEMUA = siapa saja', () => {
    expect(canSee(s, 'email', rel())).toBe(true);
  });
  it('diri sendiri & PIC (pastoral) selalu boleh', () => {
    expect(canSee(s, 'alamat', rel('SELF'))).toBe(true);
    expect(canSee(s, 'alamat', rel('PASTORAL'))).toBe(true);
    expect(canSee(s, 'alamat', rel('KELUARGA'))).toBe(false);
  });
});
