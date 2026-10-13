import { describe, expect, it } from 'vitest';
import { canSeeResults, checkVoteSelection, isPollOpen, normalizePollOptions } from './group-poll.js';

const now = new Date('2026-10-13T10:00:00Z');
const open = { multiple: false, isClosed: false, closesAt: null };

describe('isPollOpen', () => {
  it('terbuka tanpa batas waktu', () => expect(isPollOpen(open, now)).toBe(true));
  it('ditutup manual', () => expect(isPollOpen({ ...open, isClosed: true }, now)).toBe(false));
  it('lewat batas waktu', () =>
    expect(isPollOpen({ ...open, closesAt: new Date('2026-10-13T09:59:59Z') }, now)).toBe(false));
  it('sebelum batas waktu', () =>
    expect(isPollOpen({ ...open, closesAt: new Date('2026-10-14T00:00:00Z') }, now)).toBe(true));
});

describe('checkVoteSelection', () => {
  const opts = ['a', 'b', 'c'];
  it('single choice 1 opsi ok', () => expect(checkVoteSelection(open, opts, ['a'], now)).toEqual({ ok: true, optionIds: ['a'] }));
  it('single choice 2 opsi ditolak', () => {
    const r = checkVoteSelection(open, opts, ['a', 'b'], now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('POLL_SINGLE_CHOICE');
  });
  it('multiple ok & duplikat dibuang', () =>
    expect(checkVoteSelection({ ...open, multiple: true }, opts, ['a', 'b', 'a'], now)).toEqual({ ok: true, optionIds: ['a', 'b'] }));
  it('opsi asing ditolak', () => {
    const r = checkVoteSelection(open, opts, ['x'], now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('POLL_INVALID_OPTION');
  });
  it('kosong = tarik suara', () => expect(checkVoteSelection(open, opts, [], now)).toEqual({ ok: true, optionIds: [] }));
  it('tertutup ditolak', () => {
    const r = checkVoteSelection({ ...open, isClosed: true }, opts, ['a'], now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('POLL_CLOSED');
  });
});

describe('canSeeResults', () => {
  it('pengelola selalu', () => expect(canSeeResults({ canManage: true, hasVoted: false, open: true })).toBe(true));
  it('anggota belum vote & masih buka → tidak', () =>
    expect(canSeeResults({ canManage: false, hasVoted: false, open: true })).toBe(false));
  it('anggota sudah vote', () => expect(canSeeResults({ canManage: false, hasVoted: true, open: true })).toBe(true));
  it('voting ditutup', () => expect(canSeeResults({ canManage: false, hasVoted: false, open: false })).toBe(true));
});

describe('normalizePollOptions', () => {
  it('trim + buang duplikat', () => expect(normalizePollOptions([' Ya ', 'ya', 'Tidak', ''])).toEqual(['Ya', 'Tidak']));
  it('kurang dari 2 → null', () => expect(normalizePollOptions(['Ya', ' '])).toBeNull());
  it('lebih dari 10 → null', () => expect(normalizePollOptions(Array.from({ length: 11 }, (_, i) => `o${i}`))).toBeNull());
});
