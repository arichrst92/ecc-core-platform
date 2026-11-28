/**
 * Forecast — Pertumbuhan Jemaat (Portal menu "Forecast", 2026-11).
 *
 * Patokan: JEMAAT AKTIF ELS APP = jemaat (bukan tamu) yang membuka Els App dalam
 * keadaan login minimal sekali dalam bulan itu (tabel jemaat_activity_monthly).
 * Semua bulan memakai kalender WIB. Bulan berjalan tidak dipakai untuk model
 * (belum lengkap) — ditampilkan terpisah sebagai "bulan berjalan".
 */
import { prisma, Prisma } from '@ecc/database';
import { backtest, fitForecast, type FitResult } from './forecast-model.js';
import { todayInTz } from './tz.js';

const TZ = 'Asia/Jakarta';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const FORECAST_MAX_H = 60;

// ------------------------------------------------------------------ pengaturan

export type ForecastSettings = {
  trendMinMonths: number;
  seasonMinMonths: number;
  cabangMinMonths: number;
  cabangMinActive: number;
  platformMinMonths: number;
  tamuMinMonths: number;
  occMinMeetings: number;
  homecellMinMonths: number;
  eventMinEvents: number;
  homecellIdeal: number;
  homecellMax: number;
  belowMin: 'label' | 'hide';
};
export const FORECAST_DEFAULTS: ForecastSettings = {
  trendMinMonths: 12,
  seasonMinMonths: 24,
  cabangMinMonths: 12,
  cabangMinActive: 100,
  platformMinMonths: 3,
  tamuMinMonths: 6,
  occMinMeetings: 8,
  homecellMinMonths: 6,
  eventMinEvents: 5,
  homecellIdeal: 12,
  homecellMax: 15,
  belowMin: 'label',
};

export async function getForecastSettings(): Promise<ForecastSettings> {
  const row = await prisma.appConfig.findUnique({ where: { id: 'global' }, select: { forecastSettings: true } });
  const raw = (row?.forecastSettings ?? {}) as Partial<ForecastSettings>;
  const out = { ...FORECAST_DEFAULTS };
  for (const k of Object.keys(FORECAST_DEFAULTS) as (keyof ForecastSettings)[]) {
    const v = raw[k];
    if (k === 'belowMin') {
      if (v === 'label' || v === 'hide') out.belowMin = v;
    } else if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000) {
      (out as Record<string, unknown>)[k] = Math.round(v);
    }
  }
  return out;
}

// ------------------------------------------------------------------ util bulan

const mk = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const addM = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const n = (v: unknown) => Number(v ?? 0);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const round = (v: number) => Math.round(v);

type Platform = 'ios' | 'android' | 'web' | 'lainnya';
const PLATFORMS: Platform[] = ['android', 'ios', 'web', 'lainnya'];

function wibMonthOf(d: Date): Date {
  return monthStart(todayInTz(TZ, d));
}

// ------------------------------------------------------------------ utama

export type ForecastInput = { cabangId?: string | null; horizon?: number };

async function computeForecastData(input: ForecastInput) {
  const settings = await getForecastSettings();
  const cabangId = input.cabangId && UUID.test(input.cabangId) ? input.cabangId : null;
  const H = Math.min(FORECAST_MAX_H, Math.max(6, input.horizon ?? FORECAST_MAX_H));
  const cab = cabangId ? Prisma.sql`AND j.cabang_id = ${cabangId}::uuid` : Prisma.empty;
  const today = todayInTz(TZ);
  const curMonth = monthStart(today);
  const lastFull = addM(curMonth, -1);

  // ---------------- aktivitas
  const act = await prisma.$queryRaw<{ m: Date; jid: string; platform: string; source: string; cid: string }[]>`
    SELECT a.month AS m, a.jemaat_id AS jid, a.platform, a.source, j.cabang_id AS cid
    FROM jemaat_activity_monthly a JOIN jemaat j ON j.id = a.jemaat_id
    WHERE j.is_tamu = false ${cab}`;
  const byMonth = new Map<string, Set<string>>();
  const byMonthPlat = new Map<string, Record<Platform, Set<string>>>();
  const byMonthCab = new Map<string, Map<string, Set<string>>>();
  const firstMonth = new Map<string, string>();
  const firstPlat = new Map<string, Platform>();
  const liveMonths = new Set<string>();
  const jemaatCab = new Map<string, string>();
  for (const r of act) {
    const k = mk(r.m);
    if (!byMonth.has(k)) byMonth.set(k, new Set());
    byMonth.get(k)!.add(r.jid);
    const pl = (PLATFORMS.includes(r.platform as Platform) ? r.platform : 'lainnya') as Platform;
    if (!byMonthPlat.has(k)) byMonthPlat.set(k, { android: new Set(), ios: new Set(), web: new Set(), lainnya: new Set() });
    byMonthPlat.get(k)![pl].add(r.jid);
    if (!byMonthCab.has(k)) byMonthCab.set(k, new Map());
    const mc = byMonthCab.get(k)!;
    if (!mc.has(r.cid)) mc.set(r.cid, new Set());
    mc.get(r.cid)!.add(r.jid);
    jemaatCab.set(r.jid, r.cid);
    const f = firstMonth.get(r.jid);
    if (!f || k < f) {
      firstMonth.set(r.jid, k);
      firstPlat.set(r.jid, pl);
    }
    if (r.source === 'live') liveMonths.add(k);
  }
  const keys = [...byMonth.keys()].sort();
  const startKey = keys[0] ?? mk(lastFull);
  const start = new Date(`${startKey}-01T00:00:00.000Z`);
  const months: Date[] = [];
  for (let d = start; d <= lastFull; d = addM(d, 1)) months.push(d);
  const mKeys = months.map(mk);
  const set = (k: string) => byMonth.get(k) ?? new Set<string>();
  const series = mKeys.map((k) => set(k).size);
  const berjalan = set(mk(curMonth)).size;
  const liveSince = [...liveMonths].sort()[0] ?? null;
  // Bulan yang dapat dipercaya untuk model: sejak pencatatan langsung (live) dimulai,
  // ditambah satu bulan sebelumnya (riwayat sesi login masih lengkap ±30 hari).
  // Bulan riwayat yang lebih tua hanya ditampilkan — jumlahnya kurang lengkap
  // (riwayat terbatas) sehingga bisa membuat tren tampak naik palsu.
  const reliableFrom = liveSince ? mk(addM(new Date(`${liveSince}-01T00:00:00.000Z`), -1)) : (mKeys[mKeys.length - 1] ?? '');
  const relIdx = Math.max(0, Math.min(mKeys.length - 1, mKeys.findIndex((k) => k >= reliableFrom) >= 0 ? mKeys.findIndex((k) => k >= reliableFrom) : mKeys.length - 1));
  const modelSeries = series.slice(relIdx);
  const dataMonths = modelSeries.filter((v) => v > 0).length;

  // komponen per bulan
  const comp = mKeys.map((k, i) => {
    const cur = set(k);
    const prev = i > 0 ? set(mKeys[i - 1]!) : new Set<string>();
    const prev2 = i > 1 ? set(mKeys[i - 2]!) : new Set<string>();
    let baru = 0;
    let kembali = 0;
    for (const j of cur) {
      if (firstMonth.get(j) === k) baru++;
      else if (!prev.has(j)) kembali++;
    }
    let berhenti = 0;
    for (const j of prev2) if (!prev.has(j) && !cur.has(j)) berhenti++;
    // Bulan pertama data: semua tampak "baru" — tidak dihitung.
    if (i === 0) return { month: k, aktif: cur.size, baru: 0, kembali: 0, berhenti: 0, bersih: 0 };
    return { month: k, aktif: cur.size, baru, kembali, berhenti, bersih: cur.size - prev.size };
  });
  const lastC = comp[comp.length - 1];
  // retensi bulan pertama: jemaat baru di m-1 yang masih aktif di m (rata-rata 3 bulan terakhir)
  const ret1s: number[] = [];
  for (let i = Math.max(1, mKeys.length - 3); i < mKeys.length; i++) {
    const nk = mKeys[i - 1]!;
    const newbies = [...set(nk)].filter((j) => firstMonth.get(j) === nk);
    if (newbies.length) ret1s.push(newbies.filter((j) => set(mKeys[i]!).has(j)).length / newbies.length);
  }
  const ret1 = ret1s.length ? ret1s.reduce((a, b) => a + b, 0) / ret1s.length : null;
  // tingkat berhenti bulanan (aktif m-1 tidak aktif m), jemaat lama
  const stopRates: number[] = [];
  for (let i = Math.max(1, mKeys.length - 3); i < mKeys.length; i++) {
    const p = set(mKeys[i - 1]!);
    const c = set(mKeys[i]!);
    const old = [...p].filter((j) => firstMonth.get(j) !== mKeys[i - 1]);
    if (old.length) stopRates.push(old.filter((j) => !c.has(j)).length / old.length);
  }
  const stopRate = stopRates.length ? stopRates.reduce((a, b) => a + b, 0) / stopRates.length : null;
  const newAvg3 = comp.slice(-3).reduce((a, c) => a + c.baru, 0) / Math.max(1, Math.min(3, comp.length));
  const retAvg3 = comp.slice(-3).reduce((a, c) => a + c.kembali, 0) / Math.max(1, Math.min(3, comp.length));

  // ---------------- event mendatang & efek event (untuk prediksi)
  const ev = await eventEffect(cabangId, firstMonth, set, mKeys, today);
  const eventReady = ev.pastEvents >= settings.eventMinEvents;

  // ---------------- prediksi utama
  const startMonthIdx = months[relIdx]?.getUTCMonth() ?? 0;
  const seasonal = dataMonths >= settings.seasonMinMonths;
  const fit = fitForecast(modelSeries, startMonthIdx, H, seasonal);
  const fcMonths = Array.from({ length: H }, (_, i) => mk(addM(lastFull, i + 1)));
  if (fit && eventReady && ev.upliftPerEvent > 0) applyEventUplift(fit, fcMonths, ev.upcomingByMonth, ev.upliftPerEvent, stopRate ?? 0.05);
  const bt3 = modelSeries.length >= 8 ? backtest(modelSeries, startMonthIdx, 3, seasonal) : { mape: null, points: [] };
  const bt12 = modelSeries.length >= 18 ? backtest(modelSeries, startMonthIdx, 12, seasonal) : { mape: null, points: [] };

  // ---------------- platform
  const platSeries = mKeys.map((k) => {
    const p = byMonthPlat.get(k);
    return { month: k, android: p?.android.size ?? 0, ios: p?.ios.size ?? 0, web: p?.web.size ?? 0, lainnya: p?.lainnya.size ?? 0 };
  });
  const lastK = mKeys[mKeys.length - 1];
  const lastP = lastK ? byMonthPlat.get(lastK) : undefined;
  let multi = 0;
  if (lastP) {
    const cnt = new Map<string, number>();
    for (const pl of PLATFORMS) for (const j of lastP[pl]) cnt.set(j, (cnt.get(j) ?? 0) + 1);
    multi = [...cnt.values()].filter((v) => v > 1).length;
  }
  const platRet = PLATFORMS.map((pl) => {
    // retensi bulan pertama per platform awal
    let a = 0;
    let b = 0;
    for (let i = Math.max(1, mKeys.length - 3); i < mKeys.length; i++) {
      const nk = mKeys[i - 1]!;
      for (const j of set(nk)) {
        if (firstMonth.get(j) !== nk || firstPlat.get(j) !== pl) continue;
        b++;
        if (set(mKeys[i]!).has(j)) a++;
      }
    }
    const now = platSeries[platSeries.length - 1]?.[pl] ?? 0;
    const before = platSeries[platSeries.length - 4]?.[pl] ?? 0;
    return { platform: pl, aktif: now, tren3: before ? Math.round(((now - before) / before) * 100) : null, retensi1: pct(a, b) };
  });

  // ---------------- per cabang
  const cabangs = await prisma.cabangGereja.findMany({ where: cabangId ? { id: cabangId } : {}, select: { id: true, nama: true }, orderBy: { nama: 'asc' } });
  const perCabang = cabangs
    .map((c) => {
      const s = mKeys.map((k) => byMonthCab.get(k)?.get(c.id)?.size ?? 0);
      const cur = s[s.length - 1] ?? 0;
      const prev = s[s.length - 2] ?? 0;
      const f = fitForecast(s.slice(relIdx), startMonthIdx, 12, seasonal);
      const ci = comp.length;
      let baru = 0;
      let berhenti = 0;
      if (ci > 0) {
        const k = mKeys[ci - 1]!;
        const curSet = byMonthCab.get(k)?.get(c.id) ?? new Set<string>();
        const p1 = ci > 1 ? (byMonthCab.get(mKeys[ci - 2]!)?.get(c.id) ?? new Set<string>()) : new Set<string>();
        const p2 = ci > 2 ? (byMonthCab.get(mKeys[ci - 3]!)?.get(c.id) ?? new Set<string>()) : new Set<string>();
        for (const j of curSet) if (firstMonth.get(j) === k) baru++;
        for (const j of p2) if (!p1.has(j) && !curSet.has(j)) berhenti++;
      }
      const pk = lastK ? byMonthPlat.get(lastK) : undefined;
      const mix = { android: 0, ios: 0, web: 0 };
      if (pk) for (const pl of ['android', 'ios', 'web'] as const) for (const j of pk[pl]) if (jemaatCab.get(j) === c.id) mix[pl]++;
      return {
        id: c.id,
        nama: c.nama,
        aktif: cur,
        tumbuhPersen: prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
        tren: s.slice(-12),
        baru,
        berhenti,
        platform: mix,
        prediksi12: f ? round(f.fc[11] ?? f.fc[f.fc.length - 1]!) : null,
        prediksiLo: f ? round(f.lo[11] ?? 0) : null,
        prediksiHi: f ? round(f.hi[11] ?? 0) : null,
        kecil: cur < settings.cabangMinActive,
        _fc: f?.fc ?? null,
      };
    })
    .filter((c) => c.aktif > 0 || c.tren.some((v) => v > 0))
    .sort((a, b) => b.aktif - a.aktif);

  // ---------------- usia & keterlibatan (jemaat aktif bulan lengkap terakhir)
  const activeIds = lastK ? [...set(lastK)] : [];
  const prof = activeIds.length
    ? await prisma.jemaat.findMany({
        where: { id: { in: activeIds } },
        select: { id: true, tanggalLahir: true, sudahBaptisAir: true },
      })
    : [];
  const ageOf = (d: Date | null) => {
    if (!d) return null;
    let a = today.getUTCFullYear() - d.getUTCFullYear();
    if (today.getUTCMonth() < d.getUTCMonth() || (today.getUTCMonth() === d.getUTCMonth() && today.getUTCDate() < d.getUTCDate())) a--;
    return a;
  };
  const AGE = [
    { key: 'anak', label: 'Anak & remaja (≤ 17)', test: (a: number) => a <= 17 },
    { key: 'muda', label: 'Dewasa muda (18–25)', test: (a: number) => a >= 18 && a <= 25 },
    { key: 'dewasa1', label: 'Dewasa (26–40)', test: (a: number) => a >= 26 && a <= 40 },
    { key: 'dewasa2', label: 'Dewasa (41–60)', test: (a: number) => a >= 41 && a <= 60 },
    { key: 'lansia', label: 'Lansia (60+)', test: (a: number) => a > 60 },
  ];
  const k3 = mKeys[mKeys.length - 4];
  const ids3 = k3 ? set(k3) : new Set<string>();
  const prof3 = ids3.size ? await prisma.jemaat.findMany({ where: { id: { in: [...ids3] } }, select: { id: true, tanggalLahir: true } }) : [];
  const usia = [
    ...AGE.map((g) => {
      const now = prof.filter((p) => {
        const a = ageOf(p.tanggalLahir);
        return a != null && g.test(a);
      }).length;
      const before = prof3.filter((p) => {
        const a = ageOf(p.tanggalLahir);
        return a != null && g.test(a);
      }).length;
      return { key: g.key, label: g.label, aktif: now, tren3: before ? Math.round(((now - before) / before) * 100) : null };
    }),
    { key: 'unknown', label: 'Tidak diketahui', aktif: prof.filter((p) => !p.tanggalLahir).length, tren3: null },
  ];
  const [hcMembers, pelMembers, hadir2] = activeIds.length
    ? await Promise.all([
        prisma.homecellMember.findMany({ where: { jemaatId: { in: activeIds }, isActive: true, homecell: { isActive: true } }, select: { jemaatId: true }, distinct: ['jemaatId'] }),
        prisma.jemaatPelayanan.findMany({ where: { jemaatId: { in: activeIds }, isActive: true }, select: { jemaatId: true }, distinct: ['jemaatId'] }),
        prisma.reservasi.groupBy({
          by: ['jemaatId'],
          where: { jemaatId: { in: activeIds }, status: 'JOIN', tanggalIbadah: { gte: lastFull, lt: curMonth } },
          _count: { _all: true },
        }),
      ])
    : [[], [], []];
  const inHc = new Set(hcMembers.map((r) => r.jemaatId));
  const keterlibatan = [
    { key: 'homecell', label: 'Ikut homecell', persen: pct(inHc.size, activeIds.length) },
    { key: 'pelayanan', label: 'Melayani di pelayanan', persen: pct(pelMembers.length, activeIds.length) },
    { key: 'baptis', label: 'Sudah baptis air', persen: pct(prof.filter((p) => p.sudahBaptisAir).length, activeIds.length) },
    { key: 'hadir2', label: 'Hadir ibadah ≥ 2× sebulan', persen: pct(hadir2.filter((r) => r._count._all >= 2).length, activeIds.length) },
  ];

  // ---------------- homecell (efek & kapasitas)
  const homecell = await homecellStats(cabangId, mKeys, set, firstMonth, inHc, perCabang, lastFull, settings);

  // ---------------- tamu
  const tamu = await tamuStats(cabangId, today, curMonth);

  // ---------------- kapasitas ibadah
  const growthAt = (cid: string | null, h: number) => {
    const c = cid ? perCabang.find((x) => x.id === cid) : null;
    const f = c?._fc ?? fit?.fc ?? null;
    const base = c ? c.aktif : (series[series.length - 1] ?? 0);
    if (!f || !base) return 1;
    return Math.max(0.5, (f[Math.min(h, f.length) - 1] ?? base) / base);
  };
  const kapasitas = await capacityStats(cabangId, today, settings, growthAt, H, lastFull);

  // ---------------- kesiapan data
  const readyRow = (key: string, label: string, have: number, min: number, unit: string, extra?: string) => ({
    key,
    label,
    have,
    min,
    unit,
    extra: extra ?? null,
    status: have >= min ? ('siap' as const) : have >= Math.ceil(min / 3) ? ('awal' as const) : ('kurang' as const),
  });
  const readiness = [
    readyRow('tren', 'Tren jemaat aktif', dataMonths, settings.trendMinMonths, 'bulan'),
    readyRow('musiman', 'Pola musiman (Natal, Paskah)', dataMonths, settings.seasonMinMonths, 'bulan'),
    readyRow('cabang', 'Prediksi per cabang', dataMonths, settings.cabangMinMonths, 'bulan', `≥ ${settings.cabangMinActive} jemaat aktif`),
    readyRow('platform', 'Platform iOS / Android / Web', liveSince ? mKeys.filter((k) => k >= liveSince).length : 0, settings.platformMinMonths, 'bulan'),
    readyRow('tamu', 'Tamu & konversi', tamu.dataMonths, settings.tamuMinMonths, 'bulan'),
    readyRow('kapasitas', 'Kapasitas ibadah (okupansi)', kapasitas.minMeetings, settings.occMinMeetings, 'pertemuan'),
    readyRow('homecell', 'Efek homecell', dataMonths, settings.homecellMinMonths, 'bulan'),
    readyRow('event', 'Efek event', ev.pastEvents, settings.eventMinEvents, 'event'),
    readyRow('panjang', 'Proyeksi > 24 bulan', dataMonths, 24, 'bulan'),
  ];
  const monthsNeeded = (min: number) => (dataMonths >= min ? null : mk(addM(lastFull, min - dataMonths)));
  const maturity = {
    dataMonths,
    trendMin: settings.trendMinMonths,
    seasonMin: settings.seasonMinMonths,
    early: dataMonths < settings.trendMinMonths,
    akuratMulai: monthsNeeded(settings.trendMinMonths),
    lengkapMulai: monthsNeeded(settings.seasonMinMonths),
    liveSince,
    riwayatSampai: relIdx > 0 ? (mKeys[relIdx - 1] ?? null) : null,
    modelMulai: mKeys[relIdx] ?? null,
  };
  const hidePred = settings.belowMin === 'hide' && maturity.early;

  // ---------------- simulasi (dasar untuk klien)
  const sim = {
    aktif: series[series.length - 1] ?? 0,
    baruPerBulan: round(newAvg3),
    kembaliPerBulan: round(retAvg3),
    retensi1: ret1 == null ? null : Math.round(ret1 * 1000) / 10,
    berhentiPersen: stopRate == null ? null : Math.round(stopRate * 1000) / 10,
    homecellPersen: homecell.persenAktif,
    berhentiHomecell: homecell.stopIn,
    berhentiNonHomecell: homecell.stopOut,
    upliftPerEvent: ev.upliftPerEvent,
    eventPerTahun: ev.eventsPerYear,
  };

  // ---------------- ringkasan & teks
  const cur = series[series.length - 1] ?? 0;
  const prev = series[series.length - 2] ?? 0;
  // Pembanding tahun lalu hanya bila bulan itu termasuk data yang dapat dipercaya.
  const yearAgo = series.length - 13 >= relIdx ? (series[series.length - 13] ?? null) : null;
  const fc = hidePred || !fit ? null : fit;
  const fcAt = (h: number) => (fc ? { month: fcMonths[h - 1]!, value: round(fc.fc[h - 1]!), lo: round(fc.lo[h - 1]!), hi: round(fc.hi[h - 1]!) } : null);
  const milestones = fc
    ? [500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000]
        .filter((g) => g > cur)
        .map((g) => {
          const i = fc.fc.findIndex((v) => v >= g);
          return i >= 0 ? { target: g, month: fcMonths[i]! } : null;
        })
        .filter((x): x is { target: number; month: string } => !!x)
        .slice(0, 3)
    : [];
  const perTahun = fc
    ? fcMonths
        .map((m, i) => ({ m, i }))
        .filter((x) => x.m.endsWith('-12'))
        .map(({ m, i }) => ({ tahun: Number(m.slice(0, 4)), value: round(fc.fc[i]!), lo: round(fc.lo[i]!), hi: round(fc.hi[i]!), pes: round(fc.pes[i]!), opt: round(fc.opt[i]!), jangkaPanjang: i >= 24 }))
    : [];

  const out = {
    generatedAt: new Date().toISOString(),
    cabangId,
    horizon: H,
    settings,
    maturity,
    hidePrediction: hidePred,
    months: mKeys,
    series,
    berjalan: { month: mk(curMonth), aktif: berjalan },
    components: comp,
    ringkasan: {
      bulan: lastK ?? null,
      aktif: cur,
      vsBulanLalu: prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null,
      vsTahunLalu: yearAgo ? Math.round(((cur - yearAgo) / yearAgo) * 1000) / 10 : null,
      baru: lastC?.baru ?? 0,
      kembali: lastC?.kembali ?? 0,
      berhenti: lastC?.berhenti ?? 0,
      bersih: lastC?.bersih ?? 0,
      tumbuh6: avgGrowth(modelSeries, 6),
      setahunLalu: yearAgo,
    },
    forecast: fc
      ? {
          months: fcMonths,
          fc: fc.fc.map(round),
          lo: fc.lo.map(round),
          hi: fc.hi.map(round),
          pes: fc.pes.map(round),
          opt: fc.opt.map(round),
          seasonal: fc.params.seasonal,
          eventUplift: eventReady ? ev.upliftPerEvent : 0,
        }
      : null,
    akhir: fcAt(H),
    milestones,
    perTahun,
    backtest: { mape3: bt3.mape, mape12: bt12.mape, points: bt3.points.map((p) => ({ month: mKeys[relIdx + p.idx]!, actual: p.actual, pred: round(p.pred) })) },
    platform: { series: platSeries, ringkasan: platRet, multiPlatform: multi },
    perCabang: perCabang.map(({ _fc: _x, ...c }) => c),
    usia,
    keterlibatan,
    homecell: { ...homecell, _members: undefined },
    event: { ...ev, ready: eventReady, upcomingByMonth: undefined, upcomingList: ev.upcomingList },
    tamu,
    kapasitas,
    readiness,
    sim,
  };
  return out;
}

export async function buildForecast(input: ForecastInput) {
  const out = await computeForecastData(input);
  return { ...out, insights: buildInsights(out), langkah: buildActions(out), pernyataan: buildStatement(out) };
}

export type Forecast = Awaited<ReturnType<typeof buildForecast>>;

function avgGrowth(s: number[], k: number): number | null {
  const r: number[] = [];
  for (let i = Math.max(1, s.length - k); i < s.length; i++) if (s[i - 1]! > 0) r.push((s[i]! - s[i - 1]!) / s[i - 1]!);
  return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 1000) / 10 : null;
}

function applyEventUplift(fit: FitResult, months: string[], upcoming: Map<string, number>, uplift: number, stop: number) {
  // Jemaat baru dari event bertahan (dikurangi tingkat berhenti tiap bulan).
  const add = months.map(() => 0);
  months.forEach((m, i) => {
    const k = upcoming.get(m) ?? 0;
    if (!k) return;
    for (let j = i; j < months.length; j++) add[j]! += k * uplift * Math.pow(1 - stop, j - i);
  });
  for (let i = 0; i < months.length; i++) {
    fit.fc[i]! += add[i]!;
    fit.lo[i]! += add[i]!;
    fit.hi[i]! += add[i]!;
    fit.pes[i]! += add[i]!;
    fit.opt[i]! += add[i]!;
  }
}

// ------------------------------------------------------------------ event

async function eventEffect(
  cabangId: string | null,
  firstMonth: Map<string, string>,
  set: (k: string) => Set<string>,
  mKeys: string[],
  today: Date,
) {
  const since = addM(monthStart(today), -12);
  const cabW = cabangId ? { cabangId } : {};
  const events = await prisma.event.findMany({
    where: { ...cabW, tanggalMulai: { gte: since, lt: today } },
    select: {
      id: true,
      judul: true,
      tanggalMulai: true,
      cabang: { select: { nama: true } },
      partisipasi: {
        where: { status: { not: 'BATAL' } },
        select: { jemaatId: true, registeredAt: true, guestSource: true, jemaat: { select: { isTamu: true } } },
      },
    },
  });
  // Pertama kali aktif (bulan) per jemaat, & daftar/hadir event ≤ 14 hari sebelum bulan aktif pertama.
  const perEvent = events.map((e) => {
    const peserta = e.partisipasi.length;
    const tamu = e.partisipasi.filter((p) => p.jemaat.isTamu || !!p.guestSource).length;
    const evMonth = mk(wibMonthOf(e.tanggalMulai));
    const nextMonth = mk(addM(wibMonthOf(e.tanggalMulai), 1));
    // "Jadi jemaat aktif" = pertama kali aktif di bulan event atau sesudahnya (≤ 2 bulan).
    const m2 = mk(addM(wibMonthOf(e.tanggalMulai), 2));
    const joined = e.partisipasi.filter((p) => {
      const f = firstMonth.get(p.jemaatId);
      return f && f >= evMonth && f <= m2;
    });
    const stay = joined.filter((p) => {
      const f = firstMonth.get(p.jemaatId)!;
      const i = mKeys.indexOf(f);
      const k2 = mKeys[i + 2];
      return k2 ? set(k2).has(p.jemaatId) : false;
    });
    void nextMonth;
    return {
      id: e.id,
      judul: e.judul,
      tanggal: e.tanggalMulai.toISOString(),
      cabang: e.cabang?.nama ?? 'Sinode',
      peserta,
      tamu,
      jadiJemaat: joined.length,
      bertahanPersen: joined.length ? Math.round((stay.length / joined.length) * 100) : null,
    };
  });
  const big = perEvent.filter((e) => e.peserta >= 30);
  const upliftPerEvent = big.length ? Math.round((big.reduce((a, e) => a + e.jadiJemaat, 0) / big.length) * 10) / 10 : 0;
  // Jemaat baru per bulan yang datang lewat event (daftar event ≤ 14 hari sebelum aktif pertama, pendekatan bulan).
  const regs = await prisma.eventParticipation.findMany({
    where: { status: { not: 'BATAL' }, registeredAt: { gte: addM(since, -1) }, ...(cabangId ? { event: { cabangId } } : {}) },
    select: { jemaatId: true, registeredAt: true },
  });
  const regBy = new Map<string, Date[]>();
  for (const r of regs) {
    if (!regBy.has(r.jemaatId)) regBy.set(r.jemaatId, []);
    regBy.get(r.jemaatId)!.push(r.registeredAt);
  }
  const dariEvent = mKeys.slice(-12).map((k) => {
    let baru = 0;
    let ev = 0;
    for (const j of set(k)) {
      if (firstMonth.get(j) !== k) continue;
      baru++;
      const ms = new Date(`${k}-01T00:00:00.000Z`).getTime();
      const me = addM(new Date(`${k}-01T00:00:00.000Z`), 1).getTime();
      if ((regBy.get(j) ?? []).some((d) => d.getTime() >= ms - 14 * 86_400_000 && d.getTime() < me)) ev++;
    }
    return { month: k, baru, dariEvent: ev };
  });
  const last3 = dariEvent.slice(-3);
  const persenDariEvent = pct(last3.reduce((a, x) => a + x.dariEvent, 0), last3.reduce((a, x) => a + x.baru, 0));
  // Event mendatang (sampai 60 bulan — yang sudah dijadwalkan).
  const upcoming = await prisma.event.findMany({
    where: { ...cabW, tanggalMulai: { gte: today, lt: addM(monthStart(today), FORECAST_MAX_H + 1) } },
    select: { id: true, judul: true, tanggalMulai: true, quotaPeserta: true, cabang: { select: { nama: true } } },
    orderBy: { tanggalMulai: 'asc' },
    take: 200,
  });
  const upcomingByMonth = new Map<string, number>();
  for (const u of upcoming) {
    const k = mk(wibMonthOf(u.tanggalMulai));
    upcomingByMonth.set(k, (upcomingByMonth.get(k) ?? 0) + 1);
  }
  return {
    pastEvents: perEvent.length,
    perEvent: perEvent.sort((a, b) => b.jadiJemaat - a.jadiJemaat || b.peserta - a.peserta).slice(0, 10),
    upliftPerEvent,
    eventsPerYear: big.length,
    dariEvent,
    persenDariEvent,
    upcoming3: upcoming.filter((u) => u.tanggalMulai < addM(monthStart(today), 3)).length,
    upcomingList: upcoming.slice(0, 8).map((u) => ({ judul: u.judul, tanggal: u.tanggalMulai.toISOString(), cabang: u.cabang?.nama ?? 'Sinode' })),
    upcomingByMonth,
  };
}

// ------------------------------------------------------------------ homecell

async function homecellStats(
  cabangId: string | null,
  mKeys: string[],
  set: (k: string) => Set<string>,
  firstMonth: Map<string, string>,
  inHcNow: Set<string>,
  perCabang: { id: string; nama: string; aktif: number; _fc: number[] | null }[],
  lastFull: Date,
  st: ForecastSettings,
) {
  // Tingkat berhenti per bulan (rata-rata 3 bulan), dipisah ikut / tidak ikut homecell (keanggotaan sekarang).
  const allMembers = await prisma.homecellMember.findMany({
    where: { isActive: true, homecell: { isActive: true } },
    select: { jemaatId: true },
    distinct: ['jemaatId'],
  });
  const hcSet = new Set(allMembers.map((m) => m.jemaatId));
  const rate = (inHc: boolean) => {
    const r: number[] = [];
    for (let i = Math.max(1, mKeys.length - 3); i < mKeys.length; i++) {
      const p = [...set(mKeys[i - 1]!)].filter((j) => hcSet.has(j) === inHc);
      if (p.length) r.push(p.filter((j) => !set(mKeys[i]!).has(j)).length / p.length);
    }
    return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 1000) / 10 : null;
  };
  // Kurva bertahan: % masih aktif k bulan setelah pertama aktif (kohort), ikut vs tidak ikut.
  const curve = (inHc: boolean) =>
    Array.from({ length: 12 }, (_, k) => {
      let a = 0;
      let b = 0;
      mKeys.forEach((m, i) => {
        if (i + k >= mKeys.length) return;
        for (const j of set(m)) {
          if (firstMonth.get(j) !== m || hcSet.has(j) !== inHc) continue;
          b++;
          if (set(mKeys[i + k]!).has(j)) a++;
        }
      });
      return b >= 5 ? Math.round((a / b) * 100) : null;
    });
  // Kapasitas homecell per cabang.
  const hcs = await prisma.homecell.findMany({
    where: { isActive: true, ...(cabangId ? { area: { cabangId } } : {}) },
    select: { id: true, area: { select: { cabangId: true, cabang: { select: { nama: true } } } }, _count: { select: { members: { where: { isActive: true } } } } },
  });
  const byCab = new Map<string, { nama: string; count: number; members: number; over: number }>();
  for (const h of hcs) {
    const cid = h.area.cabangId;
    const cur = byCab.get(cid) ?? { nama: h.area.cabang?.nama ?? '—', count: 0, members: 0, over: 0 };
    cur.count++;
    cur.members += h._count.members;
    if (h._count.members > st.homecellMax) cur.over++;
    byCab.set(cid, cur);
  }
  const decNext = new Date(Date.UTC(lastFull.getUTCFullYear() + 1, 11, 1));
  const hMonths = (decNext.getUTCFullYear() - lastFull.getUTCFullYear()) * 12 + (decNext.getUTCMonth() - lastFull.getUTCMonth());
  const perCab = [...byCab.entries()]
    .map(([cid, v]) => {
      const c = perCabang.find((x) => x.id === cid);
      const g = c?._fc && c.aktif ? Math.max(1, (c._fc[Math.min(hMonths, c._fc.length) - 1] ?? c.aktif) / c.aktif) : 1;
      const projected = v.members * g;
      return {
        cabangId: cid,
        nama: v.nama,
        homecell: v.count,
        rataAnggota: v.count ? Math.round((v.members / v.count) * 10) / 10 : 0,
        lebihBatas: v.over,
        perluDibuka: Math.max(0, Math.ceil(projected / st.homecellIdeal) - v.count),
      };
    })
    .sort((a, b) => b.homecell - a.homecell);
  return {
    persenAktif: pct([...inHcNow].length, set(mKeys[mKeys.length - 1] ?? '').size),
    stopIn: rate(true),
    stopOut: rate(false),
    curveIn: curve(true),
    curveOut: curve(false),
    perCabang: perCab,
    perluDibuka: perCab.reduce((a, c) => a + c.perluDibuka, 0),
    sampaiTahun: decNext.getUTCFullYear(),
    ideal: st.homecellIdeal,
    batas: st.homecellMax,
    _members: hcSet.size,
    pertumbuhan: await homecellGrowth(cabangId, lastFull, st),
  };
}

// ------------------------------------------------------------------ tamu

async function tamuStats(cabangId: string | null, today: Date, curMonth: Date) {
  const cab = cabangId ? Prisma.sql`AND j.cabang_id = ${cabangId}::uuid` : Prisma.empty;
  const since = addM(curMonth, -12);
  // Kunjungan tamu: ibadah (JOIN), event (HADIR), homecell (absen tamu).
  const visits = await prisma.$queryRaw<{ jid: string; d: Date; src: string; kat: string | null; is_tamu: boolean; cid: string; fu: string | null }[]>`
    SELECT r.jemaat_id AS jid, r.tanggal_ibadah AS d, 'ibadah' AS src, j.tamu_kategori AS kat, j.is_tamu, j.cabang_id AS cid, j.tamu_followup_by_id AS fu
      FROM reservasi r JOIN jemaat j ON j.id = r.jemaat_id
      WHERE r.status = 'JOIN' AND r.tanggal_ibadah >= ${since}::date AND (j.is_tamu = true OR r.guest_source IS NOT NULL) ${cab}
    UNION ALL
    SELECT p.jemaat_id, (p.attended_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Jakarta')::date, 'event', j.tamu_kategori, j.is_tamu, j.cabang_id, j.tamu_followup_by_id
      FROM event_participation p JOIN jemaat j ON j.id = p.jemaat_id
      WHERE p.status = 'HADIR' AND p.attended_at >= ${since} AND (j.is_tamu = true OR p.guest_source IS NOT NULL) ${cab}
    UNION ALL
    SELECT a.tamu_id, s.tanggal, 'homecell', j.tamu_kategori, j.is_tamu, j.cabang_id, j.tamu_followup_by_id
      FROM homecell_tamu_attendance a JOIN homecell_schedule s ON s.id = a.schedule_id JOIN jemaat j ON j.id = a.tamu_id
      WHERE s.tanggal >= ${since}::date ${cab}`;
  const monthsK = Array.from({ length: 13 }, (_, i) => mk(addM(since, i)));
  const per = new Map<string, { nc: Set<string>; vs: Set<string> }>();
  const firstVisit = new Map<string, Date>();
  const visitDays = new Map<string, Set<string>>();
  const info = new Map<string, { kat: string | null; isTamu: boolean; cid: string; fu: string | null; srcs: Set<string> }>();
  for (const v of visits) {
    const k = mk(monthStart(v.d));
    if (!per.has(k)) per.set(k, { nc: new Set(), vs: new Set() });
    (v.kat === 'NEW_COMER' ? per.get(k)!.nc : per.get(k)!.vs).add(v.jid);
    const f = firstVisit.get(v.jid);
    if (!f || v.d < f) firstVisit.set(v.jid, v.d);
    if (!visitDays.has(v.jid)) visitDays.set(v.jid, new Set());
    visitDays.get(v.jid)!.add(v.d.toISOString().slice(0, 10));
    const i = info.get(v.jid) ?? { kat: v.kat, isTamu: v.is_tamu, cid: v.cid, fu: v.fu, srcs: new Set<string>() };
    i.srcs.add(v.src);
    info.set(v.jid, i);
  }
  const bulanan = monthsK.map((k) => ({ month: k, newComer: per.get(k)?.nc.size ?? 0, visitor: per.get(k)?.vs.size ?? 0 }));
  const full = bulanan.slice(0, -1); // bulan lengkap
  const totals = full.map((b) => b.newComer + b.visitor);
  const dataMonths = totals.filter((t) => t > 0).length;
  const f = fitForecast(totals.filter((_, i) => i >= totals.findIndex((t) => t > 0)), 0, 6, false);
  // Tamu yang pertama datang 90 hari terakhir → perjalanan.
  const d90 = new Date(today.getTime() - 90 * 86_400_000);
  const recent = [...firstVisit.entries()].filter(([, d]) => d >= d90).map(([j]) => j);
  const actRows = recent.length
    ? await prisma.$queryRaw<{ jid: string }[]>`SELECT DISTINCT jemaat_id AS jid FROM jemaat_activity_monthly WHERE jemaat_id = ANY(${recent}::uuid[])`
    : [];
  const activeSet = new Set(actRows.map((r) => r.jid));
  const hcTamu = recent.length ? await prisma.homecellTamu.findMany({ where: { tamuId: { in: recent } }, select: { tamuId: true } }) : [];
  const hcTamuSet = new Set(hcTamu.map((r) => r.tamuId));
  const stage = {
    datang: recent.length,
    datangLagi: recent.filter((j) => (visitDays.get(j)?.size ?? 0) >= 2).length,
    dihubungi: recent.filter((j) => !!info.get(j)?.fu || hcTamuSet.has(j)).length,
    daftar: recent.filter((j) => info.get(j)?.isTamu === false).length,
    aktif: recent.filter((j) => info.get(j)?.isTamu === false && activeSet.has(j)).length,
  };
  const conv = (kat: 'NEW_COMER' | 'VISITOR') => {
    const g = recent.filter((j) => (info.get(j)?.kat === 'NEW_COMER') === (kat === 'NEW_COMER'));
    return pct(g.filter((j) => info.get(j)?.isTamu === false && activeSet.has(j)).length, g.length);
  };
  const last = bulanan[bulanan.length - 2] ?? { newComer: 0, visitor: 0 };
  const prev = bulanan[bulanan.length - 3] ?? { newComer: 0, visitor: 0 };
  const belumFu = [...info.entries()].filter(([j, i]) => i.isTamu && i.kat === 'NEW_COMER' && !i.fu && !hcTamuSet.has(j) && (firstVisit.get(j)?.getTime() ?? 0) <= today.getTime() - 7 * 86_400_000).length;
  // Per cabang (bulan lengkap terakhir).
  const cabs = await prisma.cabangGereja.findMany({ select: { id: true, nama: true } });
  const lastK = full[full.length - 1]?.month;
  const perCabang = cabs
    .map((c) => {
      const ids = [...info.entries()].filter(([, i]) => i.cid === c.id).map(([j]) => j);
      const inLast = ids.filter((j) => per.get(lastK ?? '')?.nc.has(j) || per.get(lastK ?? '')?.vs.has(j));
      const rec = ids.filter((j) => recent.includes(j));
      const src = { ibadah: 0, event: 0, homecell: 0 };
      for (const j of inLast) for (const s of info.get(j)!.srcs) src[s as keyof typeof src]++;
      return {
        nama: c.nama,
        tamu: inLast.length,
        newComer: inLast.filter((j) => info.get(j)!.kat === 'NEW_COMER').length,
        visitor: inLast.filter((j) => info.get(j)!.kat !== 'NEW_COMER').length,
        konversi: pct(rec.filter((j) => info.get(j)?.isTamu === false && activeSet.has(j)).length, rec.length),
        belumFu: ids.filter((j) => {
          const i = info.get(j)!;
          return i.isTamu && i.kat === 'NEW_COMER' && !i.fu && !hcTamuSet.has(j);
        }).length,
        sumber: src,
      };
    })
    .filter((c) => c.tamu > 0 || c.belumFu > 0)
    .sort((a, b) => b.tamu - a.tamu);
  return {
    dataMonths,
    bulanan: full,
    prediksi: f ? f.fc.map(round) : [],
    prediksiMonths: Array.from({ length: 6 }, (_, i) => mk(addM(curMonth, i))),
    bulanIni: { tamu: last.newComer + last.visitor, newComer: last.newComer, visitor: last.visitor, vsBulanLalu: prev.newComer + prev.visitor ? Math.round(((last.newComer + last.visitor) / (prev.newComer + prev.visitor) - 1) * 100) : null },
    konversi: { total: pct(stage.aktif, stage.datang), newComer: conv('NEW_COMER'), visitor: conv('VISITOR') },
    perjalanan: stage,
    belumFollowUp: belumFu,
    perCabang,
  };
}

// ------------------------------------------------------------------ kapasitas ibadah

async function capacityStats(
  cabangId: string | null,
  today: Date,
  st: ForecastSettings,
  growthAt: (cid: string | null, h: number) => number,
  H: number,
  lastFull: Date,
) {
  const ibs = await prisma.ibadah.findMany({
    where: { isActive: true, ...(cabangId ? { cabangId } : {}) },
    select: { id: true, nama: true, jamMulai: true, kapasitasSeat: true, cabangId: true, cabang: { select: { nama: true } } },
  });
  const since = new Date(today.getTime() - 120 * 86_400_000);
  const rows = ibs.length
    ? await prisma.$queryRaw<{ iid: string; d: Date; c: bigint }[]>`
        SELECT ibadah_id AS iid, tanggal_ibadah AS d, COUNT(*) AS c FROM reservasi
        WHERE status = 'JOIN' AND tanggal_ibadah >= ${since}::date AND tanggal_ibadah <= ${today}::date AND ibadah_id = ANY(${ibs.map((i) => i.id)}::uuid[])
        GROUP BY ibadah_id, tanggal_ibadah`
    : [];
  const by = new Map<string, { d: Date; c: number }[]>();
  for (const r of rows) {
    if (!by.has(r.iid)) by.set(r.iid, []);
    by.get(r.iid)!.push({ d: r.d, c: n(r.c) });
  }
  const list = ibs
    .map((ib) => {
      const occ = (by.get(ib.id) ?? []).sort((a, b) => b.d.getTime() - a.d.getTime()).slice(0, st.occMinMeetings);
      const avg = occ.length ? occ.reduce((a, o) => a + o.c, 0) / occ.length : 0;
      const peak = occ.reduce((a, o) => Math.max(a, o.c), 0);
      const seat = ib.kapasitasSeat ?? null;
      const p = (h: number) => (seat ? Math.round(((avg * growthAt(ib.cabangId, h)) / seat) * 100) : null);
      let penuh: string | null = null;
      if (seat && avg > 0) {
        for (let h = 0; h <= H; h++) {
          if ((avg * (h ? growthAt(ib.cabangId, h) : 1)) / seat >= 0.9) {
            penuh = mk(addM(lastFull, Math.max(1, h)));
            break;
          }
        }
      }
      return {
        id: ib.id,
        nama: ib.nama,
        jam: ib.jamMulai,
        cabangId: ib.cabangId,
        cabang: ib.cabang?.nama ?? '',
        kursi: seat,
        pertemuan: occ.length,
        rataHadir: Math.round(avg),
        puncak: peak,
        okupansi: seat && avg ? Math.round((avg / seat) * 100) : null,
        okupansi6: p(6),
        okupansi12: p(12),
        penuhMulai: penuh,
        cukupData: occ.length >= st.occMinMeetings,
        riwayat: occ
          .slice()
          .reverse()
          .map((o) => ({ tanggal: o.d.toISOString().slice(0, 10), hadir: o.c })),
      };
    })
    .filter((x) => x.pertemuan > 0)
    .sort((a, b) => (b.okupansi ?? -1) - (a.okupansi ?? -1));
  const withSeat = list.filter((x) => x.okupansi != null);
  const allOcc = withSeat.flatMap((x) => (by.get(x.id) ?? []).filter((o) => o.d >= new Date(today.getTime() - 31 * 86_400_000)).map((o) => o.c / x.kursi!));
  return {
    list,
    rataOkupansi: withSeat.length ? Math.round(withSeat.reduce((a, x) => a + x.okupansi!, 0) / withSeat.length) : null,
    pertemuanPenuh: allOcc.filter((o) => o >= 0.9).length,
    pertemuanBulanIni: allOcc.length,
    akanPenuh6: withSeat.filter((x) => (x.okupansi ?? 0) < 90 && (x.okupansi6 ?? 0) >= 90).length,
    sisaKursi: Math.max(0, Math.round(withSeat.reduce((a, x) => a + (x.kursi! - x.rataHadir), 0))),
    tanpaKapasitas: list.filter((x) => !x.kursi).length,
    minMeetings: list.length ? Math.min(...list.map((x) => x.pertemuan)) : 0,
  };
}

// ------------------------------------------------------------------ insight, langkah, pernyataan

type Built = Awaited<ReturnType<typeof computeForecastData>>;
const nf = (v: number) => Math.round(v).toLocaleString('id-ID');
const monthLabel = (k: string) => new Date(`${k}-01T00:00:00.000Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function buildInsights(d: Built) {
  const out: { tone: 'ok' | 'info' | 'warn' | 'bad'; judul: string; isi: string }[] = [];
  const g6 = d.ringkasan.tumbuh6;
  if (g6 != null) {
    const ms = d.milestones[0];
    out.push({
      tone: g6 >= 0 ? 'ok' : 'bad',
      judul: g6 >= 0 ? 'Pertumbuhan stabil' : 'Jemaat aktif menurun',
      isi: `6 bulan terakhir rata-rata ${g6 >= 0 ? 'naik' : 'turun'} ${Math.abs(g6).toLocaleString('id-ID')}% per bulan.${ms ? ` Jika berlanjut, ${nf(ms.target)} jemaat aktif tercapai sekitar ${monthLabel(ms.month)}.` : ''}`,
    });
  }
  const big = d.perCabang.filter((c) => !c.kecil && c.tumbuhPersen != null);
  if (big.length >= 2) {
    const fast = [...big].sort((a, b) => b.tumbuhPersen! - a.tumbuhPersen!)[0]!;
    const slow = [...big].sort((a, b) => a.tumbuhPersen! - b.tumbuhPersen!)[0]!;
    out.push({ tone: 'info', judul: `${fast.nama} tumbuh tercepat`, isi: `${fast.nama} ${fast.tumbuhPersen! >= 0 ? 'naik' : 'turun'} ${Math.abs(fast.tumbuhPersen!)}% bulan lalu.${slow.tumbuhPersen! < 0 ? ` ${slow.nama} turun ${Math.abs(slow.tumbuhPersen!)}%.` : ''}` });
  }
  if (d.sim.retensi1 != null) out.push({ tone: d.sim.retensi1 >= 75 ? 'ok' : 'warn', judul: `Retensi bulan pertama ${d.sim.retensi1}%`, isi: `${Math.round(100 - d.sim.retensi1)} dari 100 jemaat baru tidak kembali di bulan kedua.` });
  const penuh = d.kapasitas.list.find((x) => x.penuhMulai);
  if (penuh) out.push({ tone: 'warn', judul: 'Kapasitas ibadah', isi: `${penuh.nama} ${penuh.cabang} (${penuh.okupansi}% terisi) diperkirakan penuh sekitar ${monthLabel(penuh.penuhMulai!)}.` });
  const hg = d.homecell.pertumbuhan;
  if (hg && hg.tumbuh12.anggota != null)
    out.push({
      tone: hg.tumbuh12.anggota >= 0 ? 'ok' : 'warn',
      judul: 'Homecell',
      isi: `Anggota homecell ${hg.tumbuh12.anggota >= 0 ? 'naik' : 'turun'} ${Math.abs(hg.tumbuh12.anggota)}% dalam 12 bulan (${nf(hg.sekarang.anggota)} anggota di ${nf(hg.sekarang.homecell)} homecell)${hg.tambahan12 ? `; perlu ±${nf(hg.tambahan12)} homecell baru dalam 12 bulan` : ''}.`,
    });
  if (d.tamu.bulanIni.tamu) out.push({ tone: 'info', judul: 'Tamu', isi: `${nf(d.tamu.bulanIni.tamu)} tamu hadir bulan lalu (${nf(d.tamu.bulanIni.newComer)} New Comer). ${d.tamu.konversi.total ?? 0}% tamu 3 bulan terakhir sudah menjadi jemaat aktif Els App.` });
  return out.slice(0, 7);
}

function buildActions(d: Built) {
  const a: { judul: string; isi: string; skor: number; tone: string }[] = [];
  if (d.tamu.belumFollowUp > 0) a.push({ judul: 'Hubungi tamu baru dalam 7 hari', isi: `${nf(d.tamu.belumFollowUp)} New Comer belum dihubungi tim follow-up. Tamu yang cepat dihubungi lebih mungkin kembali.`, skor: 90 + d.tamu.belumFollowUp, tone: '#EF4444' });
  if (d.sim.retensi1 != null && d.sim.retensi1 < 85) a.push({ judul: 'Ajak jemaat baru masuk homecell', isi: `${Math.round(100 - d.sim.retensi1)} dari 100 jemaat baru berhenti di bulan kedua.${d.homecell.stopIn != null && d.homecell.stopOut != null ? ` Yang ikut homecell berhenti ${d.homecell.stopIn}% per bulan, yang tidak ikut ${d.homecell.stopOut}%.` : ''}`, skor: 85, tone: '#F97316' });
  for (const k of d.kapasitas.list.filter((x) => x.penuhMulai).slice(0, 2)) {
    const alt = d.kapasitas.list.filter((x) => x.cabangId === k.cabangId && x.id !== k.id && (x.okupansi ?? 100) < 60).sort((p, q) => (p.okupansi ?? 0) - (q.okupansi ?? 0))[0];
    a.push({ judul: `Siapkan tempat untuk ${k.nama} ${k.cabang}`, isi: `Diperkirakan penuh sekitar ${monthLabel(k.penuhMulai!)}. Tambah kursi${alt ? `, atau ajak sebagian jemaat ke ${alt.nama} (${alt.okupansi}% terisi)` : ' atau tambah jam ibadah'}.`, skor: 80 - a.length, tone: '#F59E0B' });
  }
  if (d.homecell.perluDibuka > 0) a.push({ judul: 'Buka homecell baru', isi: `±${nf(d.homecell.perluDibuka)} homecell baru dibutuhkan sampai akhir ${d.homecell.sampaiTahun}${d.homecell.perCabang.filter((c) => c.perluDibuka > 0).length ? `, terutama di ${d.homecell.perCabang.filter((c) => c.perluDibuka > 0).slice(0, 2).map((c) => c.nama).join(' & ')}` : ''}.`, skor: 70, tone: '#8B5CF6' });
  const lowStay = d.event.perEvent.find((e) => e.tamu >= 20 && (e.bertahanPersen ?? 100) < 50);
  if (lowStay) a.push({ judul: `Tindak lanjuti peserta ${lowStay.judul}`, isi: 'Event ini mendatangkan banyak tamu, tapi sedikit yang bertahan. Siapkan tim penyambutan & ajak ke homecell.', skor: 60, tone: '#0EA5E9' });
  const down = d.perCabang.filter((c) => !c.kecil && (c.tumbuhPersen ?? 0) < 0).sort((x, y) => x.tumbuhPersen! - y.tumbuhPersen!)[0];
  if (down) a.push({ judul: `Dampingi ${down.nama}`, isi: `Jemaat aktif turun ${Math.abs(down.tumbuhPersen!)}% bulan lalu. Perlu dilihat penyebabnya bersama tim cabang.`, skor: 55, tone: '#64748B' });
  const web = d.platform.ringkasan.find((p) => p.platform === 'web');
  const app = d.platform.ringkasan.filter((p) => p.platform !== 'web' && p.retensi1 != null);
  if (web?.retensi1 != null && app.length && web.retensi1 < Math.min(...app.map((p) => p.retensi1!)) - 10) a.push({ judul: 'Ajak pemakai web memasang app', isi: `Pemakai Els App web lebih cepat berhenti (retensi ${web.retensi1}%). Ajak mereka memasang app di HP.`, skor: 40, tone: '#F59E0B' });
  if (d.kapasitas.tanpaKapasitas > 0) a.push({ judul: 'Isi jumlah kursi ibadah', isi: `${d.kapasitas.tanpaKapasitas} ibadah belum punya jumlah kursi, sehingga kesiapan tempatnya belum bisa dihitung.`, skor: 30, tone: '#64748B' });
  return a.sort((x, y) => y.skor - x.skor).slice(0, 6).map(({ skor: _s, ...r }, i) => ({ no: i + 1, ...r }));
}

function buildStatement(d: Built) {
  const cur = d.ringkasan.aktif;
  const ago = d.ringkasan.setahunLalu;
  const dec = d.perTahun[0];
  const awal = d.maturity.early ? ' (perkiraan awal — data masih sedikit)' : '';
  if (ago != null && ago > 0) {
    const naik = cur >= ago;
    return naik
      ? `Dalam setahun terakhir, keluarga ECC yang terhubung lewat Els App bertumbuh dari ${nf(ago)} menjadi ${nf(cur)} jemaat. Jika kita terus menyambut setiap tamu dan menjaga setiap jemaat tetap terhubung, diperkirakan ±${nf(dec?.value ?? cur)} jemaat aktif di akhir ${dec?.tahun ?? ''}${awal}.`
      : `Dalam setahun terakhir, jemaat yang aktif di Els App turun dari ${nf(ago)} menjadi ${nf(cur)}. Mari kita hubungi kembali jemaat yang lama tidak aktif dan sambut setiap tamu dengan hangat — setiap orang berharga.`;
  }
  return `Saat ini ${nf(cur)} jemaat terhubung lewat Els App. Jika kita terus menyambut setiap tamu dan menjaga setiap jemaat tetap terhubung, diperkirakan ±${nf(dec?.value ?? cur)} jemaat aktif di akhir ${dec?.tahun ?? ''}${awal}.`;
}

// ------------------------------------------------------------------ pertumbuhan homecell

/**
 * Pertumbuhan homecell 24 bulan terakhir: jumlah homecell aktif, anggota aktif,
 * homecell baru, pertemuan & rata-rata hadir per pertemuan; prediksi anggota 12
 * bulan & kebutuhan homecell (anggota ÷ patokan). Homecell nonaktif dianggap
 * berhenti pada tanggal terakhir diubah (perkiraan); data impor lama tercatat
 * di bulan impor.
 */
async function homecellGrowth(cabangId: string | null, lastFull: Date, st: ForecastSettings) {
  const N = 24;
  const months = Array.from({ length: N }, (_, i) => addM(lastFull, i - N + 1));
  const ends = months.map((m) => addM(m, 1).getTime());
  const areaW = cabangId ? { area: { cabangId } } : {};
  const [hcs, members] = await Promise.all([
    prisma.homecell.findMany({ where: areaW, select: { createdAt: true, updatedAt: true, isActive: true } }),
    prisma.homecellMember.findMany({
      where: { homecell: areaW },
      select: { tanggalBergabung: true, tanggalKeluar: true, isActive: true },
    }),
  ]);
  const cab = cabangId ? Prisma.sql`AND a.cabang_id = ${cabangId}::uuid` : Prisma.empty;
  const range = Prisma.sql`s.tanggal >= ${months[0]!}::date AND s.tanggal < ${addM(lastFull, 1)}::date ${cab}`;
  const base = Prisma.sql`JOIN homecell h ON h.id = s.homecell_id JOIN homecell_area a ON a.id = h.area_id`;
  const [qMeet, qHadir, qTamu] = await Promise.all([
    prisma.$queryRaw<{ m: Date; c: bigint }[]>`SELECT date_trunc('month', s.tanggal)::date AS m, COUNT(*) AS c FROM homecell_schedule s ${base} WHERE ${range} GROUP BY 1`,
    prisma.$queryRaw<{ m: Date; c: bigint }[]>`SELECT date_trunc('month', s.tanggal)::date AS m, COUNT(*) AS c FROM homecell_attendance x JOIN homecell_schedule s ON s.id = x.schedule_id ${base} WHERE ${range} GROUP BY 1`,
    prisma.$queryRaw<{ m: Date; c: bigint }[]>`SELECT date_trunc('month', s.tanggal)::date AS m, COUNT(*) AS c FROM homecell_tamu_attendance y JOIN homecell_schedule s ON s.id = y.schedule_id ${base} WHERE ${range} GROUP BY 1`,
  ]);
  const toMap = (rows: { m: Date; c: bigint }[]) => new Map(rows.map((r) => [mk(r.m), n(r.c)]));
  const mMeet = toMap(qMeet);
  const mHadir = toMap(qHadir);
  const mTamu = toMap(qTamu);
  const meet = months.map((m) => ({ m, pertemuan: mMeet.get(mk(m)) ?? 0, hadir: mHadir.get(mk(m)) ?? 0, tamu: mTamu.get(mk(m)) ?? 0 }));
  const meetBy = new Map(meet.map((r) => [mk(r.m), r]));
  const homecell = ends.map((e) => hcs.filter((h) => h.createdAt.getTime() < e && (h.isActive || h.updatedAt.getTime() >= e)).length);
  const baru = months.map((m, i) => hcs.filter((h) => h.createdAt.getTime() >= m.getTime() && h.createdAt.getTime() < ends[i]!).length);
  const anggota = ends.map(
    (e) =>
      members.filter((x) => x.tanggalBergabung.getTime() < e && (x.tanggalKeluar ? x.tanggalKeluar.getTime() >= e : x.isActive)).length,
  );
  const pertemuan = months.map((m) => n(meetBy.get(mk(m))?.pertemuan));
  const hadirRata = months.map((m) => {
    const r = meetBy.get(mk(m));
    return r && n(r.pertemuan) ? Math.round(((n(r.hadir) + n(r.tamu)) / n(r.pertemuan)) * 10) / 10 : null;
  });
  const tamuHadir = months.map((m) => n(meetBy.get(mk(m))?.tamu));
  // Mulai dari bulan pertama yang ada homecell.
  const from = Math.max(0, homecell.findIndex((v) => v > 0));
  const fitM = fitForecast(anggota.slice(from), months[from]!.getUTCMonth(), 12, false);
  const fcAnggota = fitM ? fitM.fc.map(round) : [];
  const fcMonths = Array.from({ length: 12 }, (_, i) => mk(addM(lastFull, i + 1)));
  const curH = homecell[N - 1] ?? 0;
  const curA = anggota[N - 1] ?? 0;
  const ago = (arr: number[], k: number) => (arr[N - 1 - k] ? Math.round(((arr[N - 1]! - arr[N - 1 - k]!) / arr[N - 1 - k]!) * 1000) / 10 : null);
  const butuh12 = fcAnggota.length ? Math.ceil(fcAnggota[fcAnggota.length - 1]! / st.homecellIdeal) : null;
  return {
    months: months.map(mk).slice(from),
    homecell: homecell.slice(from),
    baru: baru.slice(from),
    anggota: anggota.slice(from),
    pertemuan: pertemuan.slice(from),
    hadirRata: hadirRata.slice(from),
    tamuHadir: tamuHadir.slice(from),
    sekarang: { homecell: curH, anggota: curA, rataPerHomecell: curH ? Math.round((curA / curH) * 10) / 10 : null },
    tumbuh3: { homecell: ago(homecell, 3), anggota: ago(anggota, 3) },
    tumbuh12: { homecell: ago(homecell, 12), anggota: ago(anggota, 12) },
    baru12: baru.slice(-12).reduce((a, b) => a + b, 0),
    prediksi: { months: fcMonths, anggota: fcAnggota, homecellDibutuhkan: fcAnggota.map((v) => Math.ceil(v / st.homecellIdeal)) },
    butuh12,
    tambahan12: butuh12 != null ? Math.max(0, butuh12 - curH) : null,
  };
}
