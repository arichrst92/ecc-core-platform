import { describe, expect, it } from 'vitest';
import { effectiveTamuStatus, normTamuStatus } from './tamu-status.js';

describe('effectiveTamuStatus', () => {
  it('default diundang', () => expect(effectiveTamuStatus({ stored: null, isTamu: true, hasAttended: false })).toBe('DIUNDANG'));
  it('hadir → terlibat otomatis', () => expect(effectiveTamuStatus({ stored: 'DIUNDANG', isTamu: true, hasAttended: true })).toBe('TERLIBAT'));
  it('follow-up admin tetap', () => expect(effectiveTamuStatus({ stored: 'FOLLOWUP', isTamu: true, hasAttended: true })).toBe('FOLLOWUP'));
  it('sudah daftar Els App → terdaftar', () => expect(effectiveTamuStatus({ stored: 'DIUNDANG', isTamu: false, hasAttended: false })).toBe('TERDAFTAR'));
  it('admin set terdaftar', () => expect(effectiveTamuStatus({ stored: 'TERDAFTAR', isTamu: true, hasAttended: false })).toBe('TERDAFTAR'));
  it('nilai aneh → diundang', () => expect(normTamuStatus('XYZ')).toBe('DIUNDANG'));
});
