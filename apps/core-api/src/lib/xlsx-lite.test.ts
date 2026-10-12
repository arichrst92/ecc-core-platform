import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readXlsx, excelSerialToDate } from './xlsx-lite.js';

// Fixture dibuat dgn openpyxl: sheet "Data" (header + 2 baris) + sheet "Lain".
const FIXTURE = fileURLToPath(new URL('./__fixtures__/sample.xlsx', import.meta.url));

describe('readXlsx', () => {
  const wb = readXlsx(readFileSync(FIXTURE));

  it('membaca daftar sheet sesuai urutan', () => {
    expect(wb.sheetNames).toEqual(['Data', 'Lain']);
  });

  it('membaca header + baris, termasuk karakter XML yang di-escape', () => {
    const rows = wb.readSheet('Data');
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual(['Kode', 'Nama Lengkap', 'No HP', 'Email', 'Tanggal Bergabung']);
    expect(rows[1]![1]).toBe('Budi & "Ani" <x>');
    expect(rows[1]![2]).toBe('0812345');
  });

  it('sel kosong jadi null dan angka tetap number', () => {
    const rows = wb.readSheet('Data');
    expect(rows[2]![0]).toBe(null);
    expect(rows[2]![2]).toBe(6281234567890);
    expect(rows[2]![3]).toBe(null);
  });

  it('tanggal = serial Excel → excelSerialToDate', () => {
    const serial = wb.readSheet('Data')[1]![4] as number;
    expect(typeof serial).toBe('number');
    expect(excelSerialToDate(serial).toISOString().slice(0, 10)).toBe('2022-07-24');
  });

  it('sheet tidak ada → error jelas', () => {
    let msg = '';
    try {
      wb.readSheet('Tidak Ada');
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe('Sheet "Tidak Ada" tidak ditemukan.');
  });

  it('bukan zip → error', () => {
    let msg = '';
    try {
      readXlsx(Buffer.from('bukan excel sama sekali, cuma teks biasa yang cukup panjang'));
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe('Bukan file .xlsx yang valid (ZIP tidak dikenali).');
  });
});
