/**
 * Data Anak (CKids) — anak di bawah 13 tahun.
 *
 *   GET /admin/data-anak?cabangId=&search=&dari=YYYY-MM-DD&sampai=YYYY-MM-DD&page=&limit=
 *   GET /admin/data-anak/export?…filter sama   → laporan siap cetak / Save as PDF (semua hasil filter)
 *   GET /admin/data-anak/qr?…filter sama       → lembar QR A4 (3×3 cm + nama, garis potong)
 *
 * Sengaja hanya data yang dibutuhkan pelayanan anak: kode (QR), foto, usia,
 * tanggal ulang tahun, orang tua/wali, dan jumlah hadir di ibadah anak dalam
 * periode. Tanpa no HP / alamat.
 */
import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest } from '../../lib/errors.js';
import { DEFAULT_TZ, addDays, todayInTz } from '../../lib/tz.js';
import { renderDataAnakPdfHtml, renderDataAnakQrHtml } from '../../lib/data-anak-html.js';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';

export const dataAnakRouter = Router();
dataAnakRouter.use(requireMenu('data-anak'));

const UUID = /^[0-9a-f-]{36}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_UMUR = 13;

/** Relasi "X adalah <tipe> dari anak" (dicatat dari sisi anak). */
const ORTU_DARI_ANAK = ['Ayah', 'Ibu', 'Wali', 'Kakek', 'Nenek'];
/** Relasi "anak adalah <tipe> dari X" (dicatat dari sisi orang tua). */
const ANAK_DARI_ORTU: Record<string, string> = { 'Anak Laki-Laki': 'Orang tua', 'Anak Perempuan': 'Orang tua' };

const EXPORT_MAX = 3000;

interface Filter {
  cabangId?: string;
  search: string;
  dari: Date;
  sampai: Date;
  today: Date;
}

function filterOf(req: { query: unknown }): Filter {
  const q = req.query as Record<string, string | undefined>;
  const today = todayInTz(DEFAULT_TZ);
  const sampai = q.sampai && YMD.test(q.sampai) ? new Date(`${q.sampai}T00:00:00.000Z`) : today;
  const dari = q.dari && YMD.test(q.dari) ? new Date(`${q.dari}T00:00:00.000Z`) : addDays(sampai, -89);
  if (dari > sampai) throw BadRequest('Tanggal "dari" harus sebelum "sampai".');
  return {
    cabangId: q.cabangId && UUID.test(q.cabangId) ? q.cabangId : undefined,
    search: (q.search ?? '').trim(),
    dari,
    sampai,
    today,
  };
}

function whereOf(f: Filter): Prisma.JemaatWhereInput {
  // Lahir setelah (hari ini − 13 tahun) → usia < 13.
  const batas = new Date(f.today);
  batas.setUTCFullYear(batas.getUTCFullYear() - MAX_UMUR);
  const where: Prisma.JemaatWhereInput = { isActive: true, tanggalLahir: { gt: batas, lte: f.today } };
  if (f.cabangId) where.cabangId = f.cabangId;
  if (f.search) {
    where.OR = [
      { namaLengkap: { contains: f.search, mode: 'insensitive' } },
      { kode: { startsWith: f.search.toUpperCase() } },
    ];
  }
  return where;
}

export interface AnakRow {
  id: string;
  namaLengkap: string;
  kode: string | null;
  fotoUrl: string | null;
  jenisKelamin: string | null;
  isTamu: boolean;
  cabang: { id: string; nama: string } | null;
  tanggalLahir: string | null;
  usia: number | null;
  orangTua: { id: string; nama: string; hubungan: string }[];
  jumlahHadir: number;
}

/**
 * Anak tanpa kode jemaat (mis. didaftarkan sebagai tamu / data lama) tidak
 * punya QR. Beri kode otomatis supaya semua anak bisa dicetak & discan.
 */
async function ensureKode(where: Prisma.JemaatWhereInput): Promise<number> {
  const tanpa = await prisma.jemaat.findMany({ where: { AND: [where, { kode: null }] }, select: { id: true }, take: EXPORT_MAX });
  let n = 0;
  for (const j of tanpa) {
    const kode = await generateUniqueKode(async (k) => !!(await prisma.jemaat.findUnique({ where: { kode: k } })));
    const r = await prisma.jemaat.updateMany({ where: { id: j.id, kode: null }, data: { kode } });
    n += r.count;
  }
  return n;
}

async function loadAnak(f: Filter, skip: number, take: number): Promise<{ rows: AnakRow[]; total: number }> {
  const where = whereOf(f);
  await ensureKode(where);
  const [rows, total] = await Promise.all([
    prisma.jemaat.findMany({
      where,
      orderBy: { namaLengkap: 'asc' },
      skip,
      take,
      select: {
        id: true,
        namaLengkap: true,
        kode: true,
        fotoUrl: true,
        tanggalLahir: true,
        jenisKelamin: true,
        isTamu: true,
        cabang: { select: { id: true, nama: true } },
        primaryGuardian: { select: { id: true, namaLengkap: true } },
      },
    }),
    prisma.jemaat.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);

  const [dariAnak, dariOrtu, hadir] = ids.length
    ? await Promise.all([
        prisma.jemaatRelasi.findMany({
          where: { jemaatId: { in: ids }, tipeRelasi: { nama: { in: ORTU_DARI_ANAK } } },
          select: { jemaatId: true, tipeRelasi: { select: { nama: true } }, jemaatTerkait: { select: { id: true, namaLengkap: true } } },
        }),
        prisma.jemaatRelasi.findMany({
          where: { jemaatTerkaitId: { in: ids }, tipeRelasi: { nama: { in: Object.keys(ANAK_DARI_ORTU) } } },
          select: { jemaatTerkaitId: true, jemaat: { select: { id: true, namaLengkap: true, jenisKelamin: true } } },
        }),
        prisma.reservasi.groupBy({
          by: ['jemaatId'],
          where: {
            jemaatId: { in: ids },
            status: 'JOIN',
            tanggalIbadah: { gte: f.dari, lte: f.sampai },
            ibadah: { isKidsIbadah: true },
          },
          _count: { _all: true },
        }),
      ])
    : [[], [], []];

  const ortu = new Map<string, Map<string, { id: string; nama: string; hubungan: string }>>();
  const add = (anakId: string, p: { id: string; namaLengkap: string }, hubungan: string) => {
    let m = ortu.get(anakId);
    if (!m) ortu.set(anakId, (m = new Map()));
    if (!m.has(p.id)) m.set(p.id, { id: p.id, nama: p.namaLengkap, hubungan });
  };
  for (const r of dariAnak) add(r.jemaatId, r.jemaatTerkait, r.tipeRelasi.nama);
  for (const r of dariOrtu) add(r.jemaatTerkaitId, r.jemaat, r.jemaat.jenisKelamin === 'L' ? 'Ayah' : r.jemaat.jenisKelamin === 'P' ? 'Ibu' : 'Orang tua');
  for (const r of rows) if (r.primaryGuardian) add(r.id, r.primaryGuardian, 'Wali');
  const hadirMap = new Map(hadir.map((h) => [h.jemaatId, h._count._all]));

  const usia = (lahir: Date) => {
    let u = f.today.getUTCFullYear() - lahir.getUTCFullYear();
    const m = f.today.getUTCMonth() - lahir.getUTCMonth();
    if (m < 0 || (m === 0 && f.today.getUTCDate() < lahir.getUTCDate())) u--;
    return u;
  };

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      namaLengkap: r.namaLengkap,
      kode: r.kode,
      fotoUrl: r.fotoUrl,
      jenisKelamin: r.jenisKelamin,
      isTamu: r.isTamu,
      cabang: r.cabang,
      tanggalLahir: r.tanggalLahir ? r.tanggalLahir.toISOString().slice(0, 10) : null,
      usia: r.tanggalLahir ? usia(r.tanggalLahir) : null,
      orangTua: [...(ortu.get(r.id)?.values() ?? [])],
      jumlahHadir: hadirMap.get(r.id) ?? 0,
    })),
  };
}

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

dataAnakRouter.get('/', async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  const f = filterOf(req);
  const { rows, total } = await loadAnak(f, (page - 1) * limit, limit);
  res.json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), dari: ymdOf(f.dari), sampai: ymdOf(f.sampai) },
  });
});

/** Label filter untuk kepala laporan. */
async function filterLabel(f: Filter) {
  const cabang = f.cabangId
    ? (await prisma.cabangGereja.findUnique({ where: { id: f.cabangId }, select: { nama: true } }))?.nama ?? '—'
    : 'Semua cabang';
  return { cabang, search: f.search, dari: ymdOf(f.dari), sampai: ymdOf(f.sampai) };
}

const isMobile = (req: { get: (h: string) => string | undefined }) =>
  /mobi|android|iphone|ipad|ipod/.test((req.get('user-agent') ?? '').toLowerCase());

dataAnakRouter.get('/export', async (req, res) => {
  const f = filterOf(req);
  const { rows, total } = await loadAnak(f, 0, EXPORT_MAX);
  const apiBase = (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderDataAnakPdfHtml({ rows, total, max: EXPORT_MAX, filter: await filterLabel(f), apiBase, isMobileUa: isMobile(req) }),
  );
});

dataAnakRouter.get('/qr', async (req, res) => {
  const f = filterOf(req);
  const { rows, total } = await loadAnak(f, 0, EXPORT_MAX);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    renderDataAnakQrHtml({
      rows: rows.filter((r) => r.kode),
      tanpaKode: rows.filter((r) => !r.kode).length,
      total,
      max: EXPORT_MAX,
      filter: await filterLabel(f),
      isMobileUa: isMobile(req),
    }),
  );
});
