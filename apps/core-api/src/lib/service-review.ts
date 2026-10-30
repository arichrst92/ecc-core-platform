/**
 * Ulasan & rating ibadah / event dari tiket.
 *
 * Jendela ulasan: dibuka saat acara DIMULAI (jam mulai, zona waktu cabang)
 * sampai REVIEW_WINDOW_DAYS hari setelah acara SELESAI. Tiket yang batal
 * tidak bisa memberi ulasan. Satu ulasan per tiket (boleh diubah selama
 * jendela masih terbuka).
 */
import { prisma } from '@ecc/database';
import { hhmmToMin } from './self-checkin.js';
import { calendarDateOf, tzOr, wallToInstant } from './tz.js';

export const REVIEW_WINDOW_DAYS = Number(process.env.REVIEW_WINDOW_DAYS ?? 14);
const DAY_MS = 86_400_000;

export type ReviewReason = 'NOT_STARTED' | 'CLOSED' | 'CANCELLED' | 'NOT_OWNER';
export interface ReviewWindow {
  open: boolean;
  reason: ReviewReason | null;
  startsAt: string;
  closesAt: string;
}

function windowFrom(start: Date, end: Date, now: Date, cancelled: boolean): ReviewWindow {
  const closes = new Date(end.getTime() + REVIEW_WINDOW_DAYS * DAY_MS);
  const base = { startsAt: start.toISOString(), closesAt: closes.toISOString() };
  if (cancelled) return { ...base, open: false, reason: 'CANCELLED' };
  if (now < start) return { ...base, open: false, reason: 'NOT_STARTED' };
  if (now > closes) return { ...base, open: false, reason: 'CLOSED' };
  return { ...base, open: true, reason: null };
}

/** Ibadah: tanggalIbadah (@db.Date) + jam dinding di zona cabang. */
export function ibadahReviewWindow(
  r: { tanggalIbadah: Date; status: string; ibadah: { jamMulai: string; jamSelesai: string } },
  tz: string | null | undefined,
  now = new Date(),
): ReviewWindow {
  const z = tzOr(tz);
  const start = hhmmToMin(r.ibadah.jamMulai) ?? 0;
  let end = hhmmToMin(r.ibadah.jamSelesai) ?? 24 * 60 - 1;
  if (end <= start) end = 24 * 60 - 1;
  return windowFrom(wallToInstant(r.tanggalIbadah, start, z), wallToInstant(r.tanggalIbadah, end, z), now, r.status === 'CANCEL');
}

/** Event: tanggalMulai/Selesai + jamMulai/jamSelesai di zona cabang event. */
export function eventReviewWindow(
  p: { status: string; event: { tanggalMulai: Date; tanggalSelesai: Date | null; jamMulai: string | null; jamSelesai: string | null } },
  tz: string | null | undefined,
  now = new Date(),
): ReviewWindow {
  const z = tzOr(tz);
  const ev = p.event;
  const startDay = calendarDateOf(ev.tanggalMulai, z);
  const endDay = calendarDateOf(ev.tanggalSelesai ?? ev.tanggalMulai, z);
  const start = hhmmToMin(ev.jamMulai) ?? 0;
  let end = hhmmToMin(ev.jamSelesai) ?? 24 * 60 - 1;
  if (!ev.tanggalSelesai && end <= start) end = 24 * 60 - 1;
  return windowFrom(wallToInstant(startDay, start, z), wallToInstant(endDay, end, z), now, p.status === 'BATAL');
}

// ------------------------------------------------------------------ ringkasan

export interface ReviewSummary {
  count: number;
  avg: number | null;
  dist: [number, number, number, number, number]; // bintang 1..5
  withComment: number;
}

export function summarize(rows: { rating: number; komentar?: string | null }[]): ReviewSummary {
  const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let sum = 0;
  let withComment = 0;
  for (const r of rows) {
    const k = Math.min(5, Math.max(1, r.rating));
    dist[k - 1]! += 1;
    sum += k;
    if (r.komentar?.trim()) withComment++;
  }
  return { count: rows.length, avg: rows.length ? Math.round((sum / rows.length) * 10) / 10 : null, dist, withComment };
}

export interface ReviewItem {
  id: string;
  rating: number;
  komentar: string | null;
  nama: string;
  isAnonim: boolean;
  tanggal: string | null; // tanggal ibadah / event
  createdAt: string;
  ibadahId: string | null;
  eventId: string | null;
}

const reviewSelect = {
  id: true,
  rating: true,
  komentar: true,
  isAnonim: true,
  tanggal: true,
  createdAt: true,
  ibadahId: true,
  eventId: true,
  jemaat: { select: { namaLengkap: true } },
} as const;

type ReviewRow = {
  id: string;
  rating: number;
  komentar: string | null;
  isAnonim: boolean;
  tanggal: Date | null;
  createdAt: Date;
  ibadahId: string | null;
  eventId: string | null;
  jemaat: { namaLengkap: string };
};

export const toItem = (r: ReviewRow): ReviewItem => ({
  id: r.id,
  rating: r.rating,
  komentar: r.komentar,
  isAnonim: r.isAnonim,
  nama: r.isAnonim ? 'Anonim' : r.jemaat.namaLengkap,
  tanggal: r.tanggal ? r.tanggal.toISOString().slice(0, 10) : null,
  createdAt: r.createdAt.toISOString(),
  ibadahId: r.ibadahId,
  eventId: r.eventId,
});

/** Ulasan ibadah dalam rentang tanggal ibadah (inklusif). */
export async function ibadahReviews(ibadahIds: string[], from: Date, to: Date) {
  if (!ibadahIds.length) return [];
  return (await prisma.serviceReview.findMany({
    where: { kind: 'IBADAH', ibadahId: { in: ibadahIds }, tanggal: { gte: from, lte: to } },
    select: reviewSelect,
    orderBy: { createdAt: 'desc' },
  })) as ReviewRow[];
}

export async function eventReviews(eventIds: string[]) {
  if (!eventIds.length) return [];
  return (await prisma.serviceReview.findMany({
    where: { kind: 'EVENT', eventId: { in: eventIds } },
    select: reviewSelect,
    orderBy: { createdAt: 'desc' },
  })) as ReviewRow[];
}

/** Ringkasan + per-item (ibadah/event) + komentar terbaru untuk laporan. */
export function buildReviewReport(rows: ReviewRow[], keyOf: (r: ReviewRow) => string | null, maxComments = 60) {
  const groups = new Map<string, ReviewRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return {
    overall: summarize(rows),
    perKey: [...groups.entries()].map(([key, rs]) => ({ key, ...summarize(rs) })),
    comments: rows.filter((r) => r.komentar?.trim()).slice(0, maxComments).map(toItem),
  };
}
