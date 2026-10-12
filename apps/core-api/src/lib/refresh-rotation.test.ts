import { describe, it, expect } from 'vitest';
import { ROTATION_GRACE_MS, isWithinRotationGrace } from './refresh-rotation.js';

describe('isWithinRotationGrace', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it('true untuk token yang baru dirotasi (race antar-tab)', () => {
    expect(isWithinRotationGrace(ago(0), now)).toBe(true);
    expect(isWithinRotationGrace(ago(5_000), now)).toBe(true);
    expect(isWithinRotationGrace(ago(ROTATION_GRACE_MS - 1), now)).toBe(true);
  });

  it('false setelah jeda toleransi → tetap dianggap reuse', () => {
    expect(isWithinRotationGrace(ago(ROTATION_GRACE_MS), now)).toBe(false);
    expect(isWithinRotationGrace(ago(60 * 60 * 1000), now)).toBe(false);
  });

  it('jeda toleransi 2 menit', () => {
    expect(ROTATION_GRACE_MS).toBe(120_000);
  });
});
