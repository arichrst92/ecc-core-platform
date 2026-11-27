/**
 * Visualisasi Daftar & Absen (Portal → detail event, 2026-11).
 *
 *  - Pendaftaran harian: H-30 s/d hari terakhir event — daftar & batal, dipisah
 *    Jemaat / New Comer / Visitor; kumulatif pendaftar aktif.
 *  - Absensi per 15 menit: 720 menit sebelum mulai s/d 60 menit setelah selesai
 *    (per hari untuk event beberapa hari), dipisah cara check-in; kumulatif.
 *  - Proporsi cara check-in: Self check-in / Petugas (scan & walk-in) / Absen Portal.
 *  - Tambahan: ringkasan angka, corong (daftar → lunas → hadir), ketepatan waktu,
 *    hadir per kategori, alasan batal, petugas scan teraktif, hadir per cabang.
 *
 * Tamu = data tamu (isTamu) atau datang sebagai tamu (guestSource) — sama dengan
 * laporan & monitor. Kategori NEW_COMER; selain itu (termasuk kosong) = Visitor.
 */
import { prisma } from '@ecc/database';
import { NotFound } from './errors.js';
import { addDays, dateInTz, todayInTz, tzOr } from './tz.js';
import { windowOf } from './event-monitor.js';
import { requiresPayment } from './event-payment.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const BUCKET_MIN = 15;
const BEFORE_MIN = 720;
const AFTER_MIN = 60;
const REG_DAYS_BEFORE = 30;

type Who = 'JEMAAT' | 'NEW_COMER' | 'VISITOR';
type MethodGroup = 'SELF' | 'PETUGAS' | 'PORTAL' | 'LAINNYA';

const methodGroup = (m: string | null): MethodGroup =>
  m === 'SELF' ? 'SELF' : m === 'SCAN' || m === 'LATE' || m === 'WALK_IN' ? 'PETUGAS' : m === 'MANUAL' ? 'PORTAL' : 'LAINNYA';

const CANCEL_LABEL: Record<string, string> = {
  FORM_AUTO: 'Formulir tidak diisi (otomatis)',
  FORM_ADMIN: 'Formulir ditolak admin',
  NO_SHOW: 'Tidak hadir (otomatis)',
};

const hhmm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);

export async function buildEventVisual(eventId: string, dayParam?: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) throw NotFound('Event tidak ditemukan');
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      judul: true,
      tanggalMulai: true,
      tanggalSelesai: true,
      jamMulai: true,
      jamSelesai: true,
      quotaPeserta: true,
      tipeBayar: true,
      nominal: true,
      butuhKehadiran: true,
      cabang: { select: { id: true, nama: true, timezone: true } },
    },
  });
  if (!ev) throw NotFound('Event tidak ditemukan');
  const tz = tzOr(ev.cabang?.timezone);
  const paid = requiresPayment(ev);

  const rows = await prisma.eventParticipation.findMany({
    where: { eventId: ev.id },
    select: {
      status: true,
      registeredAt: true,
      cancelledAt: true,
      cancelReason: true,
      attendedAt: true,
      paidAt: true,
      checkinMethod: true,
      checkedInBy: true,
      guestSource: true,
      jemaat: { select: { isTamu: true, tamuKategori: true, cabang: { select: { nama: true } } } },
    },
  });
  const who = (r: (typeof rows)[number]): Who =>
    r.jemaat.isTamu || !!r.guestSource ? (r.jemaat.tamuKategori === 'NEW_COMER' ? 'NEW_COMER' : 'VISITOR') : 'JEMAAT';

  // ------------------------------------------------------------ pendaftaran harian
  const w0 = windowOf(ev, tz);
  const firstDay = w0.firstDay;
  const lastDay = w0.lastDay;
  const regFrom = addDays(firstDay, -REG_DAYS_BEFORE);
  const dayKeys: string[] = [];
  for (let d = regFrom; d <= lastDay && dayKeys.length < 400; d = addDays(d, 1)) dayKeys.push(ymd(d));
  const idx = new Map(dayKeys.map((k, i) => [k, i]));
  const zero = () => dayKeys.map(() => 0);
  const daftar: Record<Who, number[]> = { JEMAAT: zero(), NEW_COMER: zero(), VISITOR: zero() };
  const batal: Record<Who, number[]> = { JEMAAT: zero(), NEW_COMER: zero(), VISITOR: zero() };
  let regBefore = 0;
  let cancelBefore = 0;
  let regAfter = 0;
  for (const r of rows) {
    const k = ymd(dateInTz(r.registeredAt, tz));
    const i = idx.get(k);
    if (i != null) daftar[who(r)][i]!++;
    else if (k < dayKeys[0]!) regBefore++;
    else regAfter++;
    if (r.status === 'BATAL' && r.cancelledAt) {
      const kc = ymd(dateInTz(r.cancelledAt, tz));
      const ic = idx.get(kc);
      if (ic != null) batal[who(r)][ic]!++;
      else if (kc < dayKeys[0]!) cancelBefore++;
    }
  }
  const kumulatif: number[] = [];
  let run = regBefore - cancelBefore;
  for (let i = 0; i < dayKeys.length; i++) {
    run +=
      daftar.JEMAAT[i]! + daftar.NEW_COMER[i]! + daftar.VISITOR[i]! - (batal.JEMAAT[i]! + batal.NEW_COMER[i]! + batal.VISITOR[i]!);
    kumulatif.push(run);
  }

  // ------------------------------------------------------------ absensi per 15 menit
  const hadir = rows.filter((r) => r.status === 'HADIR' && r.attendedAt);
  const days: { tanggal: string; hadir: number }[] = [];
  for (let d = firstDay; d <= lastDay && days.length < 31; d = addDays(d, 1)) {
    const key = ymd(d);
    days.push({ tanggal: key, hadir: hadir.filter((r) => ymd(dateInTz(r.attendedAt!, tz)) === key).length });
  }
  const today = ymd(todayInTz(tz));
  const pick =
    (dayParam && days.find((x) => x.tanggal === dayParam)?.tanggal) ||
    days.find((x) => x.tanggal === today)?.tanggal ||
    [...days].sort((a, b) => b.hadir - a.hadir)[0]?.tanggal ||
    ymd(firstDay);
  const wd = windowOf(ev, tz, new Date(`${pick}T00:00:00.000Z`));
  const aFrom = wd.start.getTime() - BEFORE_MIN * 60_000;
  const aTo = wd.end.getTime() + AFTER_MIN * 60_000;
  const nB = Math.max(1, Math.ceil((aTo - aFrom) / (BUCKET_MIN * 60_000)));
  const slots = Array.from({ length: nB }, (_, i) => new Date(aFrom + i * BUCKET_MIN * 60_000));
  const per: Record<MethodGroup, number[]> = {
    SELF: slots.map(() => 0),
    PETUGAS: slots.map(() => 0),
    PORTAL: slots.map(() => 0),
    LAINNYA: slots.map(() => 0),
  };
  const perWho: Record<Who, number[]> = { JEMAAT: slots.map(() => 0), NEW_COMER: slots.map(() => 0), VISITOR: slots.map(() => 0) };
  let outside = 0;
  for (const r of hadir) {
    const t = r.attendedAt!.getTime();
    if (ymd(dateInTz(r.attendedAt!, tz)) !== pick && (t < aFrom || t >= aTo)) continue; // hari lain
    if (t < aFrom || t >= aTo) {
      outside++;
      continue;
    }
    const b = Math.min(nB - 1, Math.floor((t - aFrom) / (BUCKET_MIN * 60_000)));
    per[methodGroup(r.checkinMethod)][b]!++;
    perWho[who(r)][b]!++;
  }
  const absKum: number[] = [];
  let ak = 0;
  for (let i = 0; i < nB; i++) {
    ak += per.SELF[i]! + per.PETUGAS[i]! + per.PORTAL[i]! + per.LAINNYA[i]!;
    absKum.push(ak);
  }
  let peakIdx = -1;
  let peakVal = 0;
  for (let i = 0; i < nB; i++) {
    const v = per.SELF[i]! + per.PETUGAS[i]! + per.PORTAL[i]! + per.LAINNYA[i]!;
    if (v > peakVal) {
      peakVal = v;
      peakIdx = i;
    }
  }

  // ------------------------------------------------------------ ringkasan & tambahan
  const aktif = rows.filter((r) => r.status !== 'BATAL');
  const batalRows = rows.filter((r) => r.status === 'BATAL');
  const count = <T extends string>(xs: T[]) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {} as Record<T, number>);
  const metode = count(hadir.map((r) => methodGroup(r.checkinMethod)));
  const hadirWho = count(hadir.map(who));
  const aktifWho = count(aktif.map(who));
  // Datang tanpa daftar = partisipasi dibuat saat check-in (walk-in / event tanpa daftar).
  const tanpaDaftar = hadir.filter((r) => Math.abs(r.attendedAt!.getTime() - r.registeredAt.getTime()) < 120_000).length;

  // Ketepatan waktu — terhadap jam mulai di hari check-in masing-masing.
  const tepat = { sebelum: 0, telat15: 0, telatLebih: 0 };
  for (const r of hadir) {
    const start = windowOf(ev, tz, dateInTz(r.attendedAt!, tz)).start.getTime();
    const diff = (r.attendedAt!.getTime() - start) / 60_000;
    if (diff <= 0) tepat.sebelum++;
    else if (diff <= 15) tepat.telat15++;
    else tepat.telatLebih++;
  }

  const alasan = count(batalRows.map((r) => (r.cancelReason && CANCEL_LABEL[r.cancelReason]) || 'Dibatalkan peserta / admin'));

  // Petugas scan teraktif (checkedInBy = user id).
  const byUser = count(hadir.filter((r) => methodGroup(r.checkinMethod) === 'PETUGAS' && r.checkedInBy).map((r) => r.checkedInBy!));
  const topIds = Object.entries(byUser)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const users = topIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topIds.map(([id]) => id) } },
        select: { id: true, jemaat: { select: { namaLengkap: true } } },
      })
    : [];
  const userName = new Map(users.map((u) => [u.id, u.jemaat?.namaLengkap ?? 'Petugas']));
  const petugas = topIds.map(([id, n]) => ({ nama: userName.get(id) ?? 'Petugas', jumlah: n }));

  const cabang = Object.entries(count(hadir.map((r) => r.jemaat.cabang?.nama ?? 'Tanpa cabang')))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([nama, jumlah]) => ({ nama, jumlah }));

  const now = Date.now();
  const lastEnd = windowOf(ev, tz, lastDay).end.getTime();
  return {
    event: {
      id: ev.id,
      judul: ev.judul,
      butuhKehadiran: ev.butuhKehadiran,
      berbayar: paid,
      kuota: ev.quotaPeserta ?? null,
      tanggalMulai: ymd(firstDay),
      tanggalSelesai: ymd(lastDay),
      jamMulai: ev.jamMulai,
      jamSelesai: ev.jamSelesai,
      timezone: tz,
      selesai: now > lastEnd,
    },
    ringkasan: {
      totalDaftar: rows.length,
      aktif: aktif.length,
      batal: batalRows.length,
      hadir: hadir.length,
      belumHadir: aktif.length - hadir.length,
      lunas: paid ? aktif.filter((r) => r.status === 'BAYAR' || r.status === 'HADIR' || !!r.paidAt).length : null,
      menungguVerifikasi: paid ? aktif.filter((r) => r.status === 'MENUNGGU_VERIFIKASI').length : null,
      tanpaDaftar,
      aktifPer: { JEMAAT: aktifWho.JEMAAT ?? 0, NEW_COMER: aktifWho.NEW_COMER ?? 0, VISITOR: aktifWho.VISITOR ?? 0 },
      hadirPer: { JEMAAT: hadirWho.JEMAAT ?? 0, NEW_COMER: hadirWho.NEW_COMER ?? 0, VISITOR: hadirWho.VISITOR ?? 0 },
    },
    pendaftaran: {
      tanggal: dayKeys,
      hariAcara: days.map((d) => d.tanggal),
      daftar,
      batal,
      kumulatif,
      sebelumRentang: regBefore,
      setelahRentang: regAfter,
    },
    absensi: {
      hari: days,
      tanggal: pick,
      menitPerBatang: BUCKET_MIN,
      jam: slots.map((s) => hhmm(s, tz)),
      mulaiIdx: Math.floor((wd.start.getTime() - aFrom) / (BUCKET_MIN * 60_000)),
      selesaiIdx: Math.min(nB - 1, Math.floor((wd.end.getTime() - aFrom) / (BUCKET_MIN * 60_000))),
      metode: per,
      kategori: perWho,
      kumulatif: absKum,
      puncak: peakIdx >= 0 ? { jam: hhmm(slots[peakIdx]!, tz), jumlah: peakVal } : null,
      diluarRentang: outside,
    },
    proporsi: {
      SELF: metode.SELF ?? 0,
      PETUGAS: metode.PETUGAS ?? 0,
      PORTAL: metode.PORTAL ?? 0,
      LAINNYA: metode.LAINNYA ?? 0,
    },
    ketepatan: tepat,
    alasanBatal: Object.entries(alasan).map(([label, jumlah]) => ({ label, jumlah })),
    petugas,
    cabang,
  };
}
