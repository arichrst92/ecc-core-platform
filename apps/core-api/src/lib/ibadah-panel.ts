/**
 * Panel halaman Kehadiran (Portal, 2026-11) — setara detail event:
 *   - "Ibadah yang dituju": pertemuan terdekat (hari ini s/d 6 hari ke depan)
 *     untuk dipilih cepat, dengan status Akan datang / Berlangsung / Selesai.
 *   - Info pertemuan terpilih + "Aturan ibadah ini" dalam bahasa sederhana
 *     (jam dihitung dari aturan server yang sebenarnya).
 *   - Siapa yang berwenang scan check-in ibadah itu.
 */
import { prisma } from '@ecc/database';
import { NotFound } from './errors.js';
import { generateOccurrences } from './ibadah-occurrences.js';
import {
  CHECKIN_CFG_SELECT,
  checkinBounds,
  closeRuleText,
  fmtMenit,
  formatMeters,
  hhmmToMin,
  openRuleText,
  regCloseRuleText,
} from './self-checkin.js';
import { SCAN_AFTER_MIN, SCAN_BEFORE_MIN } from './scan-window.js';
import { KIDS_MAX_AGE, RESERVE_DAYS_AHEAD, reservasiClosesAt } from './reservasi-window.js';
import { addDays, instantInTzLabel, todayInTz, tzOr, wallToInstant } from './tz.js';
import type { EventRule } from './event-rules-text.js';

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OccStatus = 'AKAN' | 'BERLANGSUNG' | 'SELESAI' | 'DIBATALKAN' | 'TIDAK_DIJADWALKAN';

const ibadahSelect = {
  id: true,
  nama: true,
  isActive: true,
  tipeJadwal: true,
  tanggalMulai: true,
  hari: true,
  mingguKe: true,
  jamMulai: true,
  jamSelesai: true,
  lokasi: true,
  latitude: true,
  selfCheckinRadiusM: true,
  kapasitasSeat: true,
  isOnline: true,
  isKidsIbadah: true,
  allowKidsSelfCheckin: true,
  requiresCheckout: true,
  ...CHECKIN_CFG_SELECT,
  cabang: { select: { id: true, nama: true, kota: true, timezone: true, latitude: true } },
} as const;

/** Jam mulai/selesai pertemuan (selesai ≤ mulai → akhir hari). */
function bounds(ib: { jamMulai: string; jamSelesai: string }, day: Date, tz: string) {
  const sm = hhmmToMin(ib.jamMulai) ?? 0;
  let em = hhmmToMin(ib.jamSelesai) ?? 24 * 60 - 1;
  if (em <= sm) em = 24 * 60 - 1;
  return { start: wallToInstant(day, sm, tz), end: wallToInstant(day, em, tz), sm, em };
}

function statusOf(now: number, start: Date, end: Date, cancelled: boolean): OccStatus {
  if (cancelled) return 'DIBATALKAN';
  if (now < start.getTime()) return 'AKAN';
  if (now <= end.getTime()) return 'BERLANGSUNG';
  return 'SELESAI';
}

/** Pertemuan ibadah aktif hari ini s/d 6 hari ke depan (terdekat dulu; yang selesai > 3 jam lalu dibuang). */
export async function upcomingIbadah(cabangId?: string) {
  const ibs = await prisma.ibadah.findMany({
    where: { isActive: true, ...(cabangId && UUID.test(cabangId) ? { cabangId } : {}) },
    select: ibadahSelect,
    take: 300,
  });
  const now = Date.now();
  const out: {
    ibadahId: string;
    nama: string;
    cabang: string | null;
    tanggal: string;
    jamMulai: string;
    jamSelesai: string;
    startAt: string;
    status: OccStatus;
    isKidsIbadah: boolean;
  }[] = [];
  const cancelledRows = await prisma.ibadahOccurrenceStatus.findMany({
    where: { ibadahId: { in: ibs.map((i) => i.id) }, status: 'CANCELLED', tanggalIbadah: { gte: addDays(todayInTz('Etc/GMT+12'), -1) } },
    select: { ibadahId: true, tanggalIbadah: true },
  });
  const cancelled = new Set(cancelledRows.map((c) => `${c.ibadahId}|${ymd(c.tanggalIbadah)}`));
  for (const ib of ibs) {
    const tz = tzOr(ib.cabang?.timezone);
    const today = todayInTz(tz);
    for (const d of generateOccurrences(ib, today, addDays(today, 6))) {
      const { start, end } = bounds(ib, d, tz);
      if (end.getTime() < now - 3 * 3_600_000) continue;
      out.push({
        ibadahId: ib.id,
        nama: ib.nama,
        cabang: ib.cabang?.nama ?? null,
        tanggal: ymd(d),
        jamMulai: ib.jamMulai,
        jamSelesai: ib.jamSelesai,
        startAt: start.toISOString(),
        status: statusOf(now, start, end, cancelled.has(`${ib.id}|${ymd(d)}`)),
        isKidsIbadah: ib.isKidsIbadah,
      });
    }
  }
  // Berlangsung dulu, lalu yang paling dekat.
  out.sort(
    (a, b) =>
      Number(b.status === 'BERLANGSUNG') - Number(a.status === 'BERLANGSUNG') ||
      Math.abs(Date.parse(a.startAt) - now) - Math.abs(Date.parse(b.startAt) - now),
  );
  return out.slice(0, 40);
}

/** Info satu pertemuan + aturan + petugas scan. */
export async function ibadahPanel(ibadahId: string, tanggal: string) {
  if (!UUID.test(ibadahId) || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw NotFound('Ibadah tidak ditemukan');
  const ib = await prisma.ibadah.findUnique({ where: { id: ibadahId }, select: ibadahSelect });
  if (!ib) throw NotFound('Ibadah tidak ditemukan');
  const tz = tzOr(ib.cabang?.timezone);
  const cab = ib.cabang ? { nama: ib.cabang.nama, kota: ib.cabang.kota } : undefined;
  const at = (d: Date) => instantInTzLabel(d, tz, true, cab);
  const day = new Date(`${tanggal}T00:00:00.000Z`);
  const scheduled = generateOccurrences(ib, day, day).length > 0;
  const cancelled = !!(await prisma.ibadahOccurrenceStatus.findFirst({
    where: { ibadahId, tanggalIbadah: day, status: 'CANCELLED' },
    select: { id: true },
  }));
  const { start, end, sm, em } = bounds(ib, day, tz);
  const now = Date.now();
  const status: OccStatus = !scheduled ? 'TIDAK_DIJADWALKAN' : statusOf(now, start, end, cancelled);
  const b = checkinBounds(day, sm, day, em, tz, ib);
  const kidsDesk = ib.isKidsIbadah && !ib.allowKidsSelfCheckin;

  const rules: EventRule[] = [];
  if (!scheduled) {
    rules.push({ key: 'jadwal', judul: 'Tidak ada jadwal', isi: `Tanggal ini bukan jadwal ibadah "${ib.nama}". Pilih tanggal lain.`, tone: 'warn' });
  } else if (cancelled) {
    rules.push({ key: 'jadwal', judul: 'Ibadah dibatalkan', isi: 'Pertemuan di tanggal ini dibatalkan — reservasi & check-in tidak dibuka.', tone: 'warn' });
  }
  rules.push({
    key: 'daftar',
    judul: 'Reservasi',
    isi: `Jemaat reservasi lewat Els App, paling cepat ${RESERVE_DAYS_AHEAD} hari sebelumnya, sampai ${regCloseRuleText(ib, 'ibadah')} (${at(
      reservasiClosesAt(tanggal, ib.jamMulai, tz, ib),
    )}).${ib.isKidsIbadah ? ` Ibadah anak: hanya untuk anak sampai usia ${KIDS_MAX_AGE} tahun, didaftarkan orang tua / wali.` : ''} Tanpa reservasi pun jemaat tetap bisa hadir — petugas mencatatnya saat datang.`,
    tone: 'info',
  });
  rules.push({
    key: 'kuota',
    judul: 'Kapasitas',
    isi: ib.kapasitasSeat
      ? `${ib.kapasitasSeat.toLocaleString('id-ID')} kursi — sebagai informasi okupansi; reservasi tidak dihentikan saat penuh.`
      : 'Kapasitas kursi belum diisi (tidak ada batas).',
    tone: 'info',
  });
  if (kidsDesk) {
    rules.push({
      key: 'self',
      judul: 'Self check-in (dari HP jemaat)',
      isi: 'Tidak aktif untuk ibadah anak ini — anak di-check-in di meja CKids oleh petugas.',
      tone: 'off',
    });
  } else {
    const radius = ib.selfCheckinRadiusM;
    const hasPoint = ib.latitude != null || ib.cabang?.latitude != null;
    rules.push({
      key: 'self',
      judul: 'Self check-in (dari HP jemaat)',
      isi: `${ib.isKidsIbadah ? 'Orang tua / wali bisa check-in anaknya dari tiket di app. ' : ''}Dibuka ${openRuleText(ib, 'ibadah')} (${at(b.opens)}) dan ditutup ${closeRuleText(ib, 'ibadah')} (${at(b.closes)}). ${
        radius && hasPoint ? `Jemaat harus berada dalam jarak ${formatMeters(radius)} dari lokasi ibadah.` : 'Bisa dilakukan dari mana saja (tidak dicek lokasinya).'
      }`,
      tone: 'ok',
    });
  }
  rules.push({
    key: 'scan',
    judul: 'Scan oleh petugas',
    isi: `Petugas scan QR mulai ${fmtMenit(SCAN_BEFORE_MIN)} sebelum ibadah dimulai (${at(new Date(start.getTime() - SCAN_BEFORE_MIN * 60_000))}) sampai akhir hari. Yang sudah reservasi tapi discan lebih dari ${fmtMenit(SCAN_AFTER_MIN)} setelah mulai tetap tercatat hadir, dengan tanda "terlambat".`,
    tone: 'info',
  });
  rules.push({
    key: 'walkin',
    judul: 'Tamu & yang datang tanpa reservasi',
    isi: ib.isKidsIbadah
      ? 'Ibadah anak tidak menerima tamu walk-in — anak baru didaftarkan di meja CKids.'
      : 'Jemaat tanpa reservasi cukup di-check-in (scan QR / cari nama). Tamu baru yang belum punya data dicatat lewat "Catat tamu baru" di jendela Check-in.',
    tone: 'info',
  });
  if (ib.isKidsIbadah || ib.requiresCheckout) {
    rules.push({
      key: 'jemput',
      judul: 'Penjemputan anak',
      isi: 'Saat check-in, orang tua menerima kode jemput 6 angka. Saat menjemput, petugas mencocokkan kode lewat tombol Pickup Anak (atau Checkout via Kode).',
      tone: 'warn',
    });
  }
  const autoAt = b.closes > b.end ? b.closes : b.end;
  rules.push({
    key: 'auto',
    judul: 'Batal otomatis kalau tidak datang',
    isi: `Reservasi yang belum check-in dibatalkan otomatis pada ${at(autoAt)} (tercatat "Tidak hadir"). Kalau ternyata ia hadir, petugas tetap bisa check-in.`,
    tone: 'warn',
  });
  rules.push({
    key: 'batal',
    judul: 'Membatalkan',
    isi: `Jemaat bisa membatalkan reservasi sendiri sampai ibadah dimulai. Self check-in yang salah bisa dibatalkan jemaat sampai ${at(b.closes)}.`,
    tone: 'info',
  });
  rules.push({
    key: 'admin',
    judul: 'Admin di Portal',
    isi: 'Admin Kehadiran bisa menambah, check-in, dan mengubah status kapan saja (untuk koreksi). Kehadiran yang ditambahkan untuk tanggal hari ini / yang sudah lewat langsung tercatat hadir.',
    tone: 'info',
  });

  // Petugas scan: petugas pelayanan aktif dengan izin scan (tetap / khusus tanggal ini).
  const petugas = await prisma.ibadahPelayananPetugas.findMany({
    where: {
      canScanAttendance: true,
      ibadahPelayanan: { ibadahId, pelayanan: { isActive: true } },
      jemaat: { isActive: true },
      OR: [{ tanggalIbadah: null }, { tanggalIbadah: day }],
    },
    select: {
      id: true,
      tanggalIbadah: true,
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      pelayananRole: { select: { nama: true } },
      ibadahPelayanan: { select: { pelayanan: { select: { nama: true } } } },
    },
    orderBy: { jemaat: { namaLengkap: 'asc' } },
  });
  const seen = new Set<string>();
  const scanners = petugas
    .filter((p) => (seen.has(p.jemaat.id) ? false : (seen.add(p.jemaat.id), true)))
    .map((p) => ({
      id: p.id,
      nama: p.jemaat.namaLengkap,
      fotoUrl: p.jemaat.fotoUrl,
      pelayanan: p.ibadahPelayanan.pelayanan.nama,
      peran: p.pelayananRole?.nama ?? null,
      khususTanggal: !!p.tanggalIbadah,
    }));

  return {
    ibadah: {
      id: ib.id,
      nama: ib.nama,
      cabang: ib.cabang?.nama ?? null,
      tanggal,
      jamMulai: ib.jamMulai,
      jamSelesai: ib.jamSelesai,
      lokasi: ib.lokasi,
      isOnline: ib.isOnline,
      isKidsIbadah: ib.isKidsIbadah,
      requiresCheckout: ib.requiresCheckout,
      kapasitasSeat: ib.kapasitasSeat,
      status,
      startLabel: at(start),
      selfCheckinOpens: kidsDesk ? null : at(b.opens),
      selfCheckinCloses: kidsDesk ? null : at(b.closes),
    },
    aturan: rules,
    scanners,
  };
}
