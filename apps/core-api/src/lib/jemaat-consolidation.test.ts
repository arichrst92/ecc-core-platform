import { describe, it, expect } from 'vitest';
import {
  buildIndex,
  diffField,
  majority,
  matchRow,
  normalizeName,
  normalizePhone,
  parseSheetRows,
  suggestPelayanan,
  type JemaatLite,
  type SheetRow,
} from './jemaat-consolidation.js';

const J = (o: Partial<JemaatLite> & { id: string; namaLengkap: string }): JemaatLite => ({
  kode: null,
  email: null,
  noHp: null,
  alamat: null,
  statusPernikahan: null,
  tanggalBergabungGereja: null,
  cabangId: 'jkt',
  cabangNama: 'ECC Jakarta',
  ...o,
});

const row = (o: Partial<SheetRow>): SheetRow => ({
  rowNo: 2,
  kode: null,
  nama: 'X',
  noHp: null,
  email: null,
  alamat: null,
  cabang: 'ECC Jakarta',
  area: null,
  zoneLeader: null,
  homecell: null,
  homeLeader: null,
  ministry: null,
  statusPernikahan: null,
  tanggalBergabungGereja: null,
  username: null,
  ...o,
});

describe('normalisasi', () => {
  it('no HP → +62', () => {
    expect(normalizePhone('0818439626')).toBe('+62818439626');
    expect(normalizePhone(6282127081588)).toBe('+6282127081588');
    expect(normalizePhone('+62 812-345-6789')).toBe('+628123456789');
    expect(normalizePhone('812345678')).toBe('+62812345678');
    expect(normalizePhone('123')).toBe(null);
    expect(normalizePhone(null)).toBe(null);
  });

  it('nama: gelar Ps. dibuang, (Vacant) = null', () => {
    expect(normalizeName('Ps. Yudih  Saamena')).toBe('yudih saamena');
    expect(normalizeName('(Vacant)')).toBe(null);
  });
});

describe('parseSheetRows', () => {
  const rows = [
    ['Kode', 'Nama Lengkap', 'No HP', 'Email', 'Homecell Area', 'Zone Leader', 'Homecell', 'Status', 'Tanggal Bergabung'],
    ['abc12345', ' Budi ', '0812345678', 'BUDI@X.COM', 'profam', '(Vacant)', 'south 1', 'Sudah Menikah', 44766],
    [null, 'Ani', null, 'ani@x.com', null, null, null, 'Aktif', null],
    [null, null, null, null, null, null, null, null, null],
  ];
  const { rows: out, missingColumns } = parseSheetRows(rows);

  it('baris tanpa nama di-skip, rowNo = nomor baris Excel', () => {
    expect(out.length).toBe(2);
    expect(out[0]!.rowNo).toBe(2);
    expect(missingColumns).toEqual([]);
  });

  it('normalisasi nilai', () => {
    expect(out[0]).toMatchObject({
      kode: 'ABC12345',
      nama: 'Budi',
      noHp: '+62812345678',
      email: 'budi@x.com',
      area: 'PROFAM',
      zoneLeader: null,
      homecell: 'SOUTH 1',
      statusPernikahan: 'Sudah Menikah',
      tanggalBergabungGereja: '2022-07-24',
    });
  });

  it('Status Aktif/Nonaktif (export portal) tidak dianggap status nikah', () => {
    expect(out[1]!.statusPernikahan).toBe(null);
  });

  it('kolom wajib hilang dilaporkan', () => {
    expect(parseSheetRows([['Foo']]).missingColumns).toEqual(['Nama Lengkap', 'Email / No HP']);
  });
});

describe('matchRow', () => {
  const ix = buildIndex([
    J({ id: 'a', namaLengkap: 'Budi', email: 'budi@x.com', noHp: '+62812345678', kode: 'ABC12345' }),
    J({ id: 'b', namaLengkap: 'Citra', email: 'citra@x.com', noHp: '+62899999999' }),
    J({ id: 'c', namaLengkap: 'Dewi', cabangId: 'bdg' }),
    J({ id: 'd', namaLengkap: 'Dewi' }),
  ]);

  it('MATCHED kalau semua kunci menunjuk orang yang sama', () => {
    const r = matchRow(row({ email: 'budi@x.com', noHp: '+62812345678', kode: 'ABC12345' }), ix);
    expect(r.status).toBe('MATCHED');
    expect(r.jemaatId).toBe('a');
    expect(r.candidates[0]!.via.sort()).toEqual(['email', 'hp', 'kode']);
  });

  it('CONFLICT kalau email & HP menunjuk orang berbeda', () => {
    const r = matchRow(row({ email: 'budi@x.com', noHp: '+62899999999' }), ix);
    expect(r.status).toBe('CONFLICT');
    expect(r.candidates.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('NAME_ONLY: kandidat cabang yang sama diurutkan duluan', () => {
    const r = matchRow(row({ nama: 'dewi', email: 'baru@x.com' }), ix, 'jkt');
    expect(r.status).toBe('NAME_ONLY');
    expect(r.candidates[0]!.id).toBe('d');
  });

  it('NOT_FOUND', () => {
    expect(matchRow(row({ nama: 'Orang Baru', email: 'z@x.com' }), ix).status).toBe('NOT_FOUND');
  });
});

describe('diffField', () => {
  it('none / fill / same / differ', () => {
    expect(diffField('alamat', null, 'Jl. A')).toBe('none');
    expect(diffField('alamat', 'Jl. A', null)).toBe('fill');
    expect(diffField('alamat', 'jl.  a', 'Jl. A')).toBe('same');
    expect(diffField('alamat', 'Jl. B', 'Jl. A')).toBe('differ');
    expect(diffField('noHp', '0812345678', '+62812345678')).toBe('same');
    expect(diffField('tanggalBergabungGereja', '2022-07-24', '2022-07-24T00:00:00.000Z')).toBe('same');
  });
});

describe('struktur', () => {
  it('majority mengabaikan null', () => {
    expect(majority(['A', null, 'B', 'A'])).toBe('A');
    expect(majority([null])).toBe(null);
  });

  it('suggestPelayanan pakai sinonim lalu nama persis', () => {
    const p = [
      { id: 'w', nama: 'Worship' },
      { id: 'c', nama: 'Children Ministry' },
    ];
    expect(suggestPelayanan('WORSHIP', p)).toBe('w');
    expect(suggestPelayanan('CKIDS MINSITER', p)).toBe('c');
    expect(suggestPelayanan('CMP', p)).toBe(null);
  });
});
