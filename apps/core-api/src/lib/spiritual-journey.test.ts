import { describe, expect, it } from 'vitest';
import { eventGrantsStep, jemaatWhereForStage, journeyProgress, journeyStage, journeyStageLabel, meetsStep } from './spiritual-journey.js';

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
    // Bertahap: memegang tahap 3 (GROW) berarti tahap 1–2 juga tercapai.
    expect(p.steps.map((s) => s.achieved)).toEqual([true, true, true]);
    expect(p.nextIndex).toBeNull();
    expect(p.achievedCount).toBe(3);
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

describe('journeyStage', () => {
  const steps = [
    { roleId: 'R1', subRoleId: null, subRoleStatusId: null, judul: 'Satu' },
    { roleId: 'R2', subRoleId: null, subRoleStatusId: null, judul: 'Dua' },
    { roleId: 'R3', subRoleId: null, subRoleStatusId: null, judul: 'Tiga' },
  ];
  const held = (...ids: string[]) => ids.map((roleId) => ({ roleId, subRoleId: 'x', subRoleStatusId: null }));
  it('belum mulai', () => {
    const s = journeyStage(steps, []);
    expect(s.stage).toBe(0);
    expect(journeyStageLabel(s)).toBe('Belum mulai (0/3)');
  });
  it('bertahap: tahap tertinggi yang dipegang', () => {
    const s = journeyStage(steps, held('R2'));
    expect(s.stage).toBe(2);
    expect(s.next).toBe('Tiga');
    expect(journeyStageLabel(s)).toBe('Tahap 2/3 · Dua');
  });
  it('status tahap awal tertimpa tahap 4 → tahap 1–3 tetap tercapai', () => {
    const st = [step('J', 'TETAP', 'S1'), step('J', 'TETAP', 'S2'), step('J', 'TETAP', 'S3'), step('J', 'TETAP', 'S4')];
    const p = journeyProgress(st, [{ roleId: 'J', subRoleId: 'TETAP', subRoleStatusId: 'S4' }]);
    expect(p.steps.map((s) => s.achieved)).toEqual([true, true, true, true]);
    expect(p.achievedCount).toBe(4);
  });
  it('semua tercapai', () => {
    expect(journeyStage(steps, held('R1', 'R2', 'R3')).stage).toBe(3);
  });
  it('where stage: memegang tahap 1, tidak memegang tahap 2–3', () => {
    const w = jemaatWhereForStage(steps, 1) as { AND: unknown[] };
    expect(w.AND.length).toBe(2);
  });
  it('where stage 0: tidak memegang tahap mana pun', () => {
    const w = jemaatWhereForStage(steps, 0) as { AND: unknown[] };
    expect(w.AND.length).toBe(1);
  });
});
