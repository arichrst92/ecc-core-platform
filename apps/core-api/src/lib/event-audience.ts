/**
 * Audiens event level pelayanan (2026-11).
 *
 * Event bisa ditargetkan ke anggota pelayanan tertentu (selain sinode / cabang).
 * Kosong = semua jemaat (perilaku lama). Diisi = event hanya terlihat di app &
 * hanya bisa diikuti jemaat yang punya JemaatPelayanan AKTIF di salah satu
 * pelayanan itu. Penyaringan dilakukan di SERVER, jadi app lama (≤ 2.5.0) yang
 * menyaring cabang di HP pun otomatis tidak menampilkan event ini ke non-anggota.
 *
 * Tetap terlihat untuk: peserta yang sudah terdaftar, petugas event, dan
 * pengelola event di Portal. Tidak tampil di website / mode tamu (publik).
 */
import { prisma, type Prisma } from '@ecc/database';
import { BadRequest } from './errors.js';

/** Event yang boleh dilihat jemaat ini di app (gabungkan dengan AND ke where lain). */
export function eventAudienceVisibleWhere(jemaatId: string): Prisma.EventWhereInput {
  return {
    OR: [
      { audiencePelayanan: { none: {} } },
      { audiencePelayanan: { some: { pelayanan: { jemaatPelayanan: { some: { jemaatId, isActive: true } } } } } },
      { partisipasi: { some: { jemaatId, status: { not: 'BATAL' } } } },
      { pelayanan: { some: { petugas: { some: { jemaatId } } } } },
    ],
  };
}

/** Untuk endpoint publik (website / tamu): event khusus pelayanan disembunyikan. */
export const EVENT_PUBLIC_AUDIENCE: Prisma.EventWhereInput = { audiencePelayanan: { none: {} } };

/** Label syarat untuk app/web: "Anggota pelayanan Worship atau Multimedia". */
export function audienceLabel(names: string[]): string | null {
  if (!names.length) return null;
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} atau ${names[names.length - 1]}`;
  return `Anggota pelayanan ${list}`;
}

/** Nama pelayanan audiens event + apakah jemaat anggota aktif salah satunya. */
export async function eventAudienceStatus(
  eventId: string,
  jemaatId: string | null,
): Promise<{ names: string[]; ok: boolean }> {
  const rows = await prisma.eventAudiencePelayanan.findMany({
    where: { eventId },
    select: { pelayananId: true, pelayanan: { select: { nama: true } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!rows.length) return { names: [], ok: true };
  const names = rows.map((r) => r.pelayanan.nama);
  if (!jemaatId) return { names, ok: false };
  const member = await prisma.jemaatPelayanan.findFirst({
    where: { jemaatId, isActive: true, pelayananId: { in: rows.map((r) => r.pelayananId) } },
    select: { id: true },
  });
  return { names, ok: !!member };
}

/** Simpan audiens (replace all). `undefined` = tidak diubah. */
export async function saveEventAudience(eventId: string, ids: string[] | undefined): Promise<void> {
  if (ids === undefined) return;
  const unique = [...new Set(ids)];
  if (unique.length) {
    const found = await prisma.pelayanan.count({ where: { id: { in: unique }, isActive: true } });
    if (found !== unique.length) throw BadRequest('Pelayanan audiens tidak ditemukan atau nonaktif.');
  }
  await prisma.$transaction([
    prisma.eventAudiencePelayanan.deleteMany({ where: { eventId } }),
    ...(unique.length
      ? [prisma.eventAudiencePelayanan.createMany({ data: unique.map((pelayananId) => ({ eventId, pelayananId })) })]
      : []),
  ]);
}

export const eventAudienceInclude = {
  audiencePelayanan: {
    orderBy: { createdAt: 'asc' as const },
    select: { pelayanan: { select: { id: true, nama: true } } },
  },
};
