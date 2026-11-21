/**
 * Pemeriksaan titik lokasi homecell (2026-11).
 *
 * Dipakai untuk:
 *   - menandai homecell yang titiknya bermasalah di Portal (daftar & detail),
 *     supaya admin bisa memperbaikinya;
 *   - menjaga saat link disimpan (Portal & app PIC): titik bawaan Google ditolak,
 *     dan tanda minus lintang yang hilang dibetulkan otomatis.
 *
 * Masalah yang dikenali (urut prioritas):
 *   LINK_TIDAK_TERBACA  link ada, tapi titik kosong (link tidak bisa dibaca)
 *   TITIK_BAWAAN        titik = pusat tampilan bawaan Google (Laut Jawa utara Tangerang)
 *   LINTANG_TERBALIK    titik jauh dari cabang, tapi dekat bila tanda lintang dibalik
 *                       (mis. "6.89, 107.58" padahal Bandung -6.89) → pin di laut
 *   JAUH_DARI_CABANG    titik > 150 km dari cabang homecell
 *   BELUM_ADA_LOKASI    belum ada link & titik (tidak tampil di peta & "terdekat")
 */
import { prisma } from '@ecc/database';
import { BadRequest } from './errors.js';
import { distanceKm, resolveMapsLocation, type LatLng } from './geo.js';

export const FAR_FROM_CABANG_KM = 150;
/** Pusat tampilan bawaan Google yang dulu terbaca sebagai titik (di laut). */
const GOOGLE_DEFAULT_POINT: LatLng = { lat: -5.77758, lng: 106.67798 };

export type LokasiIssueCode =
  | 'LINK_TIDAK_TERBACA'
  | 'TITIK_BAWAAN'
  | 'LINTANG_TERBALIK'
  | 'JAUH_DARI_CABANG'
  | 'BELUM_ADA_LOKASI';

export interface LokasiIssue {
  code: LokasiIssueCode;
  /** true = titik salah tampil di peta (perlu segera); false = belum lengkap. */
  serius: boolean;
  label: string;
  /** Penjelasan + cara memperbaiki (untuk admin). */
  saran: string;
  /** Jarak titik sekarang ke cabang (km), bila diketahui. */
  jarakKm?: number;
}

type Pt = { latitude: number | null; longitude: number | null };

const toLatLng = (p: Pt | null | undefined): LatLng | null =>
  p && p.latitude != null && p.longitude != null ? { lat: p.latitude, lng: p.longitude } : null;

export function lokasiIssue(h: Pt & { mapsUrl: string | null }, cabang: Pt | null | undefined): LokasiIssue | null {
  const pt = toLatLng(h);
  const cab = toLatLng(cabang ?? null);
  const nama = 'cabangnya';
  if (!pt) {
    return h.mapsUrl
      ? {
          code: 'LINK_TIDAK_TERBACA',
          serius: false,
          label: 'Link tidak terbaca',
          saran:
            'Link Google Maps tersimpan, tetapi titiknya tidak bisa dibaca sehingga homecell tidak tampil di peta & "Homecell terdekat". Ganti dengan link Bagikan dari titik lokasi, atau tempel koordinat (mis. -6.2088, 106.8456).',
        }
      : {
          code: 'BELUM_ADA_LOKASI',
          serius: false,
          label: 'Belum ada lokasi',
          saran: 'Belum ada link Google Maps. Homecell tidak tampil di peta & "Homecell terdekat" di app.',
        };
  }
  if (distanceKm(pt, GOOGLE_DEFAULT_POINT) < 1) {
    return {
      code: 'TITIK_BAWAAN',
      serius: true,
      label: 'Titik di laut (bawaan Google)',
      saran:
        'Titik ini adalah pusat tampilan bawaan Google, bukan lokasi homecell (pin muncul di Laut Jawa). Simpan ulang dengan link Bagikan dari titik lokasi yang benar, atau tempel koordinatnya.',
    };
  }
  if (cab) {
    const km = distanceKm(pt, cab);
    if (km > FAR_FROM_CABANG_KM) {
      const flipKm = distanceKm({ lat: -pt.lat, lng: pt.lng }, cab);
      if (flipKm <= FAR_FROM_CABANG_KM) {
        return {
          code: 'LINTANG_TERBALIK',
          serius: true,
          jarakKm: Math.round(km),
          label: 'Tanda minus hilang',
          saran: `Koordinat di link tidak memakai tanda minus (lintang selatan), jadi pin jatuh di belahan utara (laut). Contoh benar: -6.89, 107.58. Simpan ulang link/koordinat — sistem kini membetulkannya otomatis.`,
        };
      }
      return {
        code: 'JAUH_DARI_CABANG',
        serius: true,
        jarakKm: Math.round(km),
        label: `Jauh dari cabang (${Math.round(km)} km)`,
        saran: `Titik berjarak ${Math.round(km)} km dari ${nama}. Pastikan link menunjuk ke lokasi pertemuan yang benar, atau homecell ini masuk zona/cabang yang salah.`,
      };
    }
  }
  return null;
}

/** Ringkasan untuk filter & banner: id homecell bermasalah sesuai filter daftar. */
export async function homecellLokasiIssues(where: import('@ecc/database').Prisma.HomecellWhereInput) {
  const rows = await prisma.homecell.findMany({
    where,
    select: {
      id: true,
      mapsUrl: true,
      latitude: true,
      longitude: true,
      area: { select: { cabang: { select: { latitude: true, longitude: true } } } },
    },
  });
  const byId = new Map<string, LokasiIssue>();
  for (const r of rows) {
    const issue = lokasiIssue(r, r.area.cabang);
    if (issue) byId.set(r.id, issue);
  }
  return byId;
}

/**
 * Baca link saat disimpan (Portal & app). Menolak titik bawaan Google dan
 * membetulkan tanda minus lintang yang hilang (berdasarkan cabang homecell).
 */
export async function resolveHomecellLokasi(
  mapsUrl: string,
  ctx: { areaId?: string | null; homecellId?: string | null },
  errorMessage: string,
): Promise<LatLng> {
  const loc = await resolveMapsLocation(mapsUrl);
  if (!loc) throw BadRequest(errorMessage);
  if (distanceKm(loc, GOOGLE_DEFAULT_POINT) < 1) {
    throw BadRequest(
      'Link ini tidak menunjuk ke titik lokasi (terbaca pusat peta bawaan Google). Buka Google Maps → tekan lama titik lokasi → Bagikan, atau tempel koordinatnya (mis. -6.2088, 106.8456).',
    );
  }
  const area = ctx.areaId
    ? await prisma.homecellArea.findUnique({ where: { id: ctx.areaId }, select: { cabang: { select: { latitude: true, longitude: true } } } })
    : ctx.homecellId
      ? (await prisma.homecell.findUnique({ where: { id: ctx.homecellId }, select: { area: { select: { cabang: { select: { latitude: true, longitude: true } } } } } }))?.area
      : null;
  const cab = toLatLng(area?.cabang ?? null);
  if (cab && distanceKm(loc, cab) > FAR_FROM_CABANG_KM) {
    const flipped = { lat: -loc.lat, lng: loc.lng };
    if (distanceKm(flipped, cab) <= FAR_FROM_CABANG_KM) return flipped;
  }
  return loc;
}
