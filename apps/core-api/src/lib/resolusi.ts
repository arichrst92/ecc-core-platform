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
