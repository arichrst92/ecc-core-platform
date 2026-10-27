/**
 * Bible 365 — jadwal baca Alkitab 365 hari, berurutan Kejadian → Wahyu.
 *
 * 1.189 pasal dibagi rata ke 365 hari: Hari d memuat pasal ke
 * floor((d-1)·N/365) … floor(d·N/365)-1 (indeks global, 0-based). Hasilnya
 * 3–4 pasal per hari. Jadwal deterministik — tidak disimpan di DB; mobile
 * memakai rumus yang sama (src/features/bible365/plan.ts).
 */
import { prisma, type Prisma } from '@ecc/database';
import { DEFAULT_TZ, todayInTz } from './tz.js';

/** [bookId, totalBab] — urutan kanon Protestan (TB LAI), total 1.189 pasal. */
export const BIBLE_CHAPTERS: ReadonlyArray<readonly [number, number]> = [
  [1, 50], [2, 40], [3, 27], [4, 36], [5, 34], [6, 24], [7, 21], [8, 4], [9, 31], [10, 24],
  [11, 22], [12, 25], [13, 29], [14, 36], [15, 10], [16, 13], [17, 10], [18, 42], [19, 150], [20, 31],
  [21, 12], [22, 8], [23, 66], [24, 52], [25, 5], [26, 48], [27, 12], [28, 14], [29, 3], [30, 9],
  [31, 1], [32, 4], [33, 7], [34, 3], [35, 3], [36, 3], [37, 2], [38, 14], [39, 4], [40, 28],
  [41, 16], [42, 24], [43, 21], [44, 28], [45, 16], [46, 16], [47, 13], [48, 6], [49, 6], [50, 4],
  [51, 4], [52, 5], [53, 3], [54, 6], [55, 4], [56, 3], [57, 1], [58, 13], [59, 5], [60, 5],
  [61, 3], [62, 5], [63, 1], [64, 1], [65, 1], [66, 22],
];

export const TOTAL_DAYS = 365;

export type Chapter = { bookId: number; bab: number };

/** Semua pasal berurutan. */
export const ALL_CHAPTERS: Chapter[] = BIBLE_CHAPTERS.flatMap(([bookId, n]) =>
  Array.from({ length: n }, (_, i) => ({ bookId, bab: i + 1 })),
);
export const TOTAL_CHAPTERS = ALL_CHAPTERS.length; // 1189

const dayStart = (d: number) => Math.floor(((d - 1) * TOTAL_CHAPTERS) / TOTAL_DAYS);

/** Pasal untuk Hari d (1..365). */
export function chaptersForDay(day: number): Chapter[] {
  if (!Number.isInteger(day) || day < 1 || day > TOTAL_DAYS) return [];
  return ALL_CHAPTERS.slice(dayStart(day), dayStart(day + 1));
}

const CHAPTER_DAY = new Map<string, number>();
for (let d = 1; d <= TOTAL_DAYS; d++) for (const c of chaptersForDay(d)) CHAPTER_DAY.set(`${c.bookId}:${c.bab}`, d);

/** Hari untuk satu pasal, atau null bila pasal tidak valid. */
export const dayOfChapter = (bookId: number, bab: number): number | null => CHAPTER_DAY.get(`${bookId}:${bab}`) ?? null;

export const DAY_SIZES: number[] = Array.from({ length: TOTAL_DAYS }, (_, i) => chaptersForDay(i + 1).length);

const DAY_MS = 86_400_000;

/** Hari ke berapa (1-based, dibatasi 1..365) menurut kalender Jakarta. */
export function dayIndexOf(startDate: Date, now: Date = new Date(), tz = DEFAULT_TZ): number {
  const today = todayInTz(tz, now).getTime();
  const start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());
  const d = Math.floor((today - start) / DAY_MS) + 1;
  return Math.min(Math.max(d, 1), TOTAL_DAYS);
}

export const planSelect = {
  id: true,
  putaran: true,
  startDate: true,
  status: true,
  completedAt: true,
  stoppedAt: true,
  reminderTime: true,
  createdAt: true,
} satisfies Prisma.Bible365PlanSelect;

/** Ringkasan progres satu plan (dipakai mobile & share). */
export async function planSummary(planId: string, startDate: Date, now = new Date()) {
  const [readings, notes] = await Promise.all([
    prisma.bible365Reading.findMany({ where: { planId }, select: { day: true } }),
    prisma.bible365Note.findMany({ where: { planId }, select: { day: true } }),
  ]);
  const readPerDay = new Array<number>(TOTAL_DAYS + 1).fill(0);
  for (const r of readings) if (r.day >= 1 && r.day <= TOTAL_DAYS) readPerDay[r.day]! += 1;
  const noteDays = new Set(notes.map((n) => n.day));

  // dayStatus: string 365 karakter — '2' selesai, '1' sebagian, '0' belum.
  let dayStatus = '';
  let completedDays = 0;
  for (let d = 1; d <= TOTAL_DAYS; d++) {
    const r = readPerDay[d]!;
    const done = r >= DAY_SIZES[d - 1]!;
    if (done) completedDays++;
    dayStatus += done ? '2' : r > 0 ? '1' : '0';
  }

  const today = dayIndexOf(startDate, now);
  // Beruntun: hari selesai berturut-turut mundur dari hari ini (hari ini belum
  // selesai tidak memutus — dihitung dari kemarin).
  let streak = 0;
  for (let d = dayStatus[today - 1] === '2' ? today : today - 1; d >= 1 && dayStatus[d - 1] === '2'; d--) streak++;
  const behindDays: number[] = [];
  for (let d = 1; d < today; d++) if (dayStatus[d - 1] !== '2') behindDays.push(d);

  return {
    today,
    totalDays: TOTAL_DAYS,
    totalChapters: TOTAL_CHAPTERS,
    readCount: readings.length,
    completedDays,
    percent: Math.floor((readings.length / TOTAL_CHAPTERS) * 1000) / 10,
    streak,
    behindDays: behindDays.slice(0, 60),
    behindCount: behindDays.length,
    notesCount: noteDays.size,
    noteDays: [...noteDays].sort((a, b) => a - b),
    dayStatus,
  };
}
