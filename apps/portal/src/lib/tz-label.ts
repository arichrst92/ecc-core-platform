/** Label zona waktu cabang untuk tampilan portal, mis. "Waktu Kuala Lumpur". */
const CITY: Record<string, string> = {
  'Asia/Jakarta': 'Jakarta',
  'Asia/Pontianak': 'Pontianak',
  'Asia/Makassar': 'Makassar',
  'Asia/Jayapura': 'Jayapura',
  'Asia/Kuala_Lumpur': 'Kuala Lumpur',
  'Asia/Kuching': 'Kuching',
  'Asia/Singapore': 'Singapura',
};

export function tzZoneLabel(tz: string | null | undefined): string {
  const key = tz || 'Asia/Jakarta';
  return `Waktu ${CITY[key] ?? (key.split('/').pop() ?? key).replace(/_/g, ' ')}`;
}

/** "10.00–12.00 Waktu Kuala Lumpur". */
export function jamZone(jamMulai: string | null | undefined, jamSelesai: string | null | undefined, tz: string | null | undefined): string {
  if (!jamMulai) return tzZoneLabel(tz);
  return `${jamMulai}${jamSelesai ? `–${jamSelesai}` : ''} ${tzZoneLabel(tz)}`;
}
