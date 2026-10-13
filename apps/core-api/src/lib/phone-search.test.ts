import { describe, it, expect } from 'vitest';
import { phoneSearchTerms } from './phone-search.js';

describe('phoneSearchTerms', () => {
  it('format lokal & internasional', () => {
    expect(phoneSearchTerms('0812 3456')).toEqual(['08123456', '8123456']);
    expect(phoneSearchTerms('+65 9123')).toEqual(['659123']);
    expect(phoneSearchTerms('62812')).toEqual(['62812']);
  });
  it('bukan nomor → kosong', () => {
    expect(phoneSearchTerms('Budi')).toEqual([]);
    expect(phoneSearchTerms('08')).toEqual([]);
  });
});
