/**
 * Helper lokasi: ambil koordinat dari link / teks Google Maps + jarak.
 *
 * Format yang dikenali (lat, lng — WGS84):
 *   - "-6.2088, 106.8456"  (koordinat polos, mis. copy dari Google Maps)
 *   - https://www.google.com/maps/place/.../@-6.2088,106.8456,17z
 *   - https://www.google.com/maps/place/...!3d-6.2088!4d106.8456
 *   - https://maps.google.com/?q=-6.2088,106.8456   (juga ll=, query=, destination=)
 *   - Link pendek (maps.app.goo.gl / goo.gl/maps) → di-resolve dulu via
 *     redirect (resolveMapsLocation), lalu di-parse.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

function valid(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

/** Parse koordinat dari teks/URL (tanpa network). Null kalau tidak ketemu. */
export function parseMapsCoordinates(input: string | null | undefined): LatLng | null {
  if (!input) return null;
  let s = input.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // biarkan apa adanya
  }

  // 1. Penanda tempat paling akurat: !3d<lat>!4d<lng>
  let m = new RegExp(`!3d${NUM}!4d${NUM}`).exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]));

  // 2. Query param q / ll / query / destination / center
  m = new RegExp(`[?&](?:q|ll|query|destination|center|sll)=${NUM},\\s*${NUM}`).exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]));

  // 3. Pusat peta: /@<lat>,<lng>,<zoom>
  m = new RegExp(`@${NUM},${NUM}`).exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]));

  // 4. Koordinat polos "lat, lng" (seluruh input)
  m = new RegExp(`^${NUM}\\s*,\\s*${NUM}$`).exec(s);
  if (m) return valid(Number(m[1]), Number(m[2]));

  return null;
}

/** Link pendek Google Maps yang perlu di-resolve dulu. */
export function isShortMapsLink(input: string): boolean {
  return /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(input.trim());
}

/**
 * Parse koordinat; kalau link pendek, ikuti redirect (maks 5 lompatan,
 * timeout 5 detik) lalu parse URL tujuan.
 */
export async function resolveMapsLocation(input: string): Promise<LatLng | null> {
  const direct = parseMapsCoordinates(input);
  if (direct || !isShortMapsLink(input)) return direct;
  let url = input.trim();
  for (let i = 0; i < 5; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: ctrl.signal });
      const loc = res.headers.get('location');
      if (!loc) return null;
      url = new URL(loc, url).toString();
      const found = parseMapsCoordinates(url);
      if (found) return found;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Jarak garis lurus (km) — rumus haversine. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Link Google Maps / koordinat → kolom { mapsUrl, latitude, longitude }.
 * `null`/'' = hapus lokasi. `undefined` = tidak diubah (return undefined).
 * Link tanpa koordinat terbaca → null (pemanggil memutuskan error).
 */
export async function mapsUrlToFields(
  mapsUrl: string | null | undefined,
): Promise<{ mapsUrl: string | null; latitude: number | null; longitude: number | null } | null | undefined> {
  if (mapsUrl === undefined) return undefined;
  if (!mapsUrl || !mapsUrl.trim()) return { mapsUrl: null, latitude: null, longitude: null };
  const loc = await resolveMapsLocation(mapsUrl.trim());
  if (!loc) return null;
  return { mapsUrl: mapsUrl.trim(), latitude: loc.lat, longitude: loc.lng };
}

export const MAPS_URL_ERROR =
  'Koordinat tidak ditemukan di link Google Maps. Tempel koordinat (mis. -6.2088, 106.8456) atau link "Bagikan" dari Google Maps.';

/**
 * Radius self check-in butuh titik lokasi: titik ibadah/event sendiri, atau
 * titik cabang. Lempar pesan (string) kalau tidak ada titik sama sekali.
 */
export async function radiusPointError(args: {
  radiusM: number | null | undefined;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  cabangId: string | null | undefined;
}): Promise<string | null> {
  if (args.radiusM == null) return null;
  if (args.latitude != null && args.longitude != null) return null;
  if (args.cabangId) {
    const { prisma } = await import('@ecc/database');
    const c = await prisma.cabangGereja.findUnique({
      where: { id: args.cabangId },
      select: { latitude: true, longitude: true },
    });
    if (c?.latitude != null && c?.longitude != null) return null;
  }
  return 'Self check-in dengan radius butuh titik lokasi. Isi "Titik lokasi (link Google Maps)", atau pilih "Di mana saja".';
}
