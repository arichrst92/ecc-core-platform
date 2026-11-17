import { describe, it, expect, vi } from 'vitest';

vi.mock('@ecc/database', () => ({ prisma: {} }));
vi.mock('@ecc/auth', () => ({ getFonnteDevice: vi.fn(), setWaOtpSkip: vi.fn(), waProviderStatus: vi.fn() }));
vi.mock('./logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock('./sendgrid.js', () => ({ sendEmail: vi.fn() }));
vi.mock('./backup-email.js', () => ({ getBackupEmailConfig: vi.fn() }));
vi.mock('./wa-runtime.js', () => ({ waRuntimeSettings: () => ({ waSuspectThreshold: 8 }) }));

import { SUSPECT_FOR_MS, decideSuspect, unusedStreak } from './wa-otp-health.js';

const used = (b: boolean) => ({ usedAt: b ? new Date() : null });

describe('unusedStreak', () => {
  it('menghitung OTP tak terpakai berturut-turut dari yang terbaru', () => {
    expect(unusedStreak([used(false), used(false), used(true), used(false)])).toBe(2);
    expect(unusedStreak([used(true), used(false)])).toBe(0);
    expect(unusedStreak([])).toBe(0);
  });
});

describe('decideSuspect', () => {
  const now = 1_000_000;
  it('menandai diduga gagal bila streak mencapai ambang', () => {
    const r = decideSuspect({ current: undefined, streak: 8, usedSinceSuspect: false, threshold: 8, now });
    expect(r.event).toBe('suspect');
    expect(r.next).toEqual({ since: now, until: now + SUSPECT_FOR_MS, streak: 8 });
  });
  it('tidak menandai di bawah ambang atau bila ambang 0 (nonaktif)', () => {
    expect(decideSuspect({ current: undefined, streak: 7, usedSinceSuspect: false, threshold: 8, now }).event).toBeNull();
    expect(decideSuspect({ current: undefined, streak: 99, usedSinceSuspect: false, threshold: 0, now }).event).toBeNull();
  });
  it('pulih bila ada OTP yang dipakai setelah ditandai', () => {
    const cur = { since: now - 1000, until: now + 1000, streak: 8 };
    expect(decideSuspect({ current: cur, streak: 8, usedSinceSuspect: true, threshold: 8, now }).event).toBe('recovered');
  });
  it('berakhir setelah 15 menit lalu dicoba lagi', () => {
    const cur = { since: now - SUSPECT_FOR_MS, until: now, streak: 8 };
    const r = decideSuspect({ current: cur, streak: 8, usedSinceSuspect: false, threshold: 8, now });
    expect(r.event).toBe('expired');
    expect(r.next).toBeUndefined();
  });
  it('tetap diduga gagal selama masa berlaku', () => {
    const cur = { since: now - 1000, until: now + 1000, streak: 8 };
    const r = decideSuspect({ current: cur, streak: 8, usedSinceSuspect: false, threshold: 8, now });
    expect(r.event).toBeNull();
    expect(r.next).toBe(cur);
  });
});
