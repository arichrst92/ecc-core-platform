/**
 * Self check-in ibadah — logika murni (tanpa DB) supaya mudah di-test.
 *
 * Aturan: self check-in hanya terbuka pada HARI ibadah dijadwalkan (sesuai
 * tipeJadwal/hari/tanggalMulai, tidak dibatalkan) dan pada JAM ibadah:
 * mulai OPEN_BEFORE_MIN (15) menit sebelum jamMulai sampai jamSelesai, jam
 * dinding di zona waktu cabang (default Asia/Jakarta).
 */
import { generateOccurrences, type IbadahForOccurrence } from './ibadah-occurrences.js';
import { DEFAULT_TZ, calendarDateOf, todayInTz, wallToInstant } from './tz.js';

export const OPEN_BEFORE_MIN = 15;

export type SelfCheckinReason =
  | 'INACTIVE'
  | 'KIDS_IBADAH'
  | 'NOT_TODAY'
  | 'CANCELLED'
  | 'TOO_EARLY'
  | 'ENDED';

export interface SelfCheckinWindow {
  available: boolean;
  reason: SelfCheckinReason | null;
  /** Tanggal occurrence hari ini (YYYY-MM-DD, zona cabang). */
  tanggal: string;
  /** ISO — kapan self check-in dibuka / ditutup hari ini (kalau hari ibadah). */
  opensAt: string | null;
  closesAt: string | null;
}

/** "HH:mm" → menit sejak 00:00; null kalau format salah. */
export function hhmmToMin(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function selfCheckinWindow(
  ibadah: IbadahForOccurrence & {
    isActive: boolean;
    isKidsIbadah: boolean;
    jamMulai: string;
    jamSelesai: string;
  },
  cancelledDates: string[],
  now: Date = new Date(),
  /** Zona waktu cabang (IANA). Jam ibadah = jam dinding di zona ini. */
  tz: string = DEFAULT_TZ,
): SelfCheckinWindow {
  const today = todayInTz(tz, now);
  const tanggal = today.toISOString().slice(0, 10);
  const base = { tanggal, opensAt: null, closesAt: null };
  if (!ibadah.isActive) return { ...base, available: false, reason: 'INACTIVE' };
  if (ibadah.isKidsIbadah) return { ...base, available: false, reason: 'KIDS_IBADAH' };

  const occ = generateOccurrences(ibadah, today, today);
  if (occ.length === 0) return { ...base, available: false, reason: 'NOT_TODAY' };
  if (cancelledDates.includes(tanggal)) return { ...base, available: false, reason: 'CANCELLED' };

  const start = hhmmToMin(ibadah.jamMulai) ?? 0;
  let end = hhmmToMin(ibadah.jamSelesai) ?? 24 * 60 - 1;
  if (end <= start) end = 24 * 60 - 1; // jam selesai lewat tengah malam → sampai akhir hari
  // Jam dinding di zona cabang → instant UTC
  const atMin = (min: number) => wallToInstant(today, min, tz);
  const opens = atMin(Math.max(0, start - OPEN_BEFORE_MIN));
  const closes = atMin(end);
  const win = { tanggal, opensAt: opens.toISOString(), closesAt: closes.toISOString() };
  if (now < opens) return { ...win, available: false, reason: 'TOO_EARLY' };
  if (now > closes) return { ...win, available: false, reason: 'ENDED' };
  return { ...win, available: true, reason: null };
}

export const SELF_CHECKIN_REASON_TEXT: Record<SelfCheckinReason, string> = {
  INACTIVE: 'Ibadah ini tidak aktif.',
  KIDS_IBADAH: 'Check-in ibadah anak dilakukan di meja CKids.',
  NOT_TODAY: 'Hari ini tidak ada jadwal ibadah ini.',
  CANCELLED: 'Ibadah hari ini dibatalkan.',
  TOO_EARLY: `Self check-in dibuka ${OPEN_BEFORE_MIN} menit sebelum ibadah dimulai.`,
  ENDED: 'Ibadah hari ini sudah selesai.',
};

// ============================================================
// Event
// ============================================================

export type EventSelfCheckinReason = 'DISABLED' | 'NO_ATTENDANCE' | 'INACTIVE' | 'TOO_EARLY' | 'ENDED';

/** Tanggal kalender WIB (sebagai UTC midnight) dari sebuah instant. */

/**
 * Jendela self check-in event: 15 menit sebelum (tanggalMulai + jamMulai)
 * s.d. (tanggalSelesai|tanggalMulai + jamSelesai), jam dinding zona cabang.
 * Tanpa jamMulai → 00:00; tanpa jamSelesai → 23:59 hari terakhir.
 */
export function eventSelfCheckinWindow(
  ev: {
    allowSelfCheckin: boolean;
    butuhKehadiran: boolean;
    isActive: boolean;
    tanggalMulai: Date;
    tanggalSelesai: Date | null;
    jamMulai: string | null;
    jamSelesai: string | null;
  },
  now: Date = new Date(),
  /** Zona waktu cabang event (IANA); event global → default. */
  tz: string = DEFAULT_TZ,
): { available: boolean; reason: EventSelfCheckinReason | null; tanggal: string; opensAt: string | null; closesAt: string | null } {
  const tanggal = todayInTz(tz, now).toISOString().slice(0, 10);
  const startDay = calendarDateOf(ev.tanggalMulai, tz);
  const endDay = calendarDateOf(ev.tanggalSelesai ?? ev.tanggalMulai, tz);
  const start = hhmmToMin(ev.jamMulai) ?? 0;
  let end = hhmmToMin(ev.jamSelesai) ?? 24 * 60 - 1;
  if (!ev.tanggalSelesai && end <= start) end = 24 * 60 - 1;
  const opens = wallToInstant(startDay, Math.max(0, start - OPEN_BEFORE_MIN), tz);
  const closes = wallToInstant(endDay, end, tz);
  const win = { tanggal, opensAt: opens.toISOString(), closesAt: closes.toISOString() };
  if (!ev.allowSelfCheckin) return { ...win, available: false, reason: 'DISABLED' };
  if (!ev.butuhKehadiran) return { ...win, available: false, reason: 'NO_ATTENDANCE' };
  if (!ev.isActive) return { ...win, available: false, reason: 'INACTIVE' };
  if (now < opens) return { ...win, available: false, reason: 'TOO_EARLY' };
  if (now > closes) return { ...win, available: false, reason: 'ENDED' };
  return { ...win, available: true, reason: null };
}

export const EVENT_SELF_CHECKIN_REASON_TEXT: Record<EventSelfCheckinReason, string> = {
  DISABLED: 'Event ini tidak mengizinkan self check-in.',
  NO_ATTENDANCE: 'Event ini tidak mencatat kehadiran.',
  INACTIVE: 'Event ini tidak aktif.',
  TOO_EARLY: `Self check-in dibuka ${OPEN_BEFORE_MIN} menit sebelum event dimulai.`,
  ENDED: 'Event sudah selesai.',
};

// ============================================================
// Radius lokasi (geofence) self check-in
// ============================================================

/** Pilihan radius yang ditawarkan di portal (meter). null = di mana saja. */
export const SELF_CHECKIN_RADIUS_PRESETS = [50, 100, 200, 300, 500, 1000, 2000, 5000] as const;

export type RadiusCheck =
  | { ok: true; skipped: boolean; distanceM: number | null }
  | { ok: false; code: 'LOCATION_REQUIRED' | 'TOO_FAR'; distanceM: number | null };

/** Jarak 2 titik (meter, haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * radiusM null = self check-in boleh di mana saja (tidak dicek).
 * Venue tanpa titik lokasi → tidak bisa dicek (skipped).
 * Selain itu posisi user wajib ada & harus ≤ radius.
 */
export function checkSelfCheckinRadius(
  venue: { lat: number; lng: number } | null,
  user: { lat: number; lng: number } | null,
  radiusM: number | null,
): RadiusCheck {
  if (radiusM == null || !venue) return { ok: true, skipped: true, distanceM: null };
  if (!user) return { ok: false, code: 'LOCATION_REQUIRED', distanceM: null };
  const d = Math.round(distanceMeters(venue, user));
  return d <= radiusM ? { ok: true, skipped: false, distanceM: d } : { ok: false, code: 'TOO_FAR', distanceM: d };
}

/** Titik venue: milik ibadah/event sendiri, kalau tidak ada pakai titik cabang. */
export function venuePoint(
  own: { latitude: number | null; longitude: number | null },
  cabang: { latitude: number | null; longitude: number | null } | null | undefined,
): { lat: number; lng: number } | null {
  if (own.latitude != null && own.longitude != null) return { lat: own.latitude, lng: own.longitude };
  if (cabang?.latitude != null && cabang?.longitude != null) return { lat: cabang.latitude, lng: cabang.longitude };
  return null;
}

export const formatMeters = (m: number) => (m >= 1000 ? `${Number((m / 1000).toFixed(1))} km` : `${m} m`);

export function radiusErrorMessage(
  code: 'LOCATION_REQUIRED' | 'TOO_FAR',
  kind: 'ibadah' | 'event',
  distanceM: number | null,
  radiusM: number,
): string {
  const tempat = kind === 'ibadah' ? 'ibadah' : 'event';
  if (code === 'LOCATION_REQUIRED') {
    return `Self check-in butuh lokasi Anda (maks. ${formatMeters(radiusM)} dari lokasi ${tempat}). Aktifkan izin lokasi, atau cari usher untuk check-in dengan QR code.`;
  }
  const jarak = distanceM != null ? formatMeters(distanceM) : '';
  return `Lokasi Anda harus dekat dengan lokasi ${tempat} (maks. ${formatMeters(radiusM)}${jarak ? `, posisi Anda sekitar ${jarak}` : ''}). Cari usher untuk check-in dengan QR code.`;
}

/** Info untuk app: perlu kirim lokasi? radius berapa? */
export function venueInfo(
  radiusM: number | null,
  point: { lat: number; lng: number } | null,
): { requiresLocation: boolean; radiusM: number | null } {
  return { requiresLocation: radiusM != null && !!point, radiusM: radiusM != null && point ? radiusM : null };
}
