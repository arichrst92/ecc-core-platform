/**
 * Visualisasi Daftar & Absen untuk laporan ibadah (periode, satu / banyak ibadah).
 * Karena mencakup banyak pertemuan, sumbunya RELATIF terhadap tiap pertemuan:
 *   - Reservasi: H-30 … H (hari reservasi dibuat dibanding tanggal ibadah),
 *     daftar di atas / batal di bawah, dipisah Jemaat / New Comer / Visitor.
 *   - Absensi: per 15 menit dari 720 menit sebelum mulai s/d 60 menit setelah
 *     selesai (durasi terpanjang di antara ibadah yang dipilih).
 *   - Proporsi cara absen, komposisi yang hadir, ketepatan waktu.
 * Batal otomatis (tidak hadir) dihitung terpisah, tidak masuk grafik batal.
 */
import { prisma } from '@ecc/database';
import { hhmmToMin } from './self-checkin.js';
import { dateInTz, tzOr, wallToInstant } from './tz.js';

type Who = 'JEMAAT' | 'NEW_COMER' | 'VISITOR';
type Group = 'SELF' | 'PETUGAS' | 'PORTAL' | 'LAINNYA';
const groupOf = (m: string | null): Group =>
  m === 'SELF' ? 'SELF' : m === 'SCAN' || m === 'LATE' || m === 'WALK_IN' ? 'PETUGAS' : m === 'MANUAL' ? 'PORTAL' : 'LAINNYA';

const REG_DAYS = 30;
const BUCKET = 15;
const BEFORE = 720;
const AFTER = 60;
const DAY = 86_400_000;

export type IbadahVisual = Awaited<ReturnType<typeof buildIbadahVisual>>;

export async function buildIbadahVisual(ibadahIds: string[], from: Date, to: Date) {
  const ibs = await prisma.ibadah.findMany({
    where: { id: { in: ibadahIds } },
    select: { id: true, jamMulai: true, jamSelesai: true, cabang: { select: { timezone: true } } },
  });
  const info = new Map(
    ibs.map((i) => {
      const sm = hhmmToMin(i.jamMulai) ?? 0;
      let em = hhmmToMin(i.jamSelesai) ?? 24 * 60 - 1;
      if (em <= sm) em = 24 * 60 - 1;
      return [i.id, { tz: tzOr(i.cabang?.timezone), sm, dur: em - sm }] as const;
    }),
  );
  const rows = await prisma.reservasi.findMany({
    where: { ibadahId: { in: ibadahIds }, tanggalIbadah: { gte: from, lte: to } },
    select: {
      ibadahId: true,
      tanggalIbadah: true,
      status: true,
      reservedAt: true,
      joinedAt: true,
      cancelledAt: true,
      cancelReason: true,
      checkinMethod: true,
      guestSource: true,
      jemaat: { select: { isTamu: true, tamuKategori: true } },
    },
  });
  const who = (r: (typeof rows)[number]): Who =>
    r.jemaat.isTamu || !!r.guestSource ? (r.jemaat.tamuKategori === 'NEW_COMER' ? 'NEW_COMER' : 'VISITOR') : 'JEMAAT';
  const z = (len: number) => Array.from({ length: len }, () => 0);

  // ---------------- reservasi relatif (H-30 … H)
  const regLabels = Array.from({ length: REG_DAYS + 1 }, (_, i) => i - REG_DAYS); // -30..0
  const daftar: Record<Who, number[]> = { JEMAAT: z(REG_DAYS + 1), NEW_COMER: z(REG_DAYS + 1), VISITOR: z(REG_DAYS + 1) };
  const batal: Record<Who, number[]> = { JEMAAT: z(REG_DAYS + 1), NEW_COMER: z(REG_DAYS + 1), VISITOR: z(REG_DAYS + 1) };
  let tanpaReservasi = 0;
  let tidakHadir = 0;
  let reservasiTotal = 0;
  for (const r of rows) {
    const inf = info.get(r.ibadahId);
    if (!inf) continue;
    // Dicatat saat datang (walk-in / admin) = bukan reservasi sebelumnya.
    const walkIn = r.joinedAt && Math.abs(r.joinedAt.getTime() - r.reservedAt.getTime()) < 120_000;
    if (walkIn) {
      tanpaReservasi++;
    } else {
      reservasiTotal++;
      const lead = Math.round((dateInTz(r.reservedAt, inf.tz).getTime() - r.tanggalIbadah.getTime()) / DAY);
      const i = Math.max(-REG_DAYS, Math.min(0, lead)) + REG_DAYS;
      daftar[who(r)][i]!++;
    }
    if (r.status === 'CANCEL') {
      if (r.cancelReason === 'NO_SHOW') tidakHadir++;
      else if (r.cancelledAt) {
        const lead = Math.round((dateInTz(r.cancelledAt, inf.tz).getTime() - r.tanggalIbadah.getTime()) / DAY);
        const i = Math.max(-REG_DAYS, Math.min(0, lead)) + REG_DAYS;
        batal[who(r)][i]!++;
      }
    }
  }

  // ---------------- absensi relatif per 15 menit
  const maxDur = Math.max(60, ...[...info.values()].map((x) => x.dur));
  const nB = Math.ceil((BEFORE + maxDur + AFTER) / BUCKET);
  const per: Record<Group, number[]> = { SELF: z(nB), PETUGAS: z(nB), PORTAL: z(nB), LAINNYA: z(nB) };
  const hadirRows = rows.filter((r) => r.status === 'JOIN' && r.joinedAt);
  const tepat = { sebelum: 0, telat15: 0, telatLebih: 0 };
  let outside = 0;
  for (const r of hadirRows) {
    const inf = info.get(r.ibadahId);
    if (!inf) continue;
    const start = wallToInstant(r.tanggalIbadah, inf.sm, inf.tz).getTime();
    const rel = (r.joinedAt!.getTime() - start) / 60_000; // menit terhadap mulai
    if (rel <= 0) tepat.sebelum++;
    else if (rel <= 15) tepat.telat15++;
    else tepat.telatLebih++;
    const b = Math.floor((rel + BEFORE) / BUCKET);
    if (b < 0 || b >= nB) {
      outside++;
      continue;
    }
    per[groupOf(r.checkinMethod)][b]!++;
  }
  const kum: number[] = [];
  let acc = 0;
  for (let i = 0; i < nB; i++) {
    acc += per.SELF[i]! + per.PETUGAS[i]! + per.PORTAL[i]! + per.LAINNYA[i]!;
    kum.push(acc);
  }
  const relLabel = (i: number) => {
    const m = i * BUCKET - BEFORE;
    if (m === 0) return 'Mulai';
    const a = Math.abs(m);
    const t = a % 60 === 0 ? `${a / 60} jam` : a >= 60 ? `${Math.floor(a / 60)}j${a % 60}` : `${a} mnt`;
    return m < 0 ? `-${t}` : `+${t}`;
  };
  const proporsi = { SELF: 0, PETUGAS: 0, PORTAL: 0, LAINNYA: 0 } as Record<Group, number>;
  const hadirPer = { JEMAAT: 0, NEW_COMER: 0, VISITOR: 0 } as Record<Who, number>;
  for (const r of hadirRows) {
    proporsi[groupOf(r.checkinMethod)]++;
    hadirPer[who(r)]++;
  }
  return {
    reservasi: { labels: regLabels, daftar, batal, total: reservasiTotal, tanpaReservasi, tidakHadir },
    absensi: {
      labels: Array.from({ length: nB }, (_, i) => relLabel(i)),
      menitPerBatang: BUCKET,
      mulaiIdx: BEFORE / BUCKET,
      selesaiIdx: Math.min(nB - 1, Math.floor((BEFORE + maxDur) / BUCKET)),
      metode: per,
      kumulatif: kum,
      diluarRentang: outside,
      hadir: hadirRows.length,
    },
    proporsi,
    hadirPer,
    ketepatan: tepat,
  };
}
