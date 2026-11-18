/**
 * Waktu mulai event (jam dinding cabang → instant). Dipakai untuk batas
 * pendaftaran online & pembatalan tiket: keduanya tutup saat event dimulai.
 * Setelah itu pendaftaran lewat walk-in di lokasi (petugas).
 */
import { calendarDateOf, wallToInstant } from './tz.js';

export function eventStartsAt(ev: { tanggalMulai: Date; jamMulai: string | null }, tz: string): Date {
  const m = /^(\d{1,2}):(\d{2})/.exec(ev.jamMulai ?? '');
  const min = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  return wallToInstant(calendarDateOf(ev.tanggalMulai, tz), min, tz);
}

/** Waktu selesai event (hari terakhir + jamSelesai; tanpa jam → 23:59). */
export function eventEndsAt(
  ev: { tanggalMulai: Date; tanggalSelesai: Date | null; jamMulai: string | null; jamSelesai: string | null },
  tz: string,
): Date {
  const hm = (v: string | null) => {
    const m = /^(\d{1,2}):(\d{2})/.exec(v ?? '');
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const start = hm(ev.jamMulai) ?? 0;
  let end = hm(ev.jamSelesai) ?? 24 * 60 - 1;
  if (!ev.tanggalSelesai && end <= start) end = 24 * 60 - 1;
  return wallToInstant(calendarDateOf(ev.tanggalSelesai ?? ev.tanggalMulai, tz), end, tz);
}

export const REGISTRATION_CLOSED_MESSAGE =
  'Pendaftaran online sudah ditutup karena event sudah dimulai. Silakan registrasi langsung (walk-in) di lokasi melalui petugas.';
