/**
 * Data Anak (CKids) — anak di bawah 13 tahun.
 *
 *   GET /admin/data-anak?cabangId=&search=&dari=YYYY-MM-DD&sampai=YYYY-MM-DD&page=&limit=
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

export const dataAnakRouter = Router();
dataAnakRouter.use(requireMenu('data-anak'));

const UUID = /^[0-9a-f-]{36}$/i;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_UMUR = 13;

/** Relasi "X adalah <tipe> dari anak" (dicatat dari sisi anak). */
const ORTU_DARI_ANAK = ['Ayah', 'Ibu', 'Wali', 'Kakek', 'Nenek'];
/** Relasi "anak adalah <tipe> dari X" (dicatat dari sisi orang tua). */
const ANAK_DARI_ORTU: Record<string, string> = { 'Anak Laki-Laki': 'Orang tua', 'Anak Perempuan': 'Orang tua' };

dataAnakRouter.get('/', async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  const search = (q.search ?? '').trim();

  const today = todayInTz(DEFAULT_TZ);
  // Lahir setelah (hari ini − 13 tahun) → usia < 13.
  const batas = new Date(today);
  batas.setUTCFullYear(batas.getUTCFullYear() - MAX_UMUR);

  const sampai = q.sampai && YMD.test(q.sampai) ? new Date(`${q.sampai}T00:00:00.000Z`) : today;
  const dari = q.dari && YMD.test(q.dari) ? new Date(`${q.dari}T00:00:00.000Z`) : addDays(sampai, -89);
  if (dari > sampai) throw BadRequest('Tanggal "dari" harus sebelum "sampai".');

  const where: Prisma.JemaatWhereInput = {
    isActive: true,
    tanggalLahir: { gt: batas, lte: today },
  };
  if (q.cabangId && UUID.test(q.cabangId)) where.cabangId = q.cabangId;
  if (search) {
    where.OR = [
      { namaLengkap: { contains: search, mode: 'insensitive' } },
      { kode: { startsWith: search.toUpperCase() } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.jemaat.findMany({
      where,
      orderBy: { namaLengkap: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
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
            tanggalIbadah: { gte: dari, lte: sampai },
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
    let u = today.getUTCFullYear() - lahir.getUTCFullYear();
    const m = today.getUTCMonth() - lahir.getUTCMonth();
    if (m < 0 || (m === 0 && today.getUTCDate() < lahir.getUTCDate())) u--;
    return u;
  };

  res.json({
    success: true,
    data: rows.map((r) => ({
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
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      dari: dari.toISOString().slice(0, 10),
      sampai: sampai.toISOString().slice(0, 10),
    },
  });
});
