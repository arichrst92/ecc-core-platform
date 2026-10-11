import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@ecc/database', () => ({
  prisma: { waNotificationConfig: { findUnique: h.findUnique } },
}));
vi.mock('@ecc/auth', () => ({ sendWhatsAppText: h.send }));
vi.mock('./logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { renderTemplate, sendWaIfEnabled, getConfig, invalidateWaConfigCache } from './wa-notif.js';

const row = (over: Record<string, unknown> = {}) => ({
  type: 'HOMECELL_ATTENDED',
  isEnabled: true,
  template: 'Halo {nama}, hadir di {homecellNama}',
  category: 'HOMECELL',
  placeholders: ['nama', 'homecellNama'],
  ...over,
});

describe('renderTemplate', () => {
  it('mengganti placeholder yang dikenal', () => {
    expect(renderTemplate('Halo {nama}!', { nama: 'Ari' })).toBe('Halo Ari!');
  });

  it('membiarkan placeholder yang tidak dikenal / null apa adanya', () => {
    expect(renderTemplate('{a} {b} {c}', { a: 'x', b: null })).toBe('x {b} {c}');
  });

  it('mengubah angka jadi string', () => {
    expect(renderTemplate('Usia {usia}', { usia: 30 })).toBe('Usia 30');
  });
});

describe('sendWaIfEnabled', () => {
  beforeEach(() => {
    h.findUnique.mockReset();
    h.send.mockReset();
    invalidateWaConfigCache();
  });

  it('tidak query & tidak kirim kalau noHp kosong', async () => {
    await sendWaIfEnabled('HOMECELL_ATTENDED', null, { nama: 'Ari' });
    expect(h.findUnique).toHaveBeenCalledTimes(0);
    expect(h.send).toHaveBeenCalledTimes(0);
  });

  it('tidak kirim kalau config tidak ada', async () => {
    h.findUnique.mockResolvedValue(null);
    await sendWaIfEnabled('HOMECELL_ATTENDED', '+628123', { nama: 'Ari' });
    expect(h.send).toHaveBeenCalledTimes(0);
  });

  it('tidak kirim kalau config disabled', async () => {
    h.findUnique.mockResolvedValue(row({ isEnabled: false }));
    await sendWaIfEnabled('HOMECELL_ATTENDED', '+628123', { nama: 'Ari' });
    expect(h.send).toHaveBeenCalledTimes(0);
  });

  it('kirim pesan hasil render kalau enabled', async () => {
    h.findUnique.mockResolvedValue(row());
    h.send.mockResolvedValue({ messageId: 'm1', to: '+628123' });
    await sendWaIfEnabled('HOMECELL_ATTENDED', '+628123', { nama: 'Ari', homecellNama: 'HC Menteng' });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith('+628123', 'Halo Ari, hadir di HC Menteng');
  });

  it('tidak throw kalau gateway WA error (error ditelan)', async () => {
    h.findUnique.mockResolvedValue(row());
    h.send.mockRejectedValue(new Error('Fonnte down'));
    await expect(
      sendWaIfEnabled('HOMECELL_ATTENDED', '+628123', { nama: 'Ari' }),
    ).resolves.toBeUndefined();
  });
});

describe('getConfig cache', () => {
  beforeEach(() => {
    h.findUnique.mockReset();
    invalidateWaConfigCache();
  });

  it('query DB sekali untuk panggilan berulang (cache 60s)', async () => {
    h.findUnique.mockResolvedValue(row());
    await getConfig('HOMECELL_ATTENDED');
    await getConfig('HOMECELL_ATTENDED');
    expect(h.findUnique).toHaveBeenCalledTimes(1);
  });

  it('invalidateWaConfigCache(type) memaksa query ulang', async () => {
    h.findUnique.mockResolvedValue(row());
    await getConfig('HOMECELL_ATTENDED');
    invalidateWaConfigCache('HOMECELL_ATTENDED');
    await getConfig('HOMECELL_ATTENDED');
    expect(h.findUnique).toHaveBeenCalledTimes(2);
  });
});
