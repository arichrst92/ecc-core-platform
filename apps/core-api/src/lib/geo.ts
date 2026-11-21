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
 *   - Link TANPA koordinat (…?q=Nama+Tempat, /maps/place/Nama/…) → titik
 *     diambil dari halaman Google Maps, cadangan geocoding OpenStreetMap.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/** Presisi koordinat yang disimpan: 7 angka di belakang koma (±1 cm). */
export const COORD_DECIMALS = 7;

/** Bulatkan koordinat ke 7 angka di belakang koma. */
export function roundCoord(v: number): number {
  return Number(v.toFixed(COORD_DECIMALS));
}

function valid(lat: number, lng: number): LatLng | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat: roundCoord(lat), lng: roundCoord(lng) };
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

/** Link Google Maps (pendek / panjang / maps.google.*). */
export function isMapsLink(input: string): boolean {
  if (isShortMapsLink(input)) return true;
  try {
    const u = new URL(input.trim());
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (/^maps\.google\.[a-z.]+$/.test(h)) return true;
    return /(^|\.)google\.[a-z.]+$/.test(h) && u.pathname.startsWith('/maps');
  } catch {
    return false;
  }
}

/**
 * Koordinat dari isi halaman Google Maps (untuk link tanpa koordinat, mis.
 * maps.app.goo.gl yang berujung ke ?q=Nama+Tempat&ftid=… atau /place/Nama/data=…).
 * Urutan: penanda tempat (!3d!4d), gambar peta statis (center= / markers=),
 * link kanonik (/@lat,lng), lalu pusat tampilan awal (APP_INITIALIZATION_STATE) — yang
 * berbasis tampilan hanya diterima bila peta diperbesar dekat (lihat Ranked).
 */
export function extractCoordsFromMapsHtml(html: string): LatLng | null {
  return extractCoordsFromMapsHtmlRanked(html).place ?? extractCoordsFromMapsHtmlRanked(html).view;
}

/**
 * `place` = penanda tempat (!3d!4d / markers=) — titik usaha yang sebenarnya.
 * `view`  = pusat tampilan peta (/@lat,lng). Hanya cadangan terakhir.
 * 2026-11: pusat tampilan awal halaman (APP_INITIALIZATION_STATE / center=) TIDAK
 * dipakai lagi — untuk link tanpa titik, Google mengirim tampilan bawaan yang
 * sama untuk semua link (mis. di laut utara Jakarta), sehingga banyak pin
 * menumpuk di satu titik yang salah.
 */
export function extractCoordsFromMapsHtmlRanked(html: string): { place: LatLng | null; view: LatLng | null } {
  const first = (re: RegExp, order: 'latlng' | 'lnglat', accept?: (m: RegExpExecArray) => boolean) => {
    const g = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(html))) {
      if (accept && !accept(m)) continue;
      const a = Number(m[1]);
      const b = Number(m[2]);
      const v = order === 'lnglat' ? valid(b, a) : valid(a, b);
      if (v) return v;
    }
    return null;
  };
  const place =
    first(new RegExp(`!3d${NUM}!4d${NUM}`), 'latlng') ??
    first(new RegExp(`[?&;]markers=${NUM}(?:%2C|,)\\s*${NUM}`), 'latlng') ??
    // Gambar peta statis: hanya bila diperbesar ke satu tempat (zoom ≥ 14).
    first(new RegExp(`[?&;]center=${NUM}(?:%2C|,)\\s*${NUM}(?:&amp;|&)zoom=(\\d+)`), 'latlng', (m) => Number(m[3]) >= 14) ??
    // Tampilan awal [jarak kamera(m), lng, lat]: hanya bila dekat (≤ 20 km) — tampilan bawaan
    // untuk link tanpa titik berjarak jauh & sama untuk semua link (mis. di laut utara Jakarta).
    appInit(html);
  // Pusat peta di link kanonik (/@lat,lng,zoom) — cadangan, hanya bila diperbesar (zoom ≥ 14).
  const view = first(new RegExp(`/@${NUM},${NUM},(\\d+(?:\\.\\d+)?)z`), 'latlng', (m) => Number(m[3]) >= 14);
  return { place, view };
}

/** Tampilan awal halaman: [jarak kamera (m), lng, lat] — hanya bila dekat (≤ 20 km). */
function appInit(html: string): LatLng | null {
  const m = new RegExp(`APP_INITIALIZATION_STATE=\\[\\[\\[([\\d.]+),${NUM},${NUM}\\]`).exec(html);
  if (!m || Number(m[1]) > 20_000) return null;
  return valid(Number(m[3]), Number(m[2]));
}

/** Nama tempat / alamat dari URL Google Maps tanpa koordinat (untuk geocoding). */
export function placeTextFromMapsUrl(url: string): string | null {
  try {
    const u = new URL(url);
    for (const k of ['q', 'query', 'destination', 'daddr']) {
      const v = u.searchParams.get(k);
      if (v && !parseMapsCoordinates(v) && /\p{L}/u.test(v)) return v.replace(/\+/g, ' ').trim();
    }
    const m = /\/maps\/(?:place|search)\/([^/]+)/.exec(u.pathname);
    if (m) {
      const t = decodeURIComponent(m[1]!).replace(/\+/g, ' ').trim();
      if (t && /\p{L}/u.test(t)) return t;
    }
  } catch {
    // abaikan
  }
  return null;
}

const UA_BROWSER =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Variasi teks untuk geocoding nama tempat dari link Google Maps, mis.
 * "Bengkel T.H.O.R (The House Of Racing) - Bandung, Jl. BKR No.88a, Cigereleng, Kec. Regol, Kota Bandung, Jawa Barat 40254"
 *   1. teks utuh (tanpa kurung)
 *   2. tanpa nama usaha (mulai bagian alamat setelah koma pertama)
 *   3. bagian alamat tanpa kode pos
 */
export function placeTextVariants(text: string): string[] {
  const clean = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const out = [clean];
  const comma = clean.indexOf(',');
  if (comma > 0) {
    const alamat = clean.slice(comma + 1).trim();
    if (/\p{L}/u.test(alamat)) {
      out.push(alamat);
      const noPos = alamat.replace(/\s+\d{5}\b/g, '').trim();
      if (noPos !== alamat) out.push(noPos);
    }
  }
  return [...new Set(out)].filter(Boolean);
}

/**
 * Geocoding nama tempat / alamat (cadangan terakhir): Google Geocoding bila
 * GOOGLE_GEOCODING_API_KEY ada, lalu OpenStreetMap Nominatim. Hanya hasil yang
 * cukup tepat (tingkat bangunan / jalan / kawasan) yang dipakai — titik tengah
 * kota tidak.
 */
async function geocodeText(text: string): Promise<LatLng | null> {
  const variants = placeTextVariants(text.slice(0, 300));
  try {
    const g = await import('./jemaat-geocode.js');
    const negara = null;
    for (const v of variants) {
      const hit = process.env.GOOGLE_GEOCODING_API_KEY?.trim()
        ? await g.geocodeGoogle(v, negara).catch(() => null)
        : await g.geocodeNominatim(v, negara).catch(() => null);
      if (hit && hit !== 'UMUM') return valid(hit.lat, hit.lng);
    }
  } catch {
    // abaikan — kembali null
  }
  return null;
}

/**
 * Koordinat dari teks/link Google Maps:
 *  1. koordinat langsung di teks/URL;
 *  2. link pendek → ikuti redirect (maks 6), parse tiap URL;
 *  3. link tanpa koordinat → baca halaman Google Maps & ambil titiknya;
 *  4. cadangan: geocoding nama tempat / alamat dari link (OpenStreetMap).
 */
export async function resolveMapsLocation(input: string): Promise<LatLng | null> {
  const direct = parseMapsCoordinates(input);
  if (direct || !isMapsLink(input)) return direct;
  let url = input.trim();
  const headers = {
    'User-Agent': UA_BROWSER,
    'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
    // Lewati halaman persetujuan cookie Google (consent.google.com).
    Cookie: 'CONSENT=YES+cb; SOCS=CAI',
  };
  let viewFallback: LatLng | null = null;
  // 2. ikuti redirect manual
  for (let i = 0; i < 6; i++) {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, { method: 'GET', redirect: 'manual', headers }, 5000);
    } catch {
      break;
    }
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!loc) {
      // 3. halaman akhir → cari titik di HTML
      try {
        const html = (await res.text()).slice(0, 3_000_000);
        const found = extractCoordsFromMapsHtmlRanked(html);
        if (found.place) return found.place;
        viewFallback = found.view;
      } catch {
        // abaikan
      }
      break;
    }
    const next = new URL(loc, url);
    // consent.google.com?continue=<url asli> → lanjut ke URL asli
    const cont = next.hostname.startsWith('consent.') ? next.searchParams.get('continue') : null;
    url = cont ?? next.toString();
    const found = parseMapsCoordinates(url);
    if (found) return found;
  }
  // 4. geocoding nama tempat / alamat dari link, baru pusat tampilan peta (bila tak ada nama).
  const text = placeTextFromMapsUrl(url) ?? placeTextFromMapsUrl(input.trim());
  if (text) return geocodeText(text);
  return viewFallback;
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
  'Lokasi tidak ditemukan dari link Google Maps tersebut. Coba link "Bagikan" dari Google Maps, atau tempel koordinat (mis. -6.2088, 106.8456).';

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
