/**
 * Label zona waktu cabang untuk tanggal & jam di website.
 * Indonesia: WIB / WITA / WIT. Zona lain: singkatan offset (mis. GMT+8).
 */
const ID_TZ: Record<string, string> = {
  'Asia/Jakarta': 'WIB',
  'Asia/Pontianak': 'WIB',
  'Asia/Makassar': 'WITA',
  'Asia/Jayapura': 'WIT',
};

export const DEFAULT_TZ = 'Asia/Jakarta';

export function tzLabel(tz?: string | null): string {
  const z = tz || DEFAULT_TZ;
  if (ID_TZ[z]) return ID_TZ[z];
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: z, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value;
    return part ?? z;
  } catch {
    return z;
  }
}
