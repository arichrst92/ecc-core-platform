import { describe, expect, it, vi } from 'vitest';

vi.mock('@ecc/database', () => ({ prisma: {} }));
const { ibadahReviewWindow, eventReviewWindow, summarize } = await import('./service-review.js');

describe('jendela ulasan', () => {
  const r = { tanggalIbadah: new Date('2026-11-01'), status: 'JOIN', ibadah: { jamMulai: '08:00', jamSelesai: '10:00' } };
  it('ibadah: belum mulai → tutup, sejak jam mulai → buka, 14 hari setelah selesai → tutup', () => {
    expect(ibadahReviewWindow(r, 'Asia/Jakarta', new Date('2026-11-01T00:59:00Z')).reason).toBe('NOT_STARTED');
    expect(ibadahReviewWindow(r, 'Asia/Jakarta', new Date('2026-11-01T01:00:00Z')).open).toBe(true);
    expect(ibadahReviewWindow(r, 'Asia/Jakarta', new Date('2026-11-15T03:01:00Z')).reason).toBe('CLOSED');
  });
  it('tiket batal tidak bisa diulas', () => {
    expect(ibadahReviewWindow({ ...r, status: 'CANCEL' }, 'Asia/Jakarta', new Date('2026-11-02')).reason).toBe('CANCELLED');
  });
  it('event multi-hari terbuka sejak hari pertama jam mulai', () => {
    const e = { status: 'DAFTAR', event: { tanggalMulai: new Date('2026-11-20'), tanggalSelesai: new Date('2026-11-22'), jamMulai: '18:00', jamSelesai: '21:00' } };
    const w = eventReviewWindow(e, 'Asia/Jakarta', new Date('2026-11-21T00:00:00Z'));
    expect(w.open).toBe(true);
    expect(w.startsAt).toBe('2026-11-20T11:00:00.000Z');
  });
  it('ringkasan rating', () => {
    expect(summarize([{ rating: 5, komentar: 'ok' }, { rating: 4 }, { rating: 5 }])).toEqual({ count: 3, avg: 4.7, dist: [0, 0, 0, 1, 2], withComment: 1 });
  });
});
