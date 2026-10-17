import { describe, expect, it } from 'vitest';
import { buildEventReport, buildIbadahReport, weekStart } from './attendance-report.js';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const j = (id: string, isTamu = false) => ({ id, namaLengkap: id.toUpperCase(), noHp: null, isTamu });

describe('weekStart', () => {
  it('Rabu → Senin', () => expect(weekStart(d('2026-10-14'))).toBe('2026-10-12'));
  it('Minggu → Senin sebelumnya', () => expect(weekStart(d('2026-10-18'))).toBe('2026-10-12'));
});

describe('buildIbadahReport', () => {
  const scheduled = [
    { ibadahId: 'A', tanggal: '2026-10-04' },
    { ibadahId: 'A', tanggal: '2026-10-11' },
  ];
  const rows = [
    { ibadahId: 'A', tanggalIbadah: d('2026-10-04'), checkinMethod: 'SCAN', guestSource: null, invitedByJemaatId: null, jemaat: j('j1') },
    { ibadahId: 'A', tanggalIbadah: d('2026-10-04'), checkinMethod: 'SELF', guestSource: null, invitedByJemaatId: null, jemaat: j('j2') },
    { ibadahId: 'A', tanggalIbadah: d('2026-10-11'), checkinMethod: 'SELF', guestSource: 'DIUNDANG', invitedByJemaatId: 'j1', jemaat: j('t1', true) },
    { ibadahId: 'A', tanggalIbadah: d('2026-10-04'), checkinMethod: 'WALK_IN', guestSource: 'WALK_IN', invitedByJemaatId: null, jemaat: j('t2', true) },
    { ibadahId: 'A', tanggalIbadah: d('2026-10-11'), checkinMethod: null, guestSource: null, invitedByJemaatId: null, jemaat: j('j1') },
  ];
  // t1 pertama kali 11 Okt (baru), t2 pertama kali Agustus (berulang)
  const first = new Map([
    ['t1', d('2026-10-11')],
    ['t2', d('2026-08-02')],
  ]);
  const r = buildIbadahReport(scheduled, rows, first, d('2026-10-01'));

  it('ringkasan', () => {
    expect(r.summary.totalHadir).toBe(5);
    expect(r.summary.jemaatHadir).toBe(3);
    expect(r.summary.tamuHadir).toBe(2);
    expect(r.summary.uniqueJemaat).toBe(2);
    expect(r.summary.uniqueTamu).toBe(2);
    expect(r.summary.tamuBaru).toBe(1);
    expect(r.summary.pertemuan).toBe(2);
    expect(r.summary.rataRata).toBe(2.5);
  });
  it('cara check-in', () =>
    expect(r.summary.methods).toEqual({ SCAN: 1, SELF: 2, WALK_IN: 1, MANUAL: 0, UNKNOWN: 1 }));
  it('per pertemuan (terbaru dulu) + tamu baru di pertemuan pertamanya', () => {
    expect(r.occurrences[0]!.tanggal).toBe('2026-10-11');
    expect(r.occurrences[0]!.tamuBaru).toBe(1);
    expect(r.occurrences[1]!.tamuBaru).toBe(0);
  });
  it('tren mingguan', () =>
    expect(r.trend).toEqual([
      { week: '2026-09-28', jemaat: 2, tamu: 1 },
      { week: '2026-10-05', jemaat: 1, tamu: 1 },
    ]));
  it('daftar tamu: baru dulu, pengundang & walk-in', () => {
    expect(r.guests[0]!.id).toBe('t1');
    expect(r.guests[0]!.inviterIds).toEqual(['j1']);
    expect(r.guests[1]!.walkIn).toBe(true);
    expect(r.guests[1]!.isBaru).toBe(false);
  });
  it('pertemuan tanpa kehadiran tetap muncul', () => {
    const r2 = buildIbadahReport([{ ibadahId: 'B', tanggal: '2026-10-05' }], [], new Map(), d('2026-10-01'));
    expect(r2.occurrences).toHaveLength(1);
    expect(r2.summary.rataRata).toBe(0);
  });
});

describe('buildEventReport', () => {
  const rows = [
    { eventId: 'E', status: 'HADIR', checkinMethod: 'SCAN', guestSource: null, invitedByJemaatId: null, jemaat: j('j1') },
    { eventId: 'E', status: 'DAFTAR', checkinMethod: null, guestSource: null, invitedByJemaatId: null, jemaat: j('j2') },
    { eventId: 'E', status: 'HADIR', checkinMethod: 'WALK_IN', guestSource: 'WALK_IN', invitedByJemaatId: null, jemaat: j('t1', true) },
    { eventId: 'E', status: 'BATAL', checkinMethod: null, guestSource: null, invitedByJemaatId: null, jemaat: j('j3') },
    { eventId: 'X', status: 'HADIR', checkinMethod: 'SCAN', guestSource: null, invitedByJemaatId: null, jemaat: j('j4') },
  ];
  const r = buildEventReport(['E', 'F'], rows);
  it('per event', () => {
    const e = r.events.find((x) => x.eventId === 'E')!;
    expect(e.terdaftar).toBe(3);
    expect(e.batal).toBe(1);
    expect(e.hadir).toBe(2);
    expect(e.persenHadir).toBe(67);
    expect(e.tamuHadir).toBe(1);
  });
  it('event tanpa peserta', () => expect(r.events.find((x) => x.eventId === 'F')!.persenHadir).toBeNull());
  it('ringkasan & tamu', () => {
    expect(r.summary.hadir).toBe(2);
    expect(r.summary.tamuUnik).toBe(1);
    expect(r.guests[0]!.walkIn).toBe(true);
  });
});
