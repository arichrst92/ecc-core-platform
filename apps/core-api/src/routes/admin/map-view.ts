/**
 * Map View (Portal) — titik cabang gereja & homecell di peta.
 *
 *   GET /admin/map-view?cabangId=  → { cabang[], homecell[], tanpaTitik: { cabang, homecell } }
 *
 * Akses: menu "map-view" (Role Access). Alamat & PIC homecell hanya untuk
 * pengguna Portal yang punya akses menu ini.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';

export const mapViewRouter = Router();
mapViewRouter.use(requireMenu('map-view'));

const querySchema = z.object({
  cabangId: z.string().uuid().optional(),
  aktifSaja: z.enum(['1', '0']).optional(),
});

mapViewRouter.get('/', async (req, res) => {
  const q = querySchema.parse(req.query);
  const aktifSaja = q.aktifSaja !== '0';

  const cabangWhere: Prisma.CabangGerejaWhereInput = {
    ...(q.cabangId ? { id: q.cabangId } : {}),
    ...(aktifSaja ? { isActive: true } : {}),
  };
  const homecellWhere: Prisma.HomecellWhereInput = {
    ...(aktifSaja ? { isActive: true, area: { isActive: true } } : {}),
    ...(q.cabangId ? { area: { cabangId: q.cabangId, ...(aktifSaja ? { isActive: true } : {}) } } : {}),
  };

  const [cabangRows, homecellRows] = await Promise.all([
    prisma.cabangGereja.findMany({
      where: cabangWhere,
      orderBy: { nama: 'asc' },
      select: {
        id: true,
        nama: true,
        kode: true,
        alamat: true,
        kontak: true,
        latitude: true,
        longitude: true,
        mapsUrl: true,
        timezone: true,
        isActive: true,
        _count: {
          select: {
            jemaat: { where: { isActive: true, isTamu: false } },
            ibadah: { where: { isActive: true } },
          },
        },
      },
    }),
    prisma.homecell.findMany({
      where: homecellWhere,
      orderBy: { nama: 'asc' },
      select: {
        id: true,
        nama: true,
        alamat: true,
        hari: true,
        jam: true,
        kategori: true,
        usiaMin: true,
        usiaMax: true,
        latitude: true,
        longitude: true,
        mapsUrl: true,
        isActive: true,
        picJemaat: { select: { namaLengkap: true, noHp: true } },
        area: { select: { id: true, nama: true, cabang: { select: { id: true, nama: true } } } },
        _count: { select: { members: { where: { isActive: true } } } },
      },
    }),
  ]);

  const homecellPerCabang = new Map<string, number>();
  for (const h of homecellRows) homecellPerCabang.set(h.area.cabang.id, (homecellPerCabang.get(h.area.cabang.id) ?? 0) + 1);

  const hasPoint = (r: { latitude: number | null; longitude: number | null }) => r.latitude != null && r.longitude != null;

  const cabang = cabangRows.filter(hasPoint).map(({ _count, ...c }) => ({
    ...c,
    jemaatCount: _count.jemaat,
    ibadahCount: _count.ibadah,
    homecellCount: homecellPerCabang.get(c.id) ?? 0,
  }));
  const homecell = homecellRows.filter(hasPoint).map(({ _count, ...h }) => ({ ...h, memberCount: _count.members }));

  res.json({
    success: true,
    data: {
      cabang,
      homecell,
      // Belum punya titik → tidak tampil di peta (ditampilkan sebagai catatan).
      tanpaTitik: {
        cabang: cabangRows.filter((r) => !hasPoint(r)).map((r) => ({ id: r.id, nama: r.nama })),
        homecell: homecellRows
          .filter((r) => !hasPoint(r))
          .map((r) => ({ id: r.id, nama: r.nama, cabang: r.area.cabang.nama })),
      },
    },
  });
});
