/** Resolusi Tahunan — helper bersama (me + admin read-only). */
import { prisma } from '@ecc/database';

export const resolusiSelect = {
  id: true,
  tahun: true,
  judul: true,
  catatan: true,
  kategori: true,
  isDone: true,
  doneAt: true,
  urutan: true,
  ayatVersi: true,
  ayatKitab: true,
  ayatBab: true,
  ayatMulai: true,
  ayatSelesai: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Daftar resolusi satu jemaat untuk satu tahun + daftar tahun yang punya data. */
export async function loadResolusi(jemaatId: string, tahun: number) {
  const [items, years] = await Promise.all([
    prisma.resolusi.findMany({
      where: { jemaatId, tahun },
      orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
      select: resolusiSelect,
    }),
    prisma.resolusi.groupBy({
      by: ['tahun'],
      where: { jemaatId },
      _count: { _all: true },
      orderBy: { tahun: 'asc' },
    }),
  ]);
  const done = items.filter((i) => i.isDone).length;
  return {
    tahun,
    years: years.map((y) => ({ tahun: y.tahun, total: y._count._all })),
    items,
    progress: { done, total: items.length },
  };
}

/** Body `ayat` (create/update) → kolom DB. undefined = tidak diubah, null = lepas tautan. */
export function ayatData(ayat: { versi: string; kitab: number; bab: number; mulai: number; selesai?: number | null } | null | undefined) {
  if (ayat === undefined) return {};
  if (ayat === null) return { ayatVersi: null, ayatKitab: null, ayatBab: null, ayatMulai: null, ayatSelesai: null };
  return {
    ayatVersi: ayat.versi,
    ayatKitab: ayat.kitab,
    ayatBab: ayat.bab,
    ayatMulai: ayat.mulai,
    ayatSelesai: ayat.selesai && ayat.selesai > ayat.mulai ? ayat.selesai : null,
  };
}
