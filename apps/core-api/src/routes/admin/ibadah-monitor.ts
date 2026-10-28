/**
 * Monitor Ibadah — layar command room (menu: monitor-ibadah) — /admin/ibadah-monitor
 *
 *   GET /options?cabangId=                 ibadah hari ini di cabang (untuk pilihan)
 *   GET /?cabangId=&ibadahId=&tanggal=     ringkasan langsung satu ibadah
 *       (tanpa ibadahId → otomatis: ibadah yang sedang / akan berlangsung)
 *
 * Hanya angka & nama petugas scan — tanpa no HP, alamat, atau catatan anak.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { generateOccurrences } from '../../lib/ibadah-occurrences.js';
import { todayInTz, tzOr, wallToInstant } from '../../lib/tz.js';
import { appActivity, systemHealth } from '../../lib/monitor-common.js';

export const ibadahMonitorRouter = Router();
ibadahMonitorRouter.use(requireMenu('monitor-ibadah'));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const ibadahSelect = {
  id: true,
  nama: true,
  tipeJadwal: true,
  tanggalMulai: true,
  hari: true,
  jamMulai: true,
  jamSelesai: true,
  kapasitasSeat: true,
  isKidsIbadah: true,
  isOnline: true,
  linkOnline: true,
  lokasi: true,
  cabang: { select: { id: true, nama: true, timezone: true } },
} as const;

async function cabangById(id: string | null | undefined) {
  if (id && UUID_RE.test(id)) {
    const c = await prisma.cabangGereja.findUnique({ where: { id }, select: { id: true, nama: true, timezone: true } });
    if (c) return c;
  }
  return null;
}

/** Ibadah aktif di cabang yang berlangsung pada `tanggal` (bukan dibatalkan). */
async function occurrencesOn(cabangId: string, tanggal: Date) {
  const list = await prisma.ibadah.findMany({
    where: { cabangId, isActive: true },
    select: { ...ibadahSelect, occurrenceStatuses: { where: { tanggalIbadah: tanggal }, select: { status: true } } },
  });
  return list
    .filter((ib) => ib.occurrenceStatuses.length === 0 && generateOccurrences(ib, tanggal, tanggal).length > 0)
    .sort((a, b) => a.jamMulai.localeCompare(b.jamMulai));
}

function windowOf(ib: { jamMulai: string; jamSelesai: string }, tanggal: Date, tz: string) {
  const start = wallToInstant(tanggal, toMin(ib.jamMulai), tz);
  let end = wallToInstant(tanggal, toMin(ib.jamSelesai), tz);
  if (end <= start) end = new Date(start.getTime() + 2 * 3_600_000);
  return { start, end };
}

const statusOf = (now: number, start: Date, end: Date) =>
  now < start.getTime() ? 'BELUM' : now <= end.getTime() ? 'BERLANGSUNG' : 'SELESAI';

/** Ibadah hari ini di cabang (untuk pilihan). null = cabang tidak valid. */
export async function buildIbadahOptions(cabangId: string | null | undefined) {
  const c = await cabangById(cabangId);
  if (!c) return null;
  const tz = tzOr(c.timezone);
  const tanggal = todayInTz(tz);
  const now = Date.now();
  const list = await occurrencesOn(c.id, tanggal);
  return {
    tanggal: ymd(tanggal),
    cabang: { id: c.id, nama: c.nama },
    items: list.map((ib) => {
      const w = windowOf(ib, tanggal, tz);
      return { id: ib.id, nama: ib.nama, jamMulai: ib.jamMulai, jamSelesai: ib.jamSelesai, isKidsIbadah: ib.isKidsIbadah, status: statusOf(now, w.start, w.end) };
    }),
  };
}

ibadahMonitorRouter.get('/options', async (req, res) => {
  const data = await buildIbadahOptions(typeof req.query.cabangId === 'string' ? req.query.cabangId : null);
  if (!data) throw BadRequest('cabangId wajib diisi.');
  res.json({ success: true, data });
});

ibadahMonitorRouter.get('/', async (req, res) => {
  const str = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : null);
  res.json({ success: true, data: await buildIbadahMonitor({ ibadahId: str('ibadahId'), cabangId: str('cabangId'), tanggal: str('tanggal') }) });
});

/**
 * Ringkasan langsung satu ibadah. Tanpa ibadahId → ibadah cabang yang sedang
 * / akan berlangsung hari ini. Dipakai portal (JWT) & /public/monitor (kode akses).
 */
export async function buildIbadahMonitor(q: { ibadahId?: string | null; cabangId?: string | null; tanggal?: string | null; lang?: string | null }) {
  const en = q.lang === 'en';
  const L = (id: string, eng: string) => (en ? eng : id);
  const now = Date.now();
  const qIbadah = q.ibadahId && UUID_RE.test(q.ibadahId) ? q.ibadahId : null;
  const qTanggal = q.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(q.tanggal) ? q.tanggal : null;

  // ---- tentukan ibadah & tanggal
  let ib: Awaited<ReturnType<typeof occurrencesOn>>[number] | null = null;
  let tanggal: Date;
  if (qIbadah) {
    const found = await prisma.ibadah.findUnique({
      where: { id: qIbadah },
      select: { ...ibadahSelect, occurrenceStatuses: { take: 0, select: { status: true } } },
    });
    if (!found) throw NotFound('Ibadah tidak ditemukan.');
    ib = found;
    tanggal = qTanggal ? new Date(`${qTanggal}T00:00:00.000Z`) : todayInTz(tzOr(found.cabang.timezone));
  } else {
    const c = await cabangById(q.cabangId);
    if (!c) throw BadRequest('Pilih cabang atau ibadah.');
    const tz = tzOr(c.timezone);
    tanggal = todayInTz(tz);
    const list = (await occurrencesOn(c.id, tanggal)).filter((x) => !x.isKidsIbadah);
    // Berlangsung (atau ≤ 90 menit lagi) → yang paling dekat; selain itu yang berikutnya; selain itu yang terakhir.
    const withW = list.map((x) => ({ x, w: windowOf(x, tanggal, tz) }));
    const running = withW.find(({ w }) => now >= w.start.getTime() - 90 * 60_000 && now <= w.end.getTime() + 30 * 60_000);
    const next = withW.find(({ w }) => w.start.getTime() > now);
    ib = (running ?? next ?? withW[withW.length - 1])?.x ?? null;
    if (!ib) {
      return { empty: true as const, cabang: { id: c.id, nama: c.nama }, tanggal: ymd(tanggal) };
    }
  }
  const tz = tzOr(ib.cabang.timezone);
  const { start, end } = windowOf(ib, tanggal, tz);
  const status = statusOf(now, start, end);

  // ---- reservasi & kehadiran
  const rows = await prisma.reservasi.findMany({
    where: { ibadahId: ib.id, tanggalIbadah: tanggal },
    select: {
      jemaatId: true,
      status: true,
      joinedAt: true,
      checkinMethod: true,
      checkedInBy: true,
      guestSource: true,
      jemaat: { select: { isTamu: true, _count: { select: { tamuHomecell: true } } } },
    },
  });
  const aktif = rows.filter((r) => r.status !== 'CANCEL');
  const hadir = aktif.filter((r) => r.status === 'JOIN');
  const isGuest = (r: (typeof rows)[number]) => !!r.guestSource || r.jemaat.isTamu;

  // Kurva kedatangan per 5 menit: 60 menit sebelum mulai → selesai + 30 (dibatasi sekarang).
  const binMs = 5 * 60_000;
  const from = start.getTime() - 60 * 60_000;
  const to = Math.min(Math.max(now, from + binMs), end.getTime() + 30 * 60_000);
  const nb = Math.max(1, Math.ceil((to - from) / binMs));
  const bins = new Array(nb).fill(0) as number[];
  let before = 0;
  for (const r of hadir) {
    const t = r.joinedAt?.getTime();
    if (t == null) continue;
    if (t < from) before++;
    else {
      const i = Math.min(nb - 1, Math.floor((t - from) / binMs));
      bins[i]!++;
    }
  }
  let cum = before;
  const arrival = bins.map((c, i) => {
    cum += c;
    return {
      t: new Date(from + i * binMs).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: tz }),
      n: c,
      cum,
    };
  });
  const last15 = hadir.filter((r) => r.joinedAt && now - r.joinedAt.getTime() <= 15 * 60_000).length;

  // Cara check-in & petugas scan
  const methods: Record<string, number> = {};
  for (const r of hadir) {
    const k = r.checkinMethod ?? 'LAINNYA';
    methods[k] = (methods[k] ?? 0) + 1;
  }
  const scanCount = new Map<string, number>();
  for (const r of hadir) if (r.checkedInBy) scanCount.set(r.checkedInBy, (scanCount.get(r.checkedInBy) ?? 0) + 1);
  const scanUsers = scanCount.size
    ? await prisma.user.findMany({
        where: { id: { in: [...scanCount.keys()] } },
        select: { id: true, jemaat: { select: { namaLengkap: true } } },
      })
    : [];
  const scanners = [...scanCount.entries()]
    .map(([id, c]) => ({ nama: scanUsers.find((u) => u.id === id)?.jemaat?.namaLengkap ?? 'Petugas', n: c }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  // Tamu & pertama kali hadir
  const guests = hadir.filter(isGuest);
  const hadirIds = hadir.map((r) => r.jemaatId);
  const pernah = hadirIds.length
    ? await prisma.reservasi.groupBy({
        by: ['jemaatId'],
        where: { jemaatId: { in: hadirIds }, status: 'JOIN', tanggalIbadah: { lt: tanggal } },
      })
    : [];
  const pernahSet = new Set(pernah.map((p) => p.jemaatId));

  // Pembanding: kebaktian sebelumnya dari ibadah yang sama (pada jam yang sama).
  const prev = await prisma.reservasi.findFirst({
    where: { ibadahId: ib.id, tanggalIbadah: { lt: tanggal }, status: 'JOIN' },
    orderBy: { tanggalIbadah: 'desc' },
    select: { tanggalIbadah: true },
  });
  let lastWeek: { tanggal: string; hadir: number; hadirSaatIni: number; reservasi: number } | null = null;
  if (prev) {
    const pw = windowOf(ib, prev.tanggalIbadah, tz);
    const elapsed = Math.max(0, now - start.getTime());
    const cutoff = new Date(pw.start.getTime() + (status === 'BELUM' ? -(start.getTime() - now) : elapsed));
    const [h, hs, r] = await Promise.all([
      prisma.reservasi.count({ where: { ibadahId: ib.id, tanggalIbadah: prev.tanggalIbadah, status: 'JOIN' } }),
      prisma.reservasi.count({ where: { ibadahId: ib.id, tanggalIbadah: prev.tanggalIbadah, status: 'JOIN', joinedAt: { lte: cutoff } } }),
      prisma.reservasi.count({ where: { ibadahId: ib.id, tanggalIbadah: prev.tanggalIbadah, status: { not: 'CANCEL' } } }),
    ]);
    lastWeek = { tanggal: ymd(prev.tanggalIbadah), hadir: h, hadirSaatIni: hs, reservasi: r };
  }

  // CKids: ibadah anak di cabang yang sama, hari yang sama, waktunya bersinggungan.
  const sameDay = await occurrencesOn(ib.cabang.id, tanggal);
  const kids = sameDay.filter((k) => {
    if (!k.isKidsIbadah) return false;
    if (k.id === ib!.id) return true;
    const w = windowOf(k, tanggal, tz);
    return w.start < end && w.end > start;
  });
  const ckids = await Promise.all(
    kids.map(async (k) => {
      const w = windowOf(k, tanggal, tz);
      const [h, belum] = await Promise.all([
        prisma.reservasi.count({ where: { ibadahId: k.id, tanggalIbadah: tanggal, status: 'JOIN' } }),
        prisma.reservasi.count({
          where: { ibadahId: k.id, tanggalIbadah: tanggal, status: 'JOIN', pickupCode: { not: null }, pickedUpAt: null, checkedOutAt: null },
        }),
      ]);
      return {
        id: k.id,
        nama: k.nama,
        jamMulai: k.jamMulai,
        jamSelesai: k.jamSelesai,
        hadir: h,
        belumDijemput: belum,
        menitSejakSelesai: now > w.end.getTime() ? Math.floor((now - w.end.getTime()) / 60_000) : null,
      };
    }),
  );

  // Els App (seluruh cabang) & kondisi sistem 15 menit terakhir.
  const app = appActivity();
  const system = await systemHealth(/\/(self-)?checkin$/);

  // ---- peringatan
  const alerts: { level: 'danger' | 'warning' | 'info'; text: string }[] = [];
  const cap = ib.kapasitasSeat ?? null;
  if (cap) {
    const pct = (hadir.length / cap) * 100;
    if (pct >= 100) alerts.push({ level: 'danger', text: L(`Kursi penuh: ${hadir.length} hadir dari ${cap} kursi.`, `Seats full: ${hadir.length} present of ${cap} seats.`) });
    else if (pct >= 90) alerts.push({ level: 'warning', text: L(`Kursi hampir penuh (${Math.round(pct)}%).`, `Seats almost full (${Math.round(pct)}%).`) });
  }
  for (const k of ckids) {
    if (k.belumDijemput > 0 && k.menitSejakSelesai != null && k.menitSejakSelesai >= 15) {
      alerts.push({ level: 'danger', text: L(
          `${k.belumDijemput} anak di ${k.nama} belum dijemput (${k.menitSejakSelesai} menit setelah selesai).`,
          `${k.belumDijemput} children in ${k.nama} not picked up yet (${k.menitSejakSelesai} min after the end).`,
        ) });
    }
  }
  if (system.checkinSuccessPct != null && system.checkinSuccessPct < 98 && system.checkinRequests >= 10) {
    alerts.push({ level: 'danger', text: L(`Check-in sering gagal: sukses ${system.checkinSuccessPct}% dalam 15 menit terakhir.`, `Check-in failing often: ${system.checkinSuccessPct}% success in the last 15 minutes.`) });
  }
  if (system.p95Ms != null && system.p95Ms > 2000 && system.requests15m >= 30) {
    alerts.push({ level: 'warning', text: L(`Server melambat: p95 ${(system.p95Ms / 1000).toFixed(1)} dtk dalam 15 menit terakhir.`, `Server slow: p95 ${(system.p95Ms / 1000).toFixed(1)} s in the last 15 minutes.`) });
  }
  if (lastWeek && status === 'BERLANGSUNG' && now - start.getTime() >= 10 * 60_000 && lastWeek.hadirSaatIni >= 20) {
    const diff = (hadir.length - lastWeek.hadirSaatIni) / lastWeek.hadirSaatIni;
    if (diff <= -0.25) {
      alerts.push({ level: 'warning', text: L(`Kehadiran ${Math.round(-diff * 100)}% di bawah kebaktian sebelumnya pada jam yang sama.`, `Attendance ${Math.round(-diff * 100)}% below the previous service at the same time.`) });
    }
  }

  return {
      empty: false as const,
      updatedAt: new Date(now).toISOString(),
      tz,
      tanggal: ymd(tanggal),
      ibadah: {
        id: ib.id,
        nama: ib.nama,
        cabang: { id: ib.cabang.id, nama: ib.cabang.nama },
        lokasi: ib.lokasi,
        jamMulai: ib.jamMulai,
        jamSelesai: ib.jamSelesai,
        kapasitasSeat: cap,
        isKidsIbadah: ib.isKidsIbadah,
        linkOnline: ib.isOnline ? ib.linkOnline : null,
      },
      status,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      kehadiran: {
        hadir: hadir.length,
        reservasi: aktif.length,
        belumDatang: aktif.length - hadir.length,
        batal: rows.length - aktif.length,
        tamu: guests.length,
        last15m: last15,
      },
      arrival,
      methods,
      scanners,
      tamu: {
        total: guests.length,
        diundang: guests.filter((r) => r.guestSource === 'DIUNDANG').length,
        walkIn: guests.filter((r) => r.guestSource === 'WALK_IN').length,
        homecell: guests.filter((r) => r.jemaat._count.tamuHomecell > 0).length,
        pertamaKali: hadir.filter((r) => !pernahSet.has(r.jemaatId)).length,
      },
      lastWeek,
      ckids,
      app,
      system,
      alerts,
  };
}

