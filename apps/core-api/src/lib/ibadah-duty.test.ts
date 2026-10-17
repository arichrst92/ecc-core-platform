import { describe, expect, it } from 'vitest';
import { resolveIbadahDuties, type DutyLink } from './ibadah-duty.js';

const row = (id: string, jemaatId: string, tgl: string | null, role = 'Usher') => ({
  id,
  jemaatId,
  tanggalIbadah: tgl ? new Date(`${tgl}T00:00:00Z`) : null,
  catatan: null,
  role: { nama: role, level: 0 },
  jemaat: { id: jemaatId, namaLengkap: jemaatId.toUpperCase(), fotoUrl: null },
});

const link = (rows: DutyLink['rows']): DutyLink => ({
  ibadah: {
    id: 'IB',
    nama: 'Ibadah Raya',
    jamMulai: '09:00',
    jamSelesai: '11:00',
    lokasi: 'Hall',
    isActive: true,
    tipeJadwal: 'WEEKLY',
    tanggalMulai: new Date('2026-01-04T00:00:00Z'),
    hari: 'MINGGU',
  },
  pelayanan: { id: 'P', nama: 'Usher' },
  rows,
});

const from = new Date('2026-10-18T00:00:00Z');
const to = new Date('2026-11-01T00:00:00Z');

describe('resolveIbadahDuties', () => {
  it('petugas default tampil di setiap Minggu', () => {
    const d = resolveIbadahDuties([link([row('1', 'me', null), row('2', 'x', null)])], 'me', from, to, new Set());
    expect(d.map((x) => x.tanggal)).toEqual(['2026-10-18', '2026-10-25', '2026-11-01']);
    expect(d[0]!.coServants.map((c) => c.namaLengkap)).toEqual(['X']);
  });
  it('override tanggal menggantikan default', () => {
    const d = resolveIbadahDuties(
      [link([row('1', 'me', null), row('2', 'x', '2026-10-25')])],
      'me',
      from,
      to,
      new Set(),
    );
    expect(d.map((x) => x.tanggal)).toEqual(['2026-10-18', '2026-11-01']);
  });
  it('override khusus saya di tanggal tertentu', () => {
    const d = resolveIbadahDuties([link([row('3', 'me', '2026-10-25', 'Leader')])], 'me', from, to, new Set());
    expect(d).toHaveLength(1);
    expect(d[0]!.posisi).toBe('Leader');
  });
  it('tanggal dibatalkan dilewati', () => {
    const d = resolveIbadahDuties([link([row('1', 'me', null)])], 'me', from, to, new Set(['IB:2026-10-25']));
    expect(d.map((x) => x.tanggal)).toEqual(['2026-10-18', '2026-11-01']);
  });
});
