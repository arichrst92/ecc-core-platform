/** Label zona waktu cabang untuk tampilan portal, mis. "Waktu Kuala Lumpur" / "Waktu Bali". */
const CITY: Record<string, string> = {
  'Asia/Jakarta': 'Jakarta',
  'Asia/Pontianak': 'Pontianak',
  'Asia/Makassar': 'Makassar',
  'Asia/Jayapura': 'Jayapura',
  'Asia/Kuala_Lumpur': 'Kuala Lumpur',
  'Asia/Kuching': 'Kuching',
  'Asia/Singapore': 'Singapura',
};

/** Cabang untuk label: kolom `kota` bila diisi, selain itu nama tanpa awalan "ECC". */
export type CabangLabel = { nama?: string | null; kota?: string | null; timezone?: string | null } | null | undefined;

export function cabangKota(c: CabangLabel): string | null {
  const k = c?.kota?.trim();
  if (k) return k;
  const n = (c?.nama ?? '').replace(/^\s*ECC\s+/i, '').trim();
  return n || null;
}

/** Sama dengan server & app: ECC Bali (Asia/Makassar) → "Waktu Bali". */
export function tzZoneLabel(tz: string | null | undefined, cabang?: CabangLabel): string {
  const key = tz || 'Asia/Jakarta';
  return `Waktu ${cabangKota(cabang) ?? CITY[key] ?? (key.split('/').pop() ?? key).replace(/_/g, ' ')}`;
}

/** "10.00–12.00 Waktu Kuala Lumpur". */
export function jamZone(
  jamMulai: string | null | undefined,
  jamSelesai: string | null | undefined,
  tz: string | null | undefined,
  cabang?: CabangLabel,
): string {
  if (!jamMulai) return tzZoneLabel(tz, cabang);
  return `${jamMulai}${jamSelesai ? `–${jamSelesai}` : ''} ${tzZoneLabel(tz, cabang)}`;
}
