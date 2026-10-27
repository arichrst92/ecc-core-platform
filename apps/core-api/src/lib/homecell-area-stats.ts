/**
 * Statistik Homecell Area (list portal + export PDF).
 *
 * Per homecell aktif:
 *   - anggota aktif + rata-rata usia (yang tanggal lahirnya terisi)
 *   - pertemuan = jadwal dengan tanggal ≤ hari ini (dan dalam periode bila dipilih)
 *   - kehadiran % = total hadir / (anggota aktif × jumlah pertemuan)
 *   - tamu dicatat TERPISAH (HomecellTamuAttendance): kunjungan & tamu unik,
 *     tidak ikut menghitung % kehadiran anggota.
 * Per area: agregat dari homecell-homecell di dalamnya (kehadiran berbobot).
 */
import { prisma, type HomecellKategori } from '@ecc/database';
import { homecellAttendanceTier } from '@ecc/shared-types';


// ------------------------------------------------------------------ demografi

/** Kelompok usia untuk demografi homecell (fokus anak muda / keluarga muda). */
export const DEMO_AGE_GROUPS = [
  { label: '≤ 17', min: 0, max: 17 },
  { label: '18–24', min: 18, max: 24 },
  { label: '25–29', min: 25, max: 29 },
  { label: '30–34', min: 30, max: 34 },
  { label: '35–44', min: 35, max: 44 },
  { label: '45–59', min: 45, max: 59 },
  { label: '60+', min: 60, max: 200 },
] as const;

export interface Demografi {
  pria: number;
  wanita: number;
  genderUnknown: number;
  groups: number[]; // sejajar DEMO_AGE_GROUPS
  ageUnknown: number;
  total: number;
}

export const newDemografi = (): Demografi => ({
  pria: 0,
  wanita: 0,
  genderUnknown: 0,
  groups: DEMO_AGE_GROUPS.map(() => 0),
  ageUnknown: 0,
  total: 0,
});

export function addDemografi(d: Demografi, usia: number | null, jk: 'L' | 'P' | null | undefined) {
  d.total++;
  if (jk === 'L') d.pria++;
  else if (jk === 'P') d.wanita++;
  else d.genderUnknown++;
  if (usia == null) d.ageUnknown++;
  else {
    const i = DEMO_AGE_GROUPS.findIndex((g) => usia >= g.min && usia <= g.max);
    if (i >= 0) d.groups[i]!++;
  }
}

export function mergeDemografi(list: Demografi[]): Demografi {
  const d = newDemografi();
  for (const x of list) {
    d.pria += x.pria;
    d.wanita += x.wanita;
    d.genderUnknown += x.genderUnknown;
    d.ageUnknown += x.ageUnknown;
    d.total += x.total;
    x.groups.forEach((v, i) => (d.groups[i]! += v));
  }
  return d;
}

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
  demografi: Demografi;
  /** Kunjungan tamu (tamu × pertemuan) di periode. */
  tamuVisits: number;
  /** Jumlah tamu berbeda yang hadir di periode. */
  tamuUnique: number;
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
  demografi: Demografi;
  tamuVisits: number;
  tamuUnique: number;
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
      members: { where: { isActive: true }, select: { jemaat: { select: { tanggalLahir: true, jenisKelamin: true } } } },
      schedules: {
        where: { tanggal: { lte: upper, ...(period ? { gte: period.from } : {}) } },
        select: { tanggal: true, _count: { select: { attendances: true } }, tamuAttendances: { select: { tamuId: true } } },
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
      demografi: newDemografi(),
      tamuVisits: 0,
      tamuUnique: 0,
    });
  }
  const ageSum = new Map<string, number>();
  const hadirSum = new Map<string, number>();
  const potensiSum = new Map<string, number>();
  const tamuSet = new Map<string, Set<string>>();

  for (const h of homecells) {
    const a = out.get(h.areaId)!;
    const demo = newDemografi();
    for (const m of h.members) {
      addDemografi(demo, m.jemaat.tanggalLahir ? ageOf(m.jemaat.tanggalLahir, now) : null, m.jemaat.jenisKelamin);
    }
    const ages = h.members.map((m) => (m.jemaat.tanggalLahir ? ageOf(m.jemaat.tanggalLahir, now) : null)).filter((x): x is number => x != null);
    const hadir = h.schedules.reduce((n, s) => n + s._count.attendances, 0);
    const potensi = h.members.length * h.schedules.length;
    const tamuIds = h.schedules.flatMap((s) => s.tamuAttendances.map((t) => t.tamuId));
    const areaTamu = tamuSet.get(h.areaId) ?? new Set<string>();
    for (const id of tamuIds) areaTamu.add(id);
    tamuSet.set(h.areaId, areaTamu);
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
      demografi: demo,
      tamuVisits: tamuIds.length,
      tamuUnique: new Set(tamuIds).size,
    });
    a.tamuVisits += tamuIds.length;
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
    a.demografi = mergeDemografi(a.homecells.map((h) => h.demografi));
    a.tamuUnique = tamuSet.get(a.areaId)?.size ?? 0;
    a.avgAge = a.ageKnown ? Math.round((ageSum.get(a.areaId) ?? 0) / a.ageKnown) : null;
    const pot = potensiSum.get(a.areaId) ?? 0;
    a.attendancePercent = pot > 0 ? Math.min(100, Math.round(((hadirSum.get(a.areaId) ?? 0) / pot) * 100)) : null;
    a.tier = a.attendancePercent == null ? null : homecellAttendanceTier(a.attendancePercent);
  }
  return out;
}
