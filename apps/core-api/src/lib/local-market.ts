/**
 * Local Market katalog (2.4.7) — helper bersama (app, portal, publik).
 */
import { prisma } from '@ecc/database';
import type { LocalBusinessItem } from '@ecc/database';

export type LocalItemDto = Omit<LocalBusinessItem, 'harga' | 'fotoUrls'> & { harga: number | null; fotoUrls: string[] };

export function serializeItem(it: LocalBusinessItem): LocalItemDto {
  return { ...it, harga: it.harga == null ? null : Number(it.harga), fotoUrls: Array.isArray(it.fotoUrls) ? (it.fotoUrls as string[]) : [] };
}

/** Item yang tampil ke publik: aktif & tidak disembunyikan admin. */
export async function publicItemsOf(businessId: string): Promise<LocalItemDto[]> {
  const rows = await prisma.localBusinessItem.findMany({
    where: { businessId, isActive: true, isHiddenByAdmin: false },
    orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(serializeItem);
}

export async function localMarketMaxItems(): Promise<number> {
  const row = await prisma.appConfig.findUnique({ where: { id: 'global' }, select: { localMarketMaxItems: true } });
  return row?.localMarketMaxItems ?? 50;
}

const SYMBOL: Record<string, string> = { IDR: 'Rp', AUD: 'A$', SGD: 'S$', MYR: 'RM', USD: 'US$', EUR: '€', NZD: 'NZ$', HKD: 'HK$', TWD: 'NT$', CNY: '¥', JPY: '¥' };

/** "Rp 25.000", "Mulai A$ 50", "By agreement" — untuk OG & web. */
export function hargaLabel(it: Pick<LocalItemDto, 'hargaTipe' | 'harga' | 'mataUang' | 'satuan'>): string {
  if (it.hargaTipe === 'NEGO' || it.harga == null) return 'Harga by agreement';
  const sym = SYMBOL[it.mataUang] ?? it.mataUang;
  const num = it.harga.toLocaleString(it.mataUang === 'IDR' ? 'id-ID' : 'en-US', { maximumFractionDigits: 2 });
  return `${it.hargaTipe === 'MULAI_DARI' ? 'Mulai ' : ''}${sym} ${num}${it.satuan ? `/${it.satuan}` : ''}`;
}
