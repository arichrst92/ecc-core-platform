/**
 * Statistik Bible 365 — portal — /admin/bible365  (menu: bible365)
 *
 *   GET /stats?cabangId= → ringkasan peserta & progres per cabang.
 *
 * Catatan renungan jemaat bersifat PRIBADI — tidak pernah dikirim ke portal.
 */
import { Router } from 'express';
import { prisma, Prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { TOTAL_CHAPTERS, dayIndexOf } from '../../lib/bible365.js';

export const bible365AdminRouter = Router();
bible365AdminRouter.use(requireMenu('bible365'));

const UUID_RE = /^[0-9a-f-]{36}$/i;

bible365AdminRouter.get('/stats', async (req, res) => {
  const cabangId = typeof req.query.cabangId === 'string' && UUID_RE.test(req.query.cabangId) ? req.query.cabangId : null;
  const jemaatWhere = cabangId ? { jemaat: { cabangId } } : {};

  const plans = await prisma.bible365Plan.findMany({
    where: jemaatWhere,
    select: {
      id: true,
      status: true,
      startDate: true,
      completedAt: true,
      createdAt: true,
      jemaat: { select: { cabang: { select: { id: true, nama: true } } } },
      _count: { select: { readings: true } },
    },
  });

  // Aktif dalam 7 hari: ada bacaan tercatat seminggu terakhir.
  const since = new Date(Date.now() - 7 * 86_400_000);
  const activeRecent = await prisma.bible365Reading.groupBy({
    by: ['planId'],
    where: { readAt: { gte: since }, plan: jemaatWhere },
  });
  const recentSet = new Set(activeRecent.map((r) => r.planId));

  const buckets = [0, 0, 0, 0, 0]; // 0–24, 25–49, 50–74, 75–99, 100
  const perCabang = new Map<string, { cabangId: string; nama: string; aktif: number; selesai: number; sumPct: number; n: number; onTrack: number }>();
  let aktif = 0;
  let selesai = 0;
  let dihentikan = 0;
  let onTrack = 0;
  let sumPct = 0;

  for (const p of plans) {
    const pct = Math.min(100, (p._count.readings / TOTAL_CHAPTERS) * 100);
    const c = p.jemaat.cabang;
    const key = c?.id ?? '-';
    const row = perCabang.get(key) ?? { cabangId: key, nama: c?.nama ?? '-', aktif: 0, selesai: 0, sumPct: 0, n: 0, onTrack: 0 };
    if (p.status === 'SELESAI') {
      selesai++; row.selesai++;
      buckets[4]!++;
    } else if (p.status === 'AKTIF') {
      aktif++; row.aktif++;
      sumPct += pct; row.sumPct += pct; row.n++;
      buckets[Math.min(3, Math.floor(pct / 25))]!++;
      // Sesuai jadwal: pasal terbaca ≥ 90% target sampai hari ini.
      const target = (dayIndexOf(p.startDate) / 365) * TOTAL_CHAPTERS;
      if (p._count.readings >= target * 0.9) { onTrack++; row.onTrack++; }
    } else {
      dihentikan++;
    }
    perCabang.set(key, row);
  }

  // Peserta baru per bulan (6 bulan terakhir).
  const sixMonths = new Date(Date.now() - 183 * 86_400_000);
  const monthly = await prisma.$queryRaw<{ bulan: string; n: bigint }[]>(Prisma.sql`
    SELECT to_char(p.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM') AS bulan, count(*) AS n
    FROM bible365_plan p JOIN jemaat j ON j.id = p.jemaat_id
    WHERE p.created_at >= ${sixMonths} ${cabangId ? Prisma.sql`AND j.cabang_id = ${cabangId}::uuid` : Prisma.empty}
    GROUP BY 1 ORDER BY 1`);

  res.json({
    success: true,
    data: {
      totalPeserta: plans.length,
      aktif,
      selesai,
      dihentikan,
      aktif7Hari: recentSet.size,
      sesuaiJadwal: onTrack,
      rataProgres: aktif ? Math.round((sumPct / aktif) * 10) / 10 : 0,
      distribusi: [
        { label: '0–24%', n: buckets[0] },
        { label: '25–49%', n: buckets[1] },
        { label: '50–74%', n: buckets[2] },
        { label: '75–99%', n: buckets[3] },
        { label: 'Selesai', n: buckets[4] },
      ],
      perCabang: [...perCabang.values()]
        .map((r) => ({ cabangId: r.cabangId, nama: r.nama, aktif: r.aktif, selesai: r.selesai, sesuaiJadwal: r.onTrack, rataProgres: r.n ? Math.round((r.sumPct / r.n) * 10) / 10 : 0 }))
        .sort((a, b) => b.aktif + b.selesai - (a.aktif + a.selesai)),
      pesertaBaruPerBulan: monthly.map((m) => ({ bulan: m.bulan, n: Number(m.n) })),
    },
  });
});
