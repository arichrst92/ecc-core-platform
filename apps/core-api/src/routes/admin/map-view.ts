/**
 * Map View (Portal) — titik cabang gereja & homecell di peta.
 *
 *   GET /admin/map-view?cabangId=  → { cabang[], area[], homecell[], tanpaTitik: { cabang, homecell } }
 *
 * Poligon Homecell Area dibentuk di Portal dari titik homecell di area tsb.
 *
 * Akses: menu "map-view" (Role Access). Alamat & PIC homecell hanya untuk
 * pengguna Portal yang punya akses menu ini.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { GEOCODE_VERSION, geocodeEnabled, geocodeJemaatBatch, geocodePerBatch, geocodeProvider, geocodeState } from '../../lib/jemaat-geocode.js';
import { audit } from '../../lib/audit.js';
import { logger } from '../../lib/logger.js';

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

  const areaWhere: Prisma.HomecellAreaWhereInput = {
    ...(q.cabangId ? { cabangId: q.cabangId } : {}),
    ...(aktifSaja ? { isActive: true, cabang: { isActive: true } } : {}),
  };

  const [cabangRows, homecellRows, areaRows] = await Promise.all([
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
    prisma.homecellArea.findMany({
      where: areaWhere,
      orderBy: { nama: 'asc' },
      select: {
        id: true,
        nama: true,
        deskripsi: true,
        isActive: true,
        cabang: { select: { id: true, nama: true } },
        picJemaat: { select: { namaLengkap: true, noHp: true } },
      },
    }),
  ]);

  const homecellPerCabang = new Map<string, number>();
  for (const h of homecellRows) homecellPerCabang.set(h.area.cabang.id, (homecellPerCabang.get(h.area.cabang.id) ?? 0) + 1);

  const hasPoint = (r: { latitude: number | null; longitude: number | null }) => r.latitude != null && r.longitude != null;

  // Ringkasan per area dari homecell yang ikut dimuat (aktif sesuai saringan).
  const areaStat = new Map<string, { homecellCount: number; memberCount: number; denganTitik: number }>();
  for (const h of homecellRows) {
    const st = areaStat.get(h.area.id) ?? { homecellCount: 0, memberCount: 0, denganTitik: 0 };
    st.homecellCount++;
    st.memberCount += h._count.members;
    if (h.latitude != null && h.longitude != null) st.denganTitik++;
    areaStat.set(h.area.id, st);
  }
  const area = areaRows.map((a) => ({ ...a, ...(areaStat.get(a.id) ?? { homecellCount: 0, memberCount: 0, denganTitik: 0 }) }));

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
      area,
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

/**
 * Sebaran jemaat — perkiraan titik rumah (dari alamat) digabung per sel ±100 m
 * (koordinat dibulatkan 3 desimal) TANPA nama/ID. Untuk lapisan peta kepadatan.
 *   GET /admin/map-view/sebaran-jemaat?cabangId=
 *   → { cells: [lat, lng, jumlah][], status: { total, ok, tidakDitemukan, terlaluJauh, menunggu } }
 */
mapViewRouter.get('/sebaran-jemaat', async (req, res) => {
  const { cabangId } = z.object({ cabangId: z.string().uuid().optional() }).parse(req.query);
  const jemaatWhere: Prisma.JemaatWhereInput = {
    isActive: true,
    isTamu: false,
    ...(cabangId ? { cabangId } : {}),
  };
  const [rows, total, byStatus] = await Promise.all([
    prisma.jemaatGeocode.findMany({
      where: { status: 'OK', jemaat: jemaatWhere },
      select: { latitude: true, longitude: true, jemaat: { select: { cabang: { select: { latitude: true, longitude: true } } } } },
    }),
    prisma.jemaat.count({ where: { ...jemaatWhere, AND: [{ alamat: { not: null } }, { alamat: { not: '' } }] } }),
    prisma.jemaatGeocode.groupBy({ by: ['status'], where: { jemaat: jemaatWhere }, _count: { _all: true } }),
  ]);
  const cells = new Map<string, [number, number, number]>();
  for (const r of rows) {
    if (r.latitude == null || r.longitude == null) continue;
    const lat = Math.round(r.latitude * 1000) / 1000;
    const lng = Math.round(r.longitude * 1000) / 1000;
    const k = `${lat},${lng}`;
    const c = cells.get(k);
    if (c) c[2]++;
    else cells.set(k, [lat, lng, 1]);
  }
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const diproses = byStatus.reduce((n, b) => n + b._count._all, 0);
  res.json({
    success: true,
    data: {
      cells: [...cells.values()],
      status: {
        total,
        ok: count('OK'),
        tidakDitemukan: count('NOT_FOUND'),
        terlaluJauh: count('TOO_FAR'),
        menunggu: Math.max(0, total - diproses),
      },
    },
  });
});

/**
 * Pin jemaat (internal ECC) — perkiraan titik rumah dari alamat + foto profil.
 * Butuh akses menu Map View DAN menu Jemaat (baca).
 *   GET /admin/map-view/jemaat?cabangId=
 */
mapViewRouter.get('/jemaat', requireMenu('jemaat'), async (req, res) => {
  const { cabangId } = z.object({ cabangId: z.string().uuid().optional() }).parse(req.query);
  const rows = await prisma.jemaatGeocode.findMany({
    where: {
      status: 'OK',
      latitude: { not: null },
      longitude: { not: null },
      jemaat: { isActive: true, isTamu: false, ...(cabangId ? { cabangId } : {}) },
    },
    select: {
      latitude: true,
      longitude: true,
      placeId: true,
      jemaat: {
        select: {
          id: true,
          namaLengkap: true,
          kode: true,
          fotoUrl: true,
          jenisKelamin: true,
          noHp: true,
          alamat: true,
          cabang: { select: { id: true, nama: true, latitude: true, longitude: true } },
          homecellMembership: {
            where: { isActive: true, homecell: { isActive: true } },
            select: { homecell: { select: { id: true, nama: true } } },
            take: 3,
          },
        },
      },
    },
  });
  res.json({
    success: true,
    data: rows
      .map(({ latitude, longitude, placeId, jemaat: { homecellMembership, cabang: { latitude: _cl, longitude: _cg, ...cabang }, ...j } }) => ({
        ...j,
        cabang,
        latitude: latitude!,
        longitude: longitude!,
        placeId,
        homecell: homecellMembership.map((m) => m.homecell),
      })),
  });
});

/** Hitungan status pemetaan alamat jemaat (semua / per cabang). */
async function geocodeCounts(cabangId?: string) {
  const jemaatWhere: Prisma.JemaatWhereInput = { isActive: true, isTamu: false, ...(cabangId ? { cabangId } : {}) };
  // Rincian seluruh data jemaat → jelas kenapa yang dipetakan lebih sedikit
  // dari total terdaftar (tamu, nonaktif, tanpa alamat tidak ikut dipetakan).
  const cab = cabangId ?? null;
  const [rincian] = await prisma.$queryRaw<
    { semua: bigint; tamu: bigint; nonaktif: bigint; tanpa_alamat: bigint; beralamat: bigint }[]
  >`
    SELECT
      COUNT(*)                                                                      AS semua,
      COUNT(*) FILTER (WHERE is_tamu)                                               AS tamu,
      COUNT(*) FILTER (WHERE NOT is_tamu AND NOT is_active)                         AS nonaktif,
      COUNT(*) FILTER (WHERE NOT is_tamu AND is_active AND COALESCE(TRIM(alamat), '') = '')  AS tanpa_alamat,
      COUNT(*) FILTER (WHERE NOT is_tamu AND is_active AND COALESCE(TRIM(alamat), '') <> '') AS beralamat
    FROM jemaat
    WHERE (${cab}::uuid IS NULL OR cabang_id = ${cab}::uuid)
  `;
  // Hanya hasil versi pemetaan sekarang yang dihitung; hasil versi lama (mis. OpenStreetMap
  // sebelum pindah ke Google) dihitung "menunggu" karena akan diproses ulang.
  const byStatus = await prisma.jemaatGeocode.groupBy({
    by: ['status'],
    where: { jemaat: jemaatWhere, provider: { startsWith: GEOCODE_VERSION } },
    _count: { _all: true },
  });
  const n = (v: bigint | undefined) => Number(v ?? 0);
  const total = n(rincian?.beralamat);
  const count = (st: string) => byStatus.find((b) => b.status === st)?._count._all ?? 0;
  const diproses = byStatus.reduce((acc, b) => acc + b._count._all, 0);
  return {
    total,
    ok: count('OK'),
    tidakDitemukan: count('NOT_FOUND'),
    terlaluJauh: count('TOO_FAR'),
    // Cabang jemaat belum punya link Google Maps → belum bisa dipetakan.
    menungguCabang: count('NO_CABANG'),
    menunggu: Math.max(0, total - diproses),
    rincian: {
      semua: n(rincian?.semua),
      tamu: n(rincian?.tamu),
      nonaktif: n(rincian?.nonaktif),
      tanpaAlamat: n(rincian?.tanpa_alamat),
      beralamat: total,
    },
  };
}

/**
 * Progres pemetaan alamat jemaat → progress bar di Map View.
 *   GET /admin/map-view/geocode-status?cabangId=
 */
mapViewRouter.get('/geocode-status', async (req, res) => {
  const { cabangId } = z.object({ cabangId: z.string().uuid().optional() }).parse(req.query);
  res.json({
    success: true,
    data: {
      ...(await geocodeCounts(cabangId)),
      aktif: geocodeEnabled(),
      proses: { ...geocodeState },
      // Batch otomatis tiap 15 menit, maks 250 alamat (1 alamat/detik).
      intervalMenit: 15,
      perBatch: geocodePerBatch,
      provider: geocodeProvider,
    },
  });
});

/**
 * Jalankan satu batch sekarang (tanpa menunggu jadwal 15 menit).
 *   POST /admin/map-view/geocode-run   — butuh akses ubah menu Jemaat
 */
mapViewRouter.post('/geocode-run', requireMenu('jemaat', 'write'), async (req, res) => {
  if (!geocodeEnabled()) {
    res.status(409).json({ success: false, error: { code: 'GEOCODE_DISABLED', message: 'Pemetaan alamat dimatikan di server (GEOCODE_JEMAAT_ENABLED=0).' } });
    return;
  }
  if (geocodeState.running) {
    res.json({ success: true, data: { started: false, alreadyRunning: true } });
    return;
  }
  void geocodeJemaatBatch().catch((err) => logger.warn({ err }, 'geocode-run manual gagal'));
  audit(req, { action: 'UPDATE', resource: 'jemaat_geocode', resourceLabel: 'Jalankan pemetaan alamat jemaat (manual)', metadata: { kind: 'geocode-run' } });
  res.status(202).json({ success: true, data: { started: true } });
});

/**
 * Konfigurasi peta untuk Portal: kunci Google Maps JavaScript (kunci BROWSER,
 * dibatasi HTTP referrer domain Portal) + Map ID. Disimpan di .env server
 * supaya bisa diganti tanpa build ulang Portal.
 *   GET /admin/map-view/config
 */
mapViewRouter.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      googleMapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() || null,
      mapId: process.env.GOOGLE_MAPS_MAP_ID?.trim() || null,
    },
  });
});
