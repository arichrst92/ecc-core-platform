/**
 * Perkiraan titik rumah jemaat dari ALAMAT — hanya untuk peta sebaran di
 * Portal → Map View (tanpa nama). Tidak dipakai untuk petunjuk arah dan tidak
 * dikirim ke aplikasi.
 *
 * Layanan: OpenStreetMap Nominatim (gratis). Aturan pemakaiannya dipatuhi:
 *   - maks 1 permintaan/detik (jeda 1,1 detik), satu proses sekaligus;
 *   - User-Agent jelas; hasil disimpan (cache) — alamat yang sama tidak
 *     ditanyakan ulang; diproses bertahap, bukan sekaligus.
 * Pin SELALU dekat cabang jemaat: pencarian DIBATASI ke kotak ±50 km di
 * sekitar titik cabang (viewbox + bounded=1), dan hasil yang tetap lebih dari
 * GEOCODE_MAX_KM (default 50 km) dari cabang ditolak (TOO_FAR). Cabang tanpa
 * titik lokasi → alamat jemaatnya belum diproses (NO_CABANG) sampai cabang
 * diberi link Google Maps.
 *
 * Env:
 *   GEOCODE_JEMAAT_ENABLED=0   matikan proses (default aktif)
 *   NOMINATIM_URL               default https://nominatim.openstreetmap.org
 *   NOMINATIM_EMAIL             opsional, kontak untuk operator Nominatim
 */
import { createHash } from 'node:crypto';
import { prisma } from '@ecc/database';
import { distanceKm, roundCoord } from './geo.js';
import { logger } from './logger.js';

const BASE = (process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/+$/, '');
const USER_AGENT = 'ElsApp-ECC-Portal/1.0 (map view sebaran jemaat; https://eccchurch.global)';
const GAP_MS = 1100;
const BATCH = 250;
const MAX_FROM_CABANG_KM = Number(process.env.GEOCODE_MAX_KM ?? 50);
/** Naikkan versi bila aturan berubah → semua alamat diproses ulang bertahap. */
export const GEOCODE_VERSION = 'nominatim-v2';

export const alamatHash = (alamat: string) => createHash('md5').update(alamat, 'utf8').digest('hex');

export function cleanAlamat(alamat: string): string {
  return alamat.replace(/\s+/g, ' ').replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim().slice(0, 250);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Hit = { lat: number; lng: number } | null;

/** Satu permintaan ke Nominatim. Lempar error bila layanan menolak (429/5xx) supaya batch berhenti. */
export async function geocodeNominatim(alamat: string, near: { lat: number; lng: number }): Promise<Hit> {
  const p = new URLSearchParams({ q: alamat, format: 'jsonv2', limit: '1', 'accept-language': 'id' });
  if (process.env.NOMINATIM_EMAIL) p.set('email', process.env.NOMINATIM_EMAIL);
  // Hanya cari di kotak sekitar cabang (bounded=1) — tidak "lompat" ke kota lain.
  const dLat = MAX_FROM_CABANG_KM / 111;
  const dLng = MAX_FROM_CABANG_KM / (111 * Math.max(0.2, Math.cos((near.lat * Math.PI) / 180)));
  p.set('viewbox', `${near.lng - dLng},${near.lat + dLat},${near.lng + dLng},${near.lat - dLat}`);
  p.set('bounded', '1');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${BASE}/search?${p}`, { headers: { 'User-Agent': USER_AGENT }, signal: ctrl.signal });
    if (res.status === 429 || res.status >= 500) throw new Error(`nominatim ${res.status}`);
    if (!res.ok) return null;
    const rows = (await res.json()) as { lat: string; lon: string }[];
    const r = rows[0];
    if (!r) return null;
    const lat = Number(r.lat);
    const lng = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: roundCoord(lat), lng: roundCoord(lng) };
  } finally {
    clearTimeout(timer);
  }
}

type Pending = { id: string; alamat: string; clat: number | null; clng: number | null };

/** Jemaat aktif (bukan tamu) beralamat yang belum diproses / alamatnya berubah. */
async function pending(limit: number): Promise<Pending[]> {
  return prisma.$queryRaw<Pending[]>`
    SELECT j.id, j.alamat, c.latitude AS clat, c.longitude AS clng
    FROM jemaat j
    JOIN cabang_gereja c ON c.id = j.cabang_id
    LEFT JOIN jemaat_geocode g ON g.jemaat_id = j.id
    WHERE j.is_active = true AND j.is_tamu = false
      AND COALESCE(TRIM(j.alamat), '') <> ''
      AND (
        g.jemaat_id IS NULL
        OR g.alamat_hash <> md5(j.alamat)
        OR g.provider <> ${GEOCODE_VERSION}
        OR (g.status = 'NO_CABANG' AND c.latitude IS NOT NULL)
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
      const near = r.clat != null && r.clng != null ? { lat: r.clat, lng: r.clng } : null;
      const q = cleanAlamat(r.alamat);
      let hit: Hit = null;
      let status: 'OK' | 'NOT_FOUND' | 'TOO_FAR' | 'NO_CABANG';
      if (!near) {
        // Tanpa titik cabang, kedekatan tidak bisa dijamin → tunggu cabang diberi link.
        status = 'NO_CABANG';
      } else {
        try {
          hit = q.length >= 6 ? await geocodeNominatim(q, near) : null;
        } catch (err) {
          logger.warn({ err }, 'geocode-jemaat: layanan menolak, batch dihentikan');
          geocodeState.lastError = err instanceof Error ? err.message : String(err);
          result = { processed, ok, notFound, stopped: 'rate-limited' };
          return result;
        }
        status = !hit ? 'NOT_FOUND' : distanceKm(near, hit) > MAX_FROM_CABANG_KM ? 'TOO_FAR' : 'OK';
      }
      const data = {
        alamatHash: alamatHash(r.alamat),
        status,
        latitude: status === 'OK' ? hit!.lat : null,
        longitude: status === 'OK' ? hit!.lng : null,
        provider: GEOCODE_VERSION,
      };
      await prisma.jemaatGeocode.upsert({ where: { jemaatId: r.id }, create: { jemaatId: r.id, ...data }, update: data });
      processed++;
      geocodeState.batchDone = processed;
      if (status === 'OK') ok++;
      else notFound++;
      if (near) await sleep(GAP_MS); // jeda hanya bila benar-benar memanggil layanan
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

/** Titik jemaat masih dalam batas jarak dari cabangnya (dipakai saat menampilkan). */
export function nearCabang(
  p: { latitude: number | null; longitude: number | null },
  c: { latitude: number | null; longitude: number | null },
): boolean {
  if (p.latitude == null || p.longitude == null || c.latitude == null || c.longitude == null) return false;
  return distanceKm({ lat: c.latitude, lng: c.longitude }, { lat: p.latitude, lng: p.longitude }) <= MAX_FROM_CABANG_KM;
}
