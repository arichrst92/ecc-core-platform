import { describe, expect, it } from 'vitest';
import { buildVisitWhere, personWhere, summarizeVisits } from './visit-filter.js';

describe('personWhere', () => {
  it('kosong → null', () => expect(personWhere({})).toBeNull());
  it('homecell mengalahkan area; role digabung', () => {
    const w = personWhere({ homecellId: 'h', homecellAreaId: 'a', roleId: 'r', subRoleStatusId: 's' });
    expect(w).toEqual({
      AND: [
        { homecellMembership: { some: { isActive: true, homecellId: 'h' } } },
        { jemaatRoles: { some: { isActive: true, roleId: 'r', subRoleStatusId: 's' } } },
      ],
    });
  });
});

describe('buildVisitWhere', () => {
  it('sisi pengunjung saja', () => {
    expect(buildVisitWhere({ cabangId: 'c', side: 'initiator' })).toEqual({ AND: [{ initiator: { cabangId: 'c' } }] });
  });
  it('sisi mana saja + catatan + periode', () => {
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-11-01T00:00:00Z');
    expect(buildVisitWhere({ nama: ' budi ', catatan: 'belum', from, toExclusive: to })).toEqual({
      AND: [
        {
          OR: [
            { initiator: { namaLengkap: { contains: 'budi', mode: 'insensitive' } } },
            { target: { namaLengkap: { contains: 'budi', mode: 'insensitive' } } },
          ],
        },
        { noteDariInitiator: null, noteDariTarget: null },
        { tanggalVisit: { gte: from, lt: to } },
      ],
    });
  });
  it('tanpa filter', () => expect(buildVisitWhere({})).toEqual({}));
});

describe('summarizeVisits', () => {
  const p = (id: string) => ({ id, namaLengkap: id.toUpperCase(), cabang: { nama: 'JKT' } });
  it('hitung', () => {
    const s = summarizeVisits([
      { initiatorJemaatId: 'a', targetJemaatId: 'b', noteDariInitiator: 'x', noteDariTarget: null, initiator: p('a'), target: p('b') },
      { initiatorJemaatId: 'a', targetJemaatId: 'c', noteDariInitiator: null, noteDariTarget: null, initiator: p('a'), target: p('c') },
      { initiatorJemaatId: 'b', targetJemaatId: 'a', noteDariInitiator: null, noteDariTarget: 'y', initiator: p('b'), target: p('a') },
    ]);
    expect(s.total).toBe(3);
    expect(s.pengunjungUnik).toBe(2);
    expect(s.dikunjungiUnik).toBe(3);
    expect(s.denganCatatan).toBe(2);
    expect(s.top[0]).toEqual({ id: 'a', namaLengkap: 'A', cabang: 'JKT', sebagaiPengunjung: 2, sebagaiDikunjungi: 1, total: 3 });
  });
});
