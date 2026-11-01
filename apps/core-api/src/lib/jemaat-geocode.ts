/**
 * Perkiraan titik rumah jemaat dari ALAMAT — hanya untuk peta sebaran di
 * Portal → Map View (tanpa nama). Tidak dipakai untuk petunjuk arah dan tidak
 * dikirim ke aplikasi.
 *
 * Layanan: Google Geocoding API bila GOOGLE_GEOCODING_API_KEY diisi (lebih tepat
 * untuk alamat Indonesia; hasil koordinat Google disegarkan maks. tiap 30 hari
 * sesuai ketentuan penyimpanan Google). Tanpa kunci → OpenStreetMap Nominatim.
 * Aturan Nominatim dipatuhi:
 *   - maks 1 permintaan/detik (jeda 1,1 detik), satu proses sekaligus;
 *   - User-Agent jelas; hasil disimpan (cache) — alamat yang sama tidak
 *     ditanyakan ulang; diproses bertahap, bukan sekaligus.
 * Tanpa batas jarak dari cabang: supaya tidak tertukar dengan kota lain, nama
 * kota cabang (mis. "ECC Bandung" → "Bandung") selalu ditambahkan ke alamat
 * yang belum menyebut kota itu.
 *
 * Env:
 *   GEOCODE_JEMAAT_ENABLED=0   matikan proses (default aktif)
 *   NOMINATIM_URL               default https://nominatim.openstreetmap.org
 *   NOMINATIM_EMAIL             opsional, kontak untuk operator Nominatim
 *   GOOGLE_GEOCODING_API_KEY    kunci server (dibatasi IP VPS) → pakai Google
 */
import { createHash } from 'node:crypto';
import { prisma } from '@ecc/database';
import { roundCoord } from './geo.js';
import { logger } from './logger.js';

const BASE = (process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
const USER_AGENT = 'ElsApp-ECC-Portal/1.0 (map view sebaran jemaat; https://eccchurch.global)';
const GOOGLE_KEY = process.env.GOOGLE_GEOCODING_API_KEY?.trim() || '';
const USE_GOOGLE = !!GOOGLE_KEY;
// Google: cepat (jauh di bawah batas kuota per detik); Nominatim: 1 permintaan/detik.
const GAP_MS = USE_GOOGLE ? 120 : 1100;
const BATCH = USE_GOOGLE ? 1000 : 250;
/** Hasil Google boleh disimpan maks. 30 hari → disegarkan setelah itu. */
const GOOGLE_REFRESH_DAYS = 30;
/** Naikkan versi bila aturan berubah → semua alamat diproses ulang bertahap. */
export const GEOCODE_VERSION = USE_GOOGLE ? 'google-v3' : 'nominatim-v5';
/** Versi lama yang hasil OK-nya masih dipakai (hanya yang gagal diproses ulang). */
const OK_STILL_VALID: string[] = [];

export const alamatHash = (alamat: string) => createHash('md5').update(alamat, 'utf8').digest('hex');

export function cleanAlamat(alamat: string): string {
  return alamat.replace(/\s+/g, ' ').replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim().slice(0, 250);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** placeId (Google) boleh disimpan permanen → dipakai untuk tautan Google Maps. */
type Hit = { lat: number; lng: number; placeId?: string | null } | null;

/**
 * Negara cabang dari zona waktunya (cabang tidak menyimpan negara). Dipakai
 * supaya alamat jemaat cabang Sydney dicari di Australia, bukan dipaksa ke Indonesia.
 */
export function negaraDariZona(tz: string | null | undefined): string | null {
  const z = tz ?? '';
  if (/^Asia\/(Jakarta|Pontianak|Makassar|Jayapura)$/.test(z)) return 'id';
  if (z.startsWith('Australia/')) return 'au';
  if (/^Asia\/(Kuala_Lumpur|Kuching)$/.test(z)) return 'my';
  if (z === 'Asia/Singapore') return 'sg';
  if (z === 'Pacific/Auckland') return 'nz';
  return null;
}

/**
 * Hasil Google yang terlalu kasar (negara, provinsi, kabupaten, pulau/alam) ditolak:
 * Google mengembalikan titik tengah wilayah itu bila alamatnya tidak dikenali —
 * mis. semua alamat yang gagal jatuh di tengah Kalimantan.
 */
const TERLALU_KASAR = new Set([
  'country', 'continent', 'administrative_area_level_1', 'administrative_area_level_2',
  'natural_feature', 'colloquial_area', 'archipelago',
]);

/** Satu permintaan ke Nominatim. Lempar error bila layanan menolak (429/5xx) supaya batch berhenti. */
export async function geocodeNominatim(alamat: string, negara: string | null): Promise<Hit> {
  const p = new URLSearchParams({ q: alamat, format: 'jsonv2', limit: '1', 'accept-language': 'id' });
  if (process.env.NOMINATIM_EMAIL) p.set('email', process.env.NOMINATIM_EMAIL);
  if (negara) p.set('countrycodes', negara);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${BASE}/search?${p}`, { headers: { 'User-Agent': USER_AGENT }, signal: ctrl.signal });
    if (res.status === 429 || res.status >= 500) throw new Error(`nominatim ${res.status}`);
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string; place_rank?: number }[];
    const r = rows[0];
    if (!r) return null;
    if ((r.place_rank ?? 30) < 16) return null; // lebih kasar dari kota → tolak
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: roundCoord(lat), lng: roundCoord(lng) };
  } finally {
    clearTimeout(timer);
  }
}

/** Google Geocoding API — dibatasi ke negara cabang. */
export async function geocodeGoogle(alamat: string, negara: string | null): Promise<Hit> {
  const p = new URLSearchParams({
    address: alamat,
    key: GOOGLE_KEY,
    language: 'id',
    region: negara ?? 'id',
  });
  if (negara) p.set('components', `country:${negara.toUpperCase()}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${p}`, { signal: ctrl.signal });
    if (res.status === 429 || res.status >= 500) throw new Error(`google ${res.status}`);
    const body = (await res.json()) as {
      status: string;
      error_message?: string;
      results?: { place_id?: string; types?: string[]; geometry: { location: { lat: number; lng: number } } }[];
    };
    if (body.status === 'ZERO_RESULTS') return null;
    // Kunci salah / kuota habis / API belum diaktifkan → hentikan batch & tampilkan di Portal.
    if (body.status !== 'OK') throw new Error(`google ${body.status}${body.error_message ? `: ${body.error_message}` : ''}`);
    const top = body.results?.[0];
    const loc = top?.geometry.location;
    if (!loc) return null;
    if ((top?.types ?? []).some((t) => TERLALU_KASAR.has(t))) return null; // titik tengah wilayah, bukan alamat
    return { lat: roundCoord(loc.lat), lng: roundCoord(loc.lng), placeId: top?.place_id ?? null };
  } finally {
    clearTimeout(timer);
  }
}

const geocodeOne = (q: string, negara: string | null) => (USE_GOOGLE ? geocodeGoogle(q, negara) : geocodeNominatim(q, negara));

type Pending = { id: string; alamat: string; clat: number | null; clng: number | null; cnama: string; ctz: string | null };

// ------------------------------------------------------------------ variasi kueri

/** "ECC Bandung" → "Bandung" (kota untuk alamat yang tidak menyebut kota). */
export function kotaDariCabang(nama: string): string {
  return nama.replace(/^\s*(ecc|gereja)\s+/i, '').trim();
}

/** Buang bagian yang tidak dikenal peta: no rumah, blok, kavling, RT/RW, gang, "Indonesia". */
export function normalizeAlamat(alamat: string): string {
  return cleanAlamat(alamat)
    .replace(/\bjln?\.?\s+/gi, 'Jalan ')
    .replace(/\bjl\.?(?=[A-Za-z])/gi, 'Jalan ')
    .replace(/\bkomp\.\s*/gi, 'Kompleks ')
    .replace(/\brt\.?\s*\d+\s*\/?\s*rw\.?\s*\d+/gi, '')
    .replace(/\b(rt|rw)\.?\s*\d+/gi, '')
    .replace(/\bblok\s*[\w./-]+(\s*(no|nomor)\.?\s*[\w/-]+)?/gi, '')
    .replace(/\b(no|nomor|kav(ling)?)\.?\s*[\w/-]+/gi, '')
    .replace(/\bgg\.?\s*[^,]+/gi, '')
    .replace(/\b(kec|kel|kab)\.\s*/gi, '')
    .replace(/\bindonesia\b/gi, '')
    .replace(/\s+\.(?=\s|,|$)/g, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/(,\s*)+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

/**
 * Variasi pencarian dari paling tepat ke paling umum (maks 4, berhenti di yang
 * pertama ketemu): alamat asli → alamat dirapikan + kota cabang → nama
 * jalan/perumahan + kota → bagian wilayah (kelurahan, kecamatan, kota).
 */
export function buildQueries(alamat: string, kota: string): string[] {
  const raw = cleanAlamat(alamat);
  const norm = normalizeAlamat(alamat);
  const withKota = (s: string) => (kota && !s.toLowerCase().includes(kota.toLowerCase()) ? `${s}, ${kota}` : s);
  const parts = norm.split(',').map((p) => p.trim()).filter(Boolean);
  // Nama jalan / perumahan tanpa awalan kompleks/perumahan/apartemen.
  const first = (parts[0] ?? '').replace(/^(kompleks|komplek|perumahan|perum|apartemen|apt)\.?\s+/i, '').trim();
  // Wilayah (kelurahan/kecamatan/kota) tanpa bagian pertama; harus memuat
  // minimal satu nama wilayah kecil — bukan cuma kota/provinsi (terlalu umum).
  const umum = (p: string) =>
    p.toLowerCase() === kota.toLowerCase() ||
    /^(kota|kab(upaten)?)\.?\s/i.test(p) ||
    /^(provinsi\s+)?(jawa|sumatera|sumatra|kalimantan|sulawesi|bali|papua|nusa tenggara|dki|di yogyakarta|banten|riau|aceh|lampung|bengkulu|jambi|gorontalo|maluku)/i.test(p);
  const sisa = parts.slice(1).slice(-3);
  const wilayah = sisa.some((p) => !umum(p)) ? sisa.join(', ') : '';
  // Kota cabang selalu ditambahkan (bila belum disebut) supaya tidak tertukar kota lain.
  const out = [withKota(raw), withKota(norm), first ? withKota(first) : '', wilayah ? withKota(wilayah) : ''];
  const seen = new Set<string>();
  return out.filter((q) => {
    const k = q.toLowerCase();
    if (q.length < 6 || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Jemaat aktif (bukan tamu) beralamat yang belum diproses / alamatnya berubah. */
async function pending(limit: number): Promise<Pending[]> {
  return prisma.$queryRaw<Pending[]>`
    SELECT j.id, j.alamat, c.latitude AS clat, c.longitude AS clng, c.nama AS cnama, c.timezone AS ctz
    FROM jemaat j
    JOIN cabang_gereja c ON c.id = j.cabang_id
    LEFT JOIN jemaat_geocode g ON g.jemaat_id = j.id
    WHERE j.is_active = true AND j.is_tamu = false
      AND COALESCE(TRIM(j.alamat), '') <> ''
      AND (
        g.jemaat_id IS NULL
        OR g.alamat_hash <> md5(j.alamat)
        OR (g.provider NOT LIKE ${GEOCODE_VERSION + '%'} AND NOT (g.status = 'OK' AND g.provider = ANY(${OK_STILL_VALID})))
        OR g.status = 'NO_CABANG'
        OR (${USE_GOOGLE} AND g.provider LIKE 'google%' AND g.updated_at < NOW() - make_interval(days => ${GOOGLE_REFRESH_DAYS}::int))
      )
    ORDER BY j.created_at DESC
    LIMIT ${limit}
  `;
}

let running = false;

/** Status proses (di memori proses server) — untuk progress bar di Map View. */
export const geocodeState: {
  running: boolean;
  startedAt: string | null;
  batchSize: number;
  batchDone: number;
  lastRunAt: string | null;
  lastResult: { processed: number; ok: number; notFound: number; stopped?: string } | null;
  lastError: string | null;
} = { running: false, startedAt: null, batchSize: 0, batchDone: 0, lastRunAt: null, lastResult: null, lastError: null };

export const geocodeEnabled = () => process.env.GEOCODE_JEMAAT_ENABLED !== '0';
export const geocodeProvider = USE_GOOGLE ? 'Google Maps' : 'OpenStreetMap';
export const geocodePerBatch = BATCH;

/** Proses satu batch (dipanggil job berkala). Aman dipanggil berulang — hanya satu yang jalan. */
export async function geocodeJemaatBatch(): Promise<{ processed: number; ok: number; notFound: number; stopped?: string }> {
  if (!geocodeEnabled()) return { processed: 0, ok: 0, notFound: 0, stopped: 'disabled' };
  if (running) return { processed: 0, ok: 0, notFound: 0, stopped: 'already-running' };
  running = true;
  let processed = 0;
  let ok = 0;
  let notFound = 0;
  let result: { processed: number; ok: number; notFound: number; stopped?: string } | null = null;
  Object.assign(geocodeState, { running: true, startedAt: new Date().toISOString(), batchSize: 0, batchDone: 0, lastError: null });
  try {
    const rows = await pending(BATCH);
    geocodeState.batchSize = rows.length;
    for (const r of rows) {
      const all = buildQueries(r.alamat, kotaDariCabang(r.cnama ?? ''));
      // Google cukup 2 variasi (alamat + kota, lalu dirapikan); Nominatim sampai 4.
      const queries = USE_GOOGLE ? all.slice(0, 2) : all;
      const negara = negaraDariZona(r.ctz);
      let hit: Hit = null;
      let tahap = 0;
      try {
        for (let i = 0; i < queries.length && !hit; i++) {
          if (i > 0) await sleep(GAP_MS);
          hit = await geocodeOne(queries[i]!, negara);
          tahap = i + 1;
        }
        // Cadangan: alamat di luar negara cabang (mis. jemaat cabang Sydney yang
        // alamatnya di Indonesia) → cari alamat apa adanya, tanpa kota cabang & tanpa
        // batas negara. Hasil yang terlalu kasar tetap ditolak.
        if (!hit && negara && r.alamat.trim().length >= 6) {
          await sleep(GAP_MS);
          hit = await geocodeOne(r.alamat.trim(), null);
          tahap = 9;
        }
      } catch (err) {
        logger.warn({ err }, 'geocode-jemaat: layanan menolak, batch dihentikan');
        geocodeState.lastError = err instanceof Error ? err.message : String(err);
        result = { processed, ok, notFound, stopped: 'rate-limited' };
        return result;
      }
      const status: 'OK' | 'NOT_FOUND' = hit ? 'OK' : 'NOT_FOUND';
      const data = {
        alamatHash: alamatHash(r.alamat),
        status,
        latitude: status === 'OK' ? hit!.lat : null,
        longitude: status === 'OK' ? hit!.lng : null,
        placeId: status === 'OK' ? (hit!.placeId ?? null) : null,
        // Tahap variasi yang berhasil (1 = alamat asli, 4 = tingkat wilayah) — untuk evaluasi ketepatan.
        provider: status === 'OK' ? `${GEOCODE_VERSION}/${tahap}` : GEOCODE_VERSION,
      };
      await prisma.jemaatGeocode.upsert({ where: { jemaatId: r.id }, create: { jemaatId: r.id, ...data }, update: data });
      processed++;
      geocodeState.batchDone = processed;
      if (status === 'OK') ok++;
      else notFound++;
      await sleep(GAP_MS);
    }
    result = { processed, ok, notFound };
    return result;
  } catch (err) {
    geocodeState.lastError = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    running = false;
    Object.assign(geocodeState, { running: false, lastRunAt: new Date().toISOString(), lastResult: result ?? { processed, ok, notFound } });
  }
}

/** Dulu membatasi jarak dari cabang; batas dilepas — semua titik ditampilkan. */
export function nearCabang(p: { latitude: number | null; longitude: number | null }, _c?: unknown): boolean {
  return p.latitude != null && p.longitude != null;
}
