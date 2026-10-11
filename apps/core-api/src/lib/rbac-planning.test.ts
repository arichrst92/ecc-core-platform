import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('@ecc/database', () => ({
  prisma: { iTMinisterTeam: { findFirst: h.findFirst } },
}));

import { requireItTeam, isItTeamMember, invalidateItTeamCache } from './rbac-planning.js';

function run(user: unknown) {
  const next = vi.fn();
  const req = { user } as never;
  return requireItTeam(req, {} as never, next).then(() => next);
}

describe('requireItTeam', () => {
  beforeEach(() => {
    h.findFirst.mockReset();
    invalidateItTeamCache();
  });

  it('401 kalau belum login', async () => {
    const next = await run(undefined);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
    expect(h.findFirst).toHaveBeenCalledTimes(0);
  });

  it('403 kalau bukan anggota IT Minister Team aktif', async () => {
    h.findFirst.mockResolvedValue(null);
    const next = await run({ jemaatId: 'j1' });
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('lolos (next tanpa error) kalau anggota aktif', async () => {
    h.findFirst.mockResolvedValue({ id: 't1' });
    const next = await run({ jemaatId: 'j1' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('query hanya membership aktif', async () => {
    h.findFirst.mockResolvedValue({ id: 't1' });
    await isItTeamMember('j9');
    expect(h.findFirst.mock.calls[0][0].where).toEqual({ jemaatId: 'j9', isActive: true });
  });

  it('hasil di-cache per jemaat', async () => {
    h.findFirst.mockResolvedValue({ id: 't1' });
    await isItTeamMember('j1');
    await isItTeamMember('j1');
    expect(h.findFirst).toHaveBeenCalledTimes(1);
  });
});
