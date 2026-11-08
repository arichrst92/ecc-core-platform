/** Tipe & format harga item katalog Local Market (2.4.7). */
export interface KatalogItem {
  id: string;
  jenis: 'PRODUK' | 'JASA';
  nama: string;
  deskripsi: string | null;
  hargaTipe: 'TETAP' | 'MULAI_DARI' | 'NEGO';
  harga: number | null;
  mataUang: string;
  satuan: string | null;
  fotoUrls: string[];
  marketplaceLinks?: Partial<Record<'shopee' | 'lazada' | 'tiktokshop' | 'tokopedia', string>> | null;
}

const SYMBOL: Record<string, string> = { IDR: 'Rp', AUD: 'A$', SGD: 'S$', MYR: 'RM', USD: 'US$', EUR: '€', NZD: 'NZ$', HKD: 'HK$', TWD: 'NT$', CNY: '¥', JPY: '¥' };
export function hargaText(it: Pick<KatalogItem, 'hargaTipe' | 'harga' | 'mataUang' | 'satuan'>): string {
  if (it.hargaTipe === 'NEGO' || it.harga == null) return 'Harga by agreement';
  const n = it.harga.toLocaleString(it.mataUang === 'IDR' ? 'id-ID' : 'en-US', { maximumFractionDigits: 2 });
  return `${it.hargaTipe === 'MULAI_DARI' ? 'Mulai ' : ''}${SYMBOL[it.mataUang] ?? it.mataUang} ${n}${it.satuan ? `/${it.satuan}` : ''}`;
}

