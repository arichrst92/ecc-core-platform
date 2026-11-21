/**
 * Skrip sekali jalan (2026-11): periksa ulang titik lokasi dari link Google Maps
 * untuk Cabang, Ibadah, Event, Homecell, dan Local Market.
 *
 * Latar belakang: pembaca link lama kadang mengambil "pusat tampilan bawaan"
 * Google (sama untuk banyak link, mis. di laut utara Jakarta) sebagai titik.
 * Titik salah ini membuat pin di Map View meleset dan radius self check-in
 * ibadah/event menolak jemaat yang sebenarnya di lokasi.
 *
 * Yang dilakukan: tiap link dibaca ulang dengan pembaca baru, lalu dibandingkan
 * dengan titik tersimpan. Laporan menampilkan:
 *   - BEDA     : titik baru berjarak > 0,5 km dari titik lama → diperbarui (--apply)
 *   - TIDAK_TERBACA : link tidak menghasilkan titik → titik lama dibiarkan
 *                     (kecuali --clear-unresolved: titik lama dikosongkan supaya
 *                     tidak tampil / dipakai di tempat yang salah)
 *   - KEMBAR   : titik lama persis sama dengan entri lain yang linknya berbeda
 *                (indikasi kuat titik bawaan Google)
 *
 * Jalankan di VPS (folder apps/core-api), setelah build:
 *   node -r dotenv/config dist/scripts/recheck-map-points.js dotenv_config_path=../../.env
 *     → DRY RUN (hanya laporan)
 *   ... --apply              → simpan titik baru
 *   ... --apply --clear-unresolved → juga kosongkan titik yang linknya tidak terbaca
 *   ... --apply --clear-far        → kosongkan titik TANPA link yang > 150 km dari cabangnya
 *   ... --apply --fix-sign         → balik tanda lintang bila link kehilangan minus (titik di laut utara)
 *   ... --far-km=100               → ubah batas "jauh dari cabang"
 *   ... --only=homecell,ibadah     → batasi jenis (cabang, ibadah, event, homecell, local)
 * Termasuk entri NONAKTIF dan entri yang punya titik tanpa link.
 */
import { prisma } from '@ecc/database';
import { distanceKm, resolveMapsLocation, type LatLng } from '../lib/geo.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CLEAR = args.includes('--clear-unresolved');
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') ?? null;

type Row = {
  id: string;
  nama: string;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  /** Titik cabang terkait (untuk cek "terlalu jauh dari cabang"). */
  cabang: { nama: string; latitude: number | null; longitude: number | null } | null;
};
type Kind = { key: string; label: string; table: string; load: () => Promise<Row[]> };

// Semua entri yang punya link ATAU titik — termasuk yang NONAKTIF (Map View bisa
// menampilkan homecell nonaktif sebagai pin abu-abu).
const anyPoint = { OR: [{ mapsUrl: { not: null } }, { latitude: { not: null } }] };
const cabSel = { select: { nama: true, latitude: true, longitude: true } } as const;

const KINDS: Kind[] = [
  {
    key: 'cabang',
    label: 'Cabang',
    table: 'cabang_gereja',
    load: async () =>
      (
        await prisma.cabangGereja.findMany({
          where: anyPoint,
          select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true, isActive: true },
        })
      ).map((r) => ({ ...r, cabang: null })),
  },
  {
    key: 'ibadah',
    label: 'Ibadah',
    table: 'ibadah',
    load: async () =>
      await prisma.ibadah.findMany({
        where: anyPoint,
        select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true, isActive: true, cabang: cabSel },
      }),
  },
  {
    key: 'event',
    label: 'Event',
    table: 'event',
    load: async () =>
      (
        await prisma.event.findMany({
          where: anyPoint,
          select: { id: true, judul: true, mapsUrl: true, latitude: true, longitude: true, isActive: true, cabang: cabSel },
        })
      ).map(({ judul, ...r }) => ({ ...r, nama: judul })),
  },
  {
    key: 'homecell',
    label: 'Homecell',
    table: 'homecell',
    load: async () =>
      (
        await prisma.homecell.findMany({
          where: anyPoint,
          select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true, isActive: true, area: { select: { cabang: cabSel } } },
        })
      ).map(({ area, ...r }) => ({ ...r, cabang: area.cabang })),
  },
  {
    key: 'local',
    label: 'Local Market',
    table: 'local_business',
    load: async () =>
      (
        await prisma.localBusiness.findMany({
          where: anyPoint,
          select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true, isActive: true, owner: { select: { cabang: cabSel } } },
        })
      ).map(({ owner, ...r }) => ({ ...r, cabang: owner.cabang })),
  },
];

/** Batas "terlalu jauh dari cabang" (km) — homecell/ibadah/event biasanya di kota cabangnya. */
const FAR_KM = Number(args.find((a) => a.startsWith('--far-km='))?.split('=')[1] ?? 150);
const CLEAR_FAR = args.includes('--clear-far');
const FIX_SIGN = args.includes('--fix-sign');
function kmFromCabang(r: Row, p: { lat: number; lng: number } | null): number | null {
  if (!p || !r.cabang || r.cabang.latitude == null || r.cabang.longitude == null) return null;
  return distanceKm(p, { lat: r.cabang.latitude, lng: r.cabang.longitude });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (p: { latitude: number | null; longitude: number | null } | LatLng | null) =>
  !p ? '-' : 'lat' in p ? `${p.lat.toFixed(5)},${p.lng.toFixed(5)}` : p.latitude == null ? '-' : `${p.latitude.toFixed(5)},${p.longitude!.toFixed(5)}`;

async function save(table: string, id: string, loc: LatLng | null) {
  // Raw → kolom updatedAt tidak ikut berubah.
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "latitude" = $1, "longitude" = $2 WHERE "id" = $3::uuid`,
    loc?.lat ?? null,
    loc?.lng ?? null,
    id,
  );
}

async function main() {
  console.log(`Periksa ulang titik Google Maps — ${APPLY ? 'MENYIMPAN' : 'DRY RUN (tanpa perubahan)'}${CLEAR ? ' + kosongkan titik yang linknya tak terbaca' : ''}\n`);
  const totals = { cek: 0, beda: 0, tidak: 0, kembar: 0, jauh: 0, disimpan: 0, dikosongkan: 0 };
  // Titik kembar dihitung lintas SEMUA jenis (titik bawaan Google sama untuk semua link).
  const all: (Row & { kind: Kind })[] = [];
  for (const k of KINDS) {
    if (ONLY && !ONLY.includes(k.key)) continue;
    for (const r of await k.load()) all.push({ ...r, kind: k });
  }
  const byPoint = new Map<string, Set<string>>();
  for (const r of all) {
    if (r.latitude == null || r.longitude == null) continue;
    const key = `${r.latitude},${r.longitude}`;
    byPoint.set(key, (byPoint.get(key) ?? new Set()).add((r.mapsUrl ?? `tanpa-link:${r.id}`).trim()));
  }
  const isTwin = (r: Row) => r.latitude != null && (byPoint.get(`${r.latitude},${r.longitude}`)?.size ?? 0) > 1;

  for (const r of all) {
    totals.cek++;
    const twin = isTwin(r);
    if (twin) totals.kembar++;
    const label = `[${r.kind.label}${r.isActive ? '' : ' · nonaktif'}] ${r.nama}`;
    const oldPt = r.latitude != null && r.longitude != null ? { lat: r.latitude, lng: r.longitude } : null;
    const oldFar = kmFromCabang(r, oldPt);
    // Tanpa link: tidak bisa dibaca ulang — hanya cek jarak ke cabang.
    if (!r.mapsUrl) {
      if (oldFar != null && oldFar > FAR_KM) {
        totals.jauh++;
        console.log(`JAUH_DARI_CABANG (tanpa link)  ${label}  ${fmt(r)}  ${oldFar.toFixed(0)} km dari ${r.cabang!.nama}`);
        if (APPLY && CLEAR_FAR) {
          await save(r.kind.table, r.id, null);
          totals.dikosongkan++;
        }
      }
      continue;
    }
    let loc = await resolveMapsLocation(r.mapsUrl).catch(() => null);
    await sleep(800); // sopan ke Google / OpenStreetMap
    if (!loc) {
      totals.tidak++;
      const far = oldFar != null && oldFar > FAR_KM ? ` + JAUH ${oldFar.toFixed(0)} km dari ${r.cabang!.nama}` : '';
      if (far) totals.jauh++;
      console.log(`TIDAK_TERBACA${twin ? ' + KEMBAR' : ''}${far}  ${label}  lama=${fmt(r)}  link=${r.mapsUrl}`);
      if (APPLY && CLEAR && r.latitude != null) {
        await save(r.kind.table, r.id, null);
        totals.dikosongkan++;
      }
      continue;
    }
    const old = oldPt;
    let newFar = kmFromCabang(r, loc);
    if (newFar != null && newFar > FAR_KM) {
      // Tanda minus lintang hilang (mis. "6.89,107.58" padahal Bandung -6.89) →
      // titik jatuh di laut belahan utara. Balik tanda bila hasilnya dekat cabang.
      const flipped = { lat: -loc.lat, lng: loc.lng };
      const flipKm = kmFromCabang(r, flipped);
      if (FIX_SIGN && flipKm != null && flipKm <= FAR_KM) {
        console.log(`TANDA_LINTANG  ${label}  ${fmt(loc)} → ${fmt(flipped)} (${flipKm.toFixed(0)} km dari ${r.cabang!.nama}) — perbaiki juga link di Portal`);
        loc = flipped;
        newFar = flipKm;
      } else {
        totals.jauh++;
        const hint = flipKm != null && flipKm <= FAR_KM ? ' [kemungkinan minus lintang hilang → --fix-sign]' : '';
        console.log(`PERIKSA_LINK  ${label}  link menunjuk ${newFar.toFixed(0)} km dari ${r.cabang!.nama} — pastikan linknya benar  ${fmt(loc)}${hint}`);
      }
    }
    const km = old ? distanceKm(old, loc) : Infinity;
    if (km > 0.5) {
      totals.beda++;
      console.log(`BEDA${twin ? ' + KEMBAR' : ''}  ${label}  lama=${fmt(r)} → baru=${fmt(loc)} (${km === Infinity ? 'baru' : `${km.toFixed(1)} km`})`);
      if (APPLY) {
        await save(r.kind.table, r.id, loc);
        totals.disimpan++;
      }
    } else if (twin) {
      console.log(`KEMBAR (titik sama dengan entri lain, tapi link ini memang menunjuk ke sana)  ${label}  ${fmt(r)}`);
    }
  }
  console.log(
    `\nSelesai: diperiksa ${totals.cek}, beda ${totals.beda}, tidak terbaca ${totals.tidak}, kembar ${totals.kembar}, jauh dari cabang ${totals.jauh}` +
      (APPLY ? `, disimpan ${totals.disimpan}, dikosongkan ${totals.dikosongkan}` : ' — jalankan dengan --apply untuk menyimpan'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
