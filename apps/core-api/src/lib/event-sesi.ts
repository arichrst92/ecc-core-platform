/**
 * Grup sesi event — mis. 3 ibadah Natal di hari yang sama dengan jam berbeda.
 * Event dengan `grupSesi` sama: satu jemaat hanya boleh punya SATU pendaftaran
 * aktif (bukan BATAL) di antara event-event itu. Pindah sesi = batalkan dulu.
 *
 * Berlaku untuk pendaftaran online (app, website, Portal). Petugas di lokasi
 * (walk-in / tambah tamu hari H) tidak dibatasi — keputusan di tempat.
 */
import { prisma } from '@ecc/database';
import { ApiError } from './errors.js';
import { acquireEventLock } from './event-lock.js';
import type { Response } from 'express';

/** Kode grup dinormalisasi (huruf kecil, spasi → '-'). '' → null. */
export function normGrupSesi(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const s = (v ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  return s || null;
}

export type SesiConflict = { eventId: string; judul: string; jamMulai: string | null; tanggalMulai: Date };

/** Pendaftaran aktif jemaat di event LAIN dalam grup yang sama (null = aman). */
export async function sesiConflict(
  event: { id: string; grupSesi: string | null },
  jemaatId: string,
): Promise<SesiConflict | null> {
  if (!event.grupSesi) return null;
  const other = await prisma.eventParticipation.findFirst({
    where: {
      jemaatId,
      status: { not: 'BATAL' },
      eventId: { not: event.id },
      event: { grupSesi: event.grupSesi, isActive: true },
    },
    select: { event: { select: { id: true, judul: true, jamMulai: true, tanggalMulai: true } } },
  });
  return other ? { eventId: other.event.id, judul: other.event.judul, jamMulai: other.event.jamMulai, tanggalMulai: other.event.tanggalMulai } : null;
}

/** Pesan untuk satu anggota (tanpa nama — daftar keluarga menampilkan nama di depan). */
export function sesiMessage(c: SesiConflict): string {
  const jam = c.jamMulai ? ` pukul ${c.jamMulai}` : '';
  return `Sudah terdaftar di sesi lain: "${c.judul}"${jam}. Satu orang hanya bisa ikut satu sesi — batalkan dulu bila ingin pindah sesi.`;
}

export function sesiError(c: SesiConflict, nama?: string): ApiError {
  const jam = c.jamMulai ? ` pukul ${c.jamMulai}` : '';
  const who = nama ? `${nama} sudah` : 'Sudah';
  return new ApiError(
    409,
    'SESSION_CONFLICT',
    `${who} terdaftar di sesi lain: "${c.judul}"${jam}. Satu orang hanya bisa ikut satu sesi — batalkan dulu bila ingin pindah sesi.`,
    { otherEventId: c.eventId },
  );
}

/**
 * Kunci per grup sesi sampai respons selesai — pendaftaran ke sesi berbeda
 * dalam grup yang sama diproses bergantian (cegah dobel karena klik bersamaan).
 * Dipanggil SETELAH kunci event (urutan tetap → tidak deadlock).
 */
export async function lockGrupSesi(grupSesi: string | null, res: Response): Promise<void> {
  if (!grupSesi) return;
  const release = await acquireEventLock(`sesi:${grupSesi}`);
  const t = setTimeout(release, 30_000);
  const free = () => {
    clearTimeout(t);
    release();
  };
  res.once('finish', free);
  res.once('close', free);
}
