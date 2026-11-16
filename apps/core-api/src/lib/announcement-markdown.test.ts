import { describe, expect, it } from 'vitest';
import { mdToHtml, mdToPlain, mdToWhatsApp } from '@ecc/shared-types';

describe('announcement markdown', () => {
  const md = '# Natal **2026**\nShalom **jemaat**! Ibadah *malam* ~~batal~~.\n- Reservasi [di sini](https://eccchurch.global/ibadah)\n- <b>x</b>';
  it('WhatsApp', () => {
    expect(mdToWhatsApp(md)).toBe(
      '*Natal 2026*\nShalom *jemaat*! Ibadah _malam_ ~batal~.\n• Reservasi di sini (https://eccchurch.global/ibadah)\n• <b>x</b>',
    );
  });
  it('teks polos', () => {
    expect(mdToPlain(md)).toBe('Natal 2026\nShalom jemaat! Ibadah malam batal.\n• Reservasi di sini\n• <b>x</b>');
  });
  it('HTML aman (escape) + link http saja', () => {
    const html = mdToHtml(md + '\n\n[x](javascript:alert(1))');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('<a href="https://eccchurch.global/ibadah"');
    expect(html).not.toContain('javascript:');
  });
});
