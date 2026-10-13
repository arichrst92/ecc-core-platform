/**
 * Kehadiran terakhir anggota di sebuah homecell (dari homecell_attendance
 * × homecell_schedule.tanggal) + "berapa hari yang lalu" menurut tanggal WIB.
 */
import { prisma } from '@ecc/database';
import { daysSince, type LastAttendance } from './last-attendance.js';

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
