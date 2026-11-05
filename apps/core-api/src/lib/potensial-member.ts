/**
 * Potensial member homecell — jemaat aktif (bukan tamu) yang BELUM ikut
 * homecell mana pun (bukan anggota aktif & bukan PIC homecell aktif) dan
 * perkiraan rumahnya (hasil pemetaan alamat) berada dalam radius X km dari
 * titik homecell.
 *
 * Dipakai oleh:
 *   - Portal Map View  → GET /admin/map-view/homecell/:id/potensial-member
 *   - App mobile (PIC) → GET /admin/me/homecell/:id/potensial-member
 */
import { prisma } from '@ecc/database';
import { alamatHash } from './jemaat-geocode.js';
import { distanceKm } from './geo.js';
import { NotFound, BadRequest } from './errors.js';

export const POTENSIAL_RADIUS_MIN_KM = 0.5;
export const POTENSIAL_RADIUS_MAX_KM = 50;
export const POTENSIAL_LIMIT = 300;

export interface PotensialMember {
  id: string;
  namaLengkap: string;
  kode: string | null;
  fotoUrl: string | null;
  jenisKelamin: string | null;
  noHp: string | null;
  alamat: string | null;
  tanggalLahir: Date | null;
  cabang: { id: string; nama: string };
  latitude: number;
  longitude: number;
  jarakKm: number;
}

export async function cariPotensialMember(homecellId: string, radiusKmIn: number) {
  const radiusKm = Math.min(POTENSIAL_RADIUS_MAX_KM, Math.max(POTENSIAL_RADIUS_MIN_KM, radiusKmIn));
  const hc = await prisma.homecell.findUnique({
    where: { id: homecellId },
    select: { id: true, nama: true, latitude: true, longitude: true, area: { select: { cabangId: true } } },
  });
  if (!hc) throw NotFound('Homecell tidak ditemukan.');
  if (hc.latitude == null || hc.longitude == null) {
    throw BadRequest('Homecell ini belum punya titik lokasi (link Google Maps). Lengkapi dulu lokasinya.');
  }
  const pusat = { lat: hc.latitude, lng: hc.longitude };
  // Kotak pembatas kasar (prefilter di DB), jarak tepat dihitung sesudahnya.
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.max(0.01, Math.cos((pusat.lat * Math.PI) / 180)));

  const rows = await prisma.jemaatGeocode.findMany({
    where: {
      status: 'OK',
      latitude: { gte: pusat.lat - dLat, lte: pusat.lat + dLat },
      longitude: { gte: pusat.lng - dLng, lte: pusat.lng + dLng },
      jemaat: {
        isActive: true,
        isTamu: false,
        homecellMembership: { none: { isActive: true, homecell: { isActive: true } } },
        homecellPic: { none: { isActive: true } },
      },
    },
    select: {
      latitude: true,
      longitude: true,
      alamatHash: true,
      jemaat: {
        select: {
          id: true,
          namaLengkap: true,
          kode: true,
          fotoUrl: true,
          jenisKelamin: true,
          noHp: true,
          alamat: true,
          tanggalLahir: true,
          cabang: { select: { id: true, nama: true } },
        },
      },
    },
    take: 5000,
  });

  const hasil: PotensialMember[] = [];
  for (const r of rows) {
    const a = r.jemaat.alamat;
    // Alamat sudah berubah → titik lama tidak dipakai.
    if (!a || !a.trim() || alamatHash(a) !== r.alamatHash) continue;
    const jarak = distanceKm(pusat, { lat: r.latitude!, lng: r.longitude! });
    if (jarak > radiusKm) continue;
    hasil.push({ ...r.jemaat, latitude: r.latitude!, longitude: r.longitude!, jarakKm: Math.round(jarak * 100) / 100 });
  }
  hasil.sort((x, y) => x.jarakKm - y.jarakKm || x.namaLengkap.localeCompare(y.namaLengkap, 'id'));
  return {
    homecell: { id: hc.id, nama: hc.nama, latitude: hc.latitude, longitude: hc.longitude, cabangId: hc.area.cabangId },
    radiusKm,
    total: hasil.length,
    data: hasil.slice(0, POTENSIAL_LIMIT),
  };
}

/** Usia (tahun) dari tanggal lahir; null bila tidak diketahui. */
export function usiaDari(lahir: Date | null): number | null {
  if (!lahir) return null;
  const now = new Date();
  let u = now.getUTCFullYear() - lahir.getUTCFullYear();
  const m = now.getUTCMonth() - lahir.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < lahir.getUTCDate())) u--;
  return u >= 0 && u < 130 ? u : null;
}
