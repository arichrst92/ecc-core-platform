/**
 * Statistik Homecell Area (list portal + export PDF).
 *
 * Per homecell aktif:
 *   - anggota aktif + rata-rata usia (yang tanggal lahirnya terisi)
 *   - pertemuan = jadwal dengan tanggal ≤ hari ini (dan dalam periode bila dipilih)
 *   - kehadiran % = total hadir / (anggota aktif × jumlah pertemuan)
 * Per area: agregat dari homecell-homecell di dalamnya (kehadiran berbobot).
 */
import { prisma, type HomecellKategori } from '@ecc/database';
import { homecellAttendanceTier } from '@ecc/shared-types';

export type Period = { from: Date; to: Date } | null;

export interface HomecellStat {
  id: string;
  nama: string;
  kategori: HomecellKategori | null;
  usiaMin: number | null;
  usiaMax: number | null;
  pic: string | null;
  memberCount: number;
  avgAge: number | null;
  meetingCount: number;
  attendanceTotal: number;
  attendancePercent: number | null;
  lastMeetingAt: string | null;
}

export interface AreaStat {
  areaId: string;
  homecellCount: number;
  memberCount: number;
  avgAge: number | null;
  ageKnown: number;
  meetingCount: number;
  attendancePercent: number | null;
  tier: ReturnType<typeof homecellAttendanceTier> | null;
  homecellNoMeeting: number;
  kategori: { SINGLE: number; COUPLE: number; UMUM: number };
  homecells: HomecellStat[];
}

const ageOf = (lahir: Date, now: Date) => {
  let u = now.getUTCFullYear() - lahir.getUTCFullYear();
  const m = now.getUTCMonth() - lahir.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < lahir.getUTCDate())) u--;
  return u >= 0 && u < 130 ? u : null;
};

export async function computeAreaStats(areaIds: string[], period: Period, now = new Date()): Promise<Map<string, AreaStat>> {
  const out = new Map<string, AreaStat>();
  if (areaIds.length === 0) return out;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const upper = period && period.to < today ? period.to : today;

  const homecells = await prisma.homecell.findMany({
    where: { areaId: { in: areaIds }, isActive: true },
    orderBy: { nama: 'asc' },
    select: {
      id: true,
      areaId: true,
      nama: true,
      kategori: true,
      usiaMin: true,
      usiaMax: true,
      picJemaat: { select: { namaLengkap: true } },
      members: { where: { isActive: true }, select: { jemaat: { select: { tanggalLahir: true } } } },
      schedules: {
        where: { tanggal: { lte: upper, ...(period ? { gte: period.from } : {}) } },
        select: { tanggal: true, _count: { select: { attendances: true } } },
      },
    },
  });

  for (const id of areaIds) {
    out.set(id, {
      areaId: id,
      homecellCount: 0,
      memberCount: 0,
      avgAge: null,
      ageKnown: 0,
      meetingCount: 0,
      attendancePercent: null,
      tier: null,
      homecellNoMeeting: 0,
      kategori: { SINGLE: 0, COUPLE: 0, UMUM: 0 },
      homecells: [],
    });
  }
  const ageSum = new Map<string, number>();
  const hadirSum = new Map<string, number>();
  const potensiSum = new Map<string, number>();

  for (const h of homecells) {
    const a = out.get(h.areaId)!;
    const ages = h.members.map((m) => (m.jemaat.tanggalLahir ? ageOf(m.jemaat.tanggalLahir, now) : null)).filter((x): x is number => x != null);
    const hadir = h.schedules.reduce((n, s) => n + s._count.attendances, 0);
    const potensi = h.members.length * h.schedules.length;
    const last = h.schedules
      .filter((s) => s._count.attendances > 0)
      .reduce<Date | null>((mx, s) => (!mx || s.tanggal > mx ? s.tanggal : mx), null);
    a.homecells.push({
      id: h.id,
      nama: h.nama,
      kategori: h.kategori,
      usiaMin: h.usiaMin,
      usiaMax: h.usiaMax,
      pic: h.picJemaat?.namaLengkap ?? null,
      memberCount: h.members.length,
      avgAge: ages.length ? Math.round(ages.reduce((x, y) => x + y, 0) / ages.length) : null,
      meetingCount: h.schedules.length,
      attendanceTotal: hadir,
      attendancePercent: potensi > 0 ? Math.min(100, Math.round((hadir / potensi) * 100)) : null,
      lastMeetingAt: last ? last.toISOString().slice(0, 10) : null,
    });
    a.homecellCount++;
    a.memberCount += h.members.length;
    a.ageKnown += ages.length;
    ageSum.set(h.areaId, (ageSum.get(h.areaId) ?? 0) + ages.reduce((x, y) => x + y, 0));
    a.meetingCount += h.schedules.length;
    hadirSum.set(h.areaId, (hadirSum.get(h.areaId) ?? 0) + hadir);
    potensiSum.set(h.areaId, (potensiSum.get(h.areaId) ?? 0) + potensi);
    // Tidak ada kehadiran tercatat dalam periode = belum ada pertemuan.
    if (hadir === 0) a.homecellNoMeeting++;
    a.kategori[h.kategori ?? 'UMUM']++;
  }

  for (const a of out.values()) {
    a.avgAge = a.ageKnown ? Math.round((ageSum.get(a.areaId) ?? 0) / a.ageKnown) : null;
    const pot = potensiSum.get(a.areaId) ?? 0;
    a.attendancePercent = pot > 0 ? Math.min(100, Math.round(((hadirSum.get(a.areaId) ?? 0) / pot) * 100)) : null;
    a.tier = a.attendancePercent == null ? null : homecellAttendanceTier(a.attendancePercent);
  }
  return out;
}
