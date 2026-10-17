import { describe, expect, it } from 'vitest';
import { eventGrantsStep, journeyProgress, meetsStep } from './spiritual-journey.js';

const step = (roleId: string, subRoleId: string | null = null, subRoleStatusId: string | null = null) => ({
  roleId,
  subRoleId,
  subRoleStatusId,
});

describe('meetsStep', () => {
  const roles = [{ roleId: 'J', subRoleId: 'TETAP', subRoleStatusId: 'EXPAND' }];
  it('cocok penuh', () => expect(meetsStep(step('J', 'TETAP', 'EXPAND'), roles)).toBe(true));
  it('hanya role', () => expect(meetsStep(step('J'), roles)).toBe(true));
  it('status beda', () => expect(meetsStep(step('J', 'TETAP', 'GROW'), roles)).toBe(false));
  it('role beda', () => expect(meetsStep(step('X'), roles)).toBe(false));
});

describe('journeyProgress', () => {
  it('tahap berikutnya = pertama yang belum', () => {
    const steps = [step('J', 'TETAP'), step('J', 'TETAP', 'EXPAND'), step('J', 'TETAP', 'GROW')];
    const p = journeyProgress(steps, [
      { roleId: 'J', subRoleId: 'TETAP', subRoleStatusId: 'GROW' },
    ]);
    expect(p.steps.map((s) => s.achieved)).toEqual([true, false, true]);
    expect(p.nextIndex).toBe(1);
    expect(p.steps[1]!.isNext).toBe(true);
    expect(p.achievedCount).toBe(2);
  });
  it('semua tercapai', () => {
    expect(journeyProgress([step('J')], [{ roleId: 'J', subRoleId: 'X', subRoleStatusId: null }]).nextIndex).toBeNull();
  });
});

describe('eventGrantsStep', () => {
  it('event memberi status yang diminta', () => {
    expect(eventGrantsStep({ grantRoleId: 'J', grantSubRoleId: 'TETAP', grantSubRoleStatusId: 'EXPAND' }, step('J', 'TETAP', 'EXPAND'))).toBe(true);
    expect(eventGrantsStep({ grantRoleId: 'J', grantSubRoleId: 'TETAP', grantSubRoleStatusId: null }, step('J', 'TETAP', 'EXPAND'))).toBe(false);
    expect(eventGrantsStep({ grantRoleId: null, grantSubRoleId: null, grantSubRoleStatusId: null }, step('J'))).toBe(false);
  });
});
