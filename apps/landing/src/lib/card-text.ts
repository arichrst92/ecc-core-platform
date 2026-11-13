/**
 * Kartu tinggi tetap: judul ditampilkan utuh (maks 3 baris, tidak pernah
 * terjepit), ringkasan menyesuaikan sisa ruang — makin panjang judul, makin
 * sedikit baris ringkasan. Kelas ditulis literal supaya terbaca Tailwind.
 */
const CLAMP = ['hidden', 'line-clamp-1', 'line-clamp-2', 'line-clamp-3', 'line-clamp-4'] as const;

/** Perkiraan jumlah baris judul (text-lg, kartu ±300px ≈ 24 karakter/baris). */
export function titleLines(judul: string, charsPerLine = 24): number {
  return Math.min(3, Math.max(1, Math.ceil(judul.trim().length / charsPerLine)));
}

/** Kelas clamp ringkasan: `base` baris saat judul 1 baris, dikurangi tiap baris judul tambahan. */
export function summaryClamp(judul: string, base: number, charsPerLine?: number): string {
  const n = Math.max(0, Math.min(4, base - (titleLines(judul, charsPerLine) - 1)));
  return CLAMP[n]!;
}

/** Kelas judul kartu: tidak menyusut, maks 3 baris. */
export const CARD_TITLE = 'shrink-0 font-bold text-lg leading-snug text-neutral-900 group-hover:text-brand-600 transition line-clamp-3';
