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

// ===== Jumlah kunjungan (2.4.7) =====
// Dedupe 1x per 30 menit per pengunjung (jemaatId di app, IP di web) supaya
// refresh / bolak-balik layar tidak menggelembungkan angka. In-memory per
// proses — cukup untuk statistik kasar. UPDATE raw supaya updatedAt tidak ikut berubah.
const VIEW_TTL = 30 * 60_000;
const seenViews = new Map<string, number>();

export async function hitView(kind: 'biz' | 'item', id: string, viewerKey: string): Promise<void> {
  const key = `${kind}:${id}:${viewerKey}`;
  const now = Date.now();
  const last = seenViews.get(key);
  if (last && now - last < VIEW_TTL) return;
  seenViews.set(key, now);
  if (seenViews.size > 50_000) {
    for (const [k, t] of seenViews) if (now - t > VIEW_TTL) seenViews.delete(k);
  }
  try {
    if (kind === 'biz') {
      await prisma.$executeRaw`UPDATE "local_business" SET "view_count" = "view_count" + 1 WHERE "id" = ${id}::uuid AND "is_active" = true`;
    } else {
      await prisma.$executeRaw`UPDATE "local_business_item" SET "view_count" = "view_count" + 1 WHERE "id" = ${id}::uuid AND "is_active" = true AND "is_hidden_by_admin" = false`;
    }
  } catch {
    /* statistik — jangan ganggu request */
  }
}
