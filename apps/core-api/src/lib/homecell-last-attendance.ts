/**
 * Kehadiran terakhir anggota di sebuah homecell (dari homecell_attendance
 * × homecell_schedule.tanggal) + "berapa hari yang lalu" menurut tanggal WIB.
 */
import { prisma } from '@ecc/database';
import { daysSince, todayWib, ymd, type LastAttendance } from './last-attendance.js';

export { withLastAttendance, type LastAttendance } from './last-attendance.js';

/** Map jemaatId → kehadiran terakhir di homecell ini (yang belum pernah hadir tidak ada di map). */
export async function getLastAttendanceMap(homecellId: string, now: Date = new Date()): Promise<Map<string, LastAttendance>> {
  const rows = await prisma.$queryRaw<{ jemaat_id: string; last: Date }[]>`
    SELECT a.jemaat_id::text AS jemaat_id, MAX(s.tanggal) AS last
    FROM homecell_attendance a
    JOIN homecell_schedule s ON s.id = a.schedule_id
    WHERE s.homecell_id = ${homecellId}::uuid
    GROUP BY a.jemaat_id
  `;
  const map = new Map<string, LastAttendance>();
  for (const r of rows) {
    const last = r.last instanceof Date ? r.last : new Date(r.last);
    map.set(r.jemaat_id, { lastAttendedAt: last, lastAttendedDaysAgo: daysSince(last, now) });
  }
  return map;
}

export interface LastMeeting {
  lastMeetingAt: string | null; // YYYY-MM-DD
  lastMeetingDaysAgo: number | null;
}

/**
 * Pertemuan terakhir per homecell = jadwal dengan tanggal ≤ hari ini (WIB)
 * yang punya minimal 1 kehadiran tercatat.
 */
export async function getLastMeetingMap(homecellIds: string[], now: Date = new Date()): Promise<Map<string, LastMeeting>> {
  const map = new Map<string, LastMeeting>();
  if (homecellIds.length === 0) return map;
  const today = todayWib(now);
  const rows = await prisma.$queryRaw<{ homecell_id: string; last: Date }[]>`
    SELECT s.homecell_id::text AS homecell_id, MAX(s.tanggal) AS last
    FROM homecell_schedule s
    WHERE s.homecell_id = ANY(${homecellIds}::uuid[])
      AND s.tanggal <= ${ymd(today)}::date
      AND EXISTS (SELECT 1 FROM homecell_attendance a WHERE a.schedule_id = s.id)
    GROUP BY s.homecell_id
  `;
  for (const r of rows) {
    const last = r.last instanceof Date ? r.last : new Date(r.last);
    map.set(r.homecell_id, { lastMeetingAt: ymd(last), lastMeetingDaysAgo: daysSince(last, now) });
  }
  return map;
}

export const lastMeetingOf = (id: string, map: Map<string, LastMeeting>): LastMeeting =>
  map.get(id) ?? { lastMeetingAt: null, lastMeetingDaysAgo: null };

/** Kehadiran terakhir tiap anggota untuk banyak homecell sekaligus: key `${homecellId}:${jemaatId}`. */
export async function getMemberLastAttendanceMulti(
  homecellIds: string[],
  now: Date = new Date(),
): Promise<Map<string, LastAttendance>> {
  const map = new Map<string, LastAttendance>();
  if (homecellIds.length === 0) return map;
  const rows = await prisma.$queryRaw<{ homecell_id: string; jemaat_id: string; last: Date }[]>`
    SELECT s.homecell_id::text AS homecell_id, a.jemaat_id::text AS jemaat_id, MAX(s.tanggal) AS last
    FROM homecell_attendance a
    JOIN homecell_schedule s ON s.id = a.schedule_id
    WHERE s.homecell_id = ANY(${homecellIds}::uuid[])
    GROUP BY s.homecell_id, a.jemaat_id
  `;
  for (const r of rows) {
    const last = r.last instanceof Date ? r.last : new Date(r.last);
    map.set(`${r.homecell_id}:${r.jemaat_id}`, { lastAttendedAt: last, lastAttendedDaysAgo: daysSince(last, now) });
  }
  return map;
}
