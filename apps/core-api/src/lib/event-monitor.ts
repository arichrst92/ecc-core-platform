/**
 * Monitor Event — ringkasan langsung satu event untuk layar monitor
 * (/public/monitor, kode akses). Hanya angka — tanpa nama / no HP peserta.
 */
import { prisma } from '@ecc/database';
import { BadRequest, NotFound } from './errors.js';
import { DEFAULT_TZ, addDays, calendarDateOf, todayInTz, tzOr, wallToInstant } from './tz.js';
import { appActivity, arrivalCurve, systemHealth } from './monitor-common.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const toMin = (hhmm: string | null | undefined) => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const eventSelect = {
  id: true,
  judul: true,
  tanggalMulai: true,
  tanggalSelesai: true,
  jamMulai: true,
  jamSelesai: true,
  lokasi: true,
  quotaPeserta: true,
  tipeBayar: true,
  butuhKehadiran: true,
  cabang: { select: { id: true, nama: true, timezone: true } },
} as const;

type EventRow = {
  tanggalMulai: Date;
  tanggalSelesai: Date | null;
  jamMulai: string | null;
  jamSelesai: string | null;
  cabang: { timezone: string } | null;
};

/** Jendela waktu event pada hari `day` (untuk event beberapa hari: jam yang sama tiap hari). */
function windowOf(ev: EventRow, tz: string, day?: Date) {
  const d0 = calendarDateOf(ev.tanggalMulai, tz);
  const d1 = ev.tanggalSelesai ? calendarDateOf(ev.tanggalSelesai, tz) : d0;
  const today = day ?? todayInTz(tz);
  const d = today < d0 ? d0 : today > d1 ? d1 : today;
  const sm = toMin(ev.jamMulai) ?? 8 * 60;
  const em = toMin(ev.jamSelesai);
  const start = wallToInstant(d, sm, tz);
  let end = em != null ? wallToInstant(d, em, tz) : new Date(start.getTime() + 3 * 3_600_000);
  if (end <= start) end = new Date(start.getTime() + 3 * 3_600_000);
  return { start, end, firstDay: d0, lastDay: d1, day: d };
}

const statusOf = (now: number, ev: EventRow, tz: string) => {
  const w = windowOf(ev, tz);
  const lastEnd = wallToInstant(w.lastDay, toMin(ev.jamSelesai) ?? 23 * 60 + 59, tz).getTime();
  if (now < wallToInstant(w.firstDay, toMin(ev.jamMulai) ?? 0, tz).getTime()) return 'BELUM' as const;
  if (now > Math.max(lastEnd, w.end.getTime())) return 'SELESAI' as const;
  return now < w.start.getTime() ? ('BELUM' as const) : now <= w.end.getTime() ? ('BERLANGSUNG' as const) : ('SELESAI' as const);
};

/** Event aktif yang berlangsung kemarin s/d 7 hari ke depan (opsional per cabang; event sinode ikut). */
export async function buildEventOptions(cabangId?: string | null) {
  const today = todayInTz(DEFAULT_TZ);
  const from = addDays(today, -1);
  const to = addDays(today, 8);
  const rows = await prisma.event.findMany({
    where: {
      isActive: true,
      tanggalMulai: { lt: to },
      AND: [
        { OR: [{ tanggalSelesai: { gte: from } }, { tanggalSelesai: null, tanggalMulai: { gte: from } }] },
        ...(cabangId && UUID_RE.test(cabangId) ? [{ OR: [{ cabangId }, { cabangId: null }] }] : []),
      ],
    },
    orderBy: { tanggalMulai: 'asc' },
    take: 50,
    select: eventSelect,
  });
  const now = Date.now();
  return {
    items: rows.map((e) => {
      const tz = tzOr(e.cabang?.timezone);
      const w = windowOf(e, tz);
      return {
        id: e.id,
        judul: e.judul,
        tanggal: ymd(w.firstDay),
        tanggalSelesai: ymd(w.lastDay),
        jamMulai: e.jamMulai,
        jamSelesai: e.jamSelesai,
        cabang: e.cabang ? e.cabang.nama : 'Sinode',
        status: statusOf(now, e, tz),
      };
    }),
  };
}

export async function buildEventMonitor(eventId: string | null | undefined) {
  if (!eventId || !UUID_RE.test(eventId)) throw BadRequest('Pilih event.');
  const ev = await prisma.event.findUnique({ where: { id: eventId }, select: eventSelect });
  if (!ev) throw NotFound('Event tidak ditemukan.');
  const now = Date.now();
  const tz = tzOr(ev.cabang?.timezone);
  const w = windowOf(ev, tz);
  const status = statusOf(now, ev, tz);

  const rows = await prisma.eventParticipation.findMany({
    where: { eventId: ev.id },
    select: {
      jemaatId: true,
      status: true,
      attendedAt: true,
      paidAt: true,
      checkinMethod: true,
      guestSource: true,
      jemaat: { select: { isTamu: true } },
    },
  });
  const aktif = rows.filter((r) => r.status !== 'BATAL');
  const hadir = aktif.filter((r) => r.status === 'HADIR');
  const guests = hadir.filter((r) => !!r.guestSource || r.jemaat.isTamu);

  const from = w.start.getTime() - 60 * 60_000;
  const to = Math.min(Math.max(now, from + 5 * 60_000), w.end.getTime() + 30 * 60_000);
  const todays = hadir.map((r) => r.attendedAt).filter((d): d is Date => !!d && d.getTime() >= from - 12 * 3_600_000);
  const arrival = arrivalCurve(todays, from, to, tz);
  const last15 = hadir.filter((r) => r.attendedAt && now - r.attendedAt.getTime() <= 15 * 60_000).length;

  const methods: Record<string, number> = {};
  for (const r of hadir) {
    const k = r.checkinMethod ?? 'LAINNYA';
    methods[k] = (methods[k] ?? 0) + 1;
  }

  // Pertama kali hadir di ECC: belum pernah hadir di event lain / ibadah sebelum event ini.
  const ids = hadir.map((r) => r.jemaatId);
  const [evBefore, ibBefore] = ids.length
    ? await Promise.all([
        prisma.eventParticipation.groupBy({
          by: ['jemaatId'],
          where: { jemaatId: { in: ids }, status: 'HADIR', eventId: { not: ev.id }, attendedAt: { lt: w.firstDay } },
        }),
        prisma.reservasi.groupBy({ by: ['jemaatId'], where: { jemaatId: { in: ids }, status: 'JOIN', tanggalIbadah: { lt: w.firstDay } } }),
      ])
    : [[], []];
  const pernah = new Set([...evBefore.map((x) => x.jemaatId), ...ibBefore.map((x) => x.jemaatId)]);

  const app = appActivity();
  const system = await systemHealth(/\/(event\/:id\/checkin|event-checkin\/:id)$/);

  const alerts: { level: 'danger' | 'warning' | 'info'; text: string }[] = [];
  const quota = ev.quotaPeserta ?? null;
  if (quota) {
    const pct = (aktif.length / quota) * 100;
    if (pct >= 100) alerts.push({ level: 'warning', text: `Kuota peserta penuh: ${aktif.length} dari ${quota}.` });
    else if (pct >= 90) alerts.push({ level: 'info', text: `Kuota peserta hampir penuh (${Math.round(pct)}%).` });
  }
  if (system.checkinSuccessPct != null && system.checkinSuccessPct < 98 && system.checkinRequests >= 10) {
    alerts.push({ level: 'danger', text: `Check-in event sering gagal: sukses ${system.checkinSuccessPct}% dalam 15 menit terakhir.` });
  }
  if (system.p95Ms != null && system.p95Ms > 2000 && system.requests15m >= 30) {
    alerts.push({ level: 'warning', text: `Server melambat: p95 ${(system.p95Ms / 1000).toFixed(1)} dtk dalam 15 menit terakhir.` });
  }
  if (!ev.butuhKehadiran) {
    alerts.push({ level: 'info', text: 'Event ini tidak mencatat kehadiran — angka hadir mungkin kosong.' });
  }

  return {
    updatedAt: new Date(now).toISOString(),
    tz,
    event: {
      id: ev.id,
      judul: ev.judul,
      cabang: ev.cabang ? ev.cabang.nama : 'Sinode',
      lokasi: ev.lokasi,
      tanggal: ymd(w.firstDay),
      tanggalSelesai: ymd(w.lastDay),
      jamMulai: ev.jamMulai,
      jamSelesai: ev.jamSelesai,
      quota,
      berbayar: ev.tipeBayar !== 'GRATIS',
    },
    status,
    startAt: w.start.toISOString(),
    endAt: w.end.toISOString(),
    kehadiran: {
      hadir: hadir.length,
      terdaftar: aktif.length,
      belumDatang: aktif.length - hadir.length,
      batal: rows.length - aktif.length,
      sudahBayar: ev.tipeBayar !== 'GRATIS' ? aktif.filter((r) => r.paidAt).length : null,
      last15m: last15,
    },
    arrival,
    methods,
    tamu: {
      total: guests.length,
      diundang: guests.filter((r) => r.guestSource === 'DIUNDANG').length,
      walkIn: guests.filter((r) => r.guestSource === 'WALK_IN').length,
      pertamaKali: hadir.filter((r) => !pernah.has(r.jemaatId)).length,
    },
    app,
    system,
    alerts,
  };
}
