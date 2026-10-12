/**
 * Pembaca .xlsx minimal tanpa dependency (cukup node:zlib).
 *
 * File .xlsx = arsip ZIP berisi XML. Yang dibaca:
 *   - xl/workbook.xml + xl/_rels/workbook.xml.rels → daftar sheet + file-nya
 *   - xl/sharedStrings.xml                         → tabel string
 *   - xl/worksheets/sheetN.xml                     → sel per baris
 *
 * Nilai sel dikembalikan apa adanya: string, number (termasuk tanggal yg
 * tersimpan sebagai serial Excel — konversi pakai excelSerialToDate), boolean,
 * atau null. Formula → nilai hasil terakhir (<v>). Cukup untuk import data
 * tabular; bukan pengganti library spreadsheet lengkap.
 */
import { inflateRawSync } from 'node:zlib';

export type CellValue = string | number | boolean | null;

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
}

function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  // End of central directory: signature 0x06054b50, cari dari belakang.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Bukan file .xlsx yang valid (ZIP tidak dikenali).');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Central directory ZIP rusak.');
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipFile(buf: Buffer, e: ZipEntry): string {
  const lo = e.localOffset;
  if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error(`Local header ZIP rusak: ${e.name}`);
  const start = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28);
  const data = buf.subarray(start, start + e.compSize);
  if (e.method === 0) return data.toString('utf8');
  if (e.method === 8) return inflateRawSync(data).toString('utf8');
  throw new Error(`Metode kompresi ZIP tidak didukung (${e.method}) untuk ${e.name}`);
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Gabungkan semua <t>…</t> dalam satu potongan XML (rich text = beberapa <r><t>). */
function joinT(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function resolvePath(target: string): string {
  const t = target.replace(/^\//, '');
  return t.startsWith('xl/') ? t : `xl/${t}`;
}

export interface XlsxWorkbook {
  sheetNames: string[];
  /** Baris mentah sheet (array per baris, index kolom 0-based). Baris kosong di-skip. */
  readSheet: (name: string) => CellValue[][];
}

export function readXlsx(buf: Buffer): XlsxWorkbook {
  const entries = readZipEntries(buf);
  const get = (name: string) => {
    const e = entries.get(name);
    return e ? readZipFile(buf, e) : null;
  };

  const workbook = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new Error('Struktur .xlsx tidak lengkap (workbook.xml).');

  const relTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) relTarget.set(id, resolvePath(target));
  }

  const sheets: { name: string; path: string }[] = [];
  for (const m of workbook.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? '';
    const name = /\bname="([^"]+)"/.exec(attrs)?.[1];
    const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    if (name && rid && relTarget.has(rid)) sheets.push({ name: decodeXml(name), path: relTarget.get(rid)! });
  }

  const sst: string[] = [];
  const sstXml = get('xl/sharedStrings.xml');
  if (sstXml) for (const m of sstXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) sst.push(joinT(m[1] ?? ''));

  return {
    sheetNames: sheets.map((s) => s.name),
    readSheet(name: string) {
      const sh = sheets.find((s) => s.name === name);
      if (!sh) throw new Error(`Sheet "${name}" tidak ditemukan.`);
      const xml = get(sh.path);
      if (!xml) throw new Error(`File sheet "${name}" tidak ditemukan di arsip.`);

      const rows: CellValue[][] = [];
      for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const row: CellValue[] = [];
        for (const cm of (rm[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const attrs = cm[1] ?? '';
          const inner = cm[2] ?? '';
          const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
          const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
          const idx = ref ? colIndex(ref) : row.length;
          const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
          let val: CellValue = null;
          if (type === 's') val = v != null ? (sst[Number(v)] ?? null) : null;
          else if (type === 'inlineStr') val = joinT(inner);
          else if (type === 'str') val = v != null ? decodeXml(v) : null;
          else if (type === 'b') val = v === '1';
          else if (v != null && v !== '') val = Number(v);
          row[idx] = val;
        }
        for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
        if (row.some((x) => x !== null && x !== '')) rows.push(row);
      }
      // Sel kosong di ujung baris tidak ditulis di XML → samakan panjang baris.
      const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
      for (const r of rows) while (r.length < width) r.push(null);
      return rows;
    },
  };
}

/** Serial tanggal Excel (sistem 1900) → Date UTC. */
export function excelSerialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}
