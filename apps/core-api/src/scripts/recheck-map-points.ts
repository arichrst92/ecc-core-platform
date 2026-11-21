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
 *                     (kecuali --clear-unresolved: dikosongkan)
 *   - KEMBAR   : titik lama persis sama dengan entri lain yang linknya berbeda
 *                (indikasi kuat titik bawaan Google)
 *
 * Jalankan di VPS (folder apps/core-api), setelah build:
 *   node -r dotenv/config dist/scripts/recheck-map-points.js dotenv_config_path=../../.env
 *     → DRY RUN (hanya laporan)
 *   ... --apply              → simpan titik baru
 *   ... --apply --clear-unresolved → juga kosongkan titik KEMBAR yang tidak terbaca
 *   ... --only=homecell,ibadah     → batasi jenis (cabang, ibadah, event, homecell, local)
 */
import { prisma } from '@ecc/database';
import { distanceKm, resolveMapsLocation, type LatLng } from '../lib/geo.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CLEAR = args.includes('--clear-unresolved');
const ONLY = args.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') ?? null;

type Row = { id: string; nama: string; mapsUrl: string; latitude: number | null; longitude: number | null };
type Kind = { key: string; label: string; table: string; load: () => Promise<Row[]> };

const KINDS: Kind[] = [
  {
    key: 'cabang',
    label: 'Cabang',
    table: 'cabang_gereja',
    load: async () =>
      (await prisma.cabangGereja.findMany({ where: { mapsUrl: { not: null } }, select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true } })) as Row[],
  },
  {
    key: 'ibadah',
    label: 'Ibadah',
    table: 'ibadah',
    load: async () =>
      (await prisma.ibadah.findMany({ where: { mapsUrl: { not: null }, isActive: true }, select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true } })) as Row[],
  },
  {
    key: 'event',
    label: 'Event',
    table: 'event',
    load: async () =>
      (
        await prisma.event.findMany({
          where: { mapsUrl: { not: null }, isActive: true },
          select: { id: true, judul: true, mapsUrl: true, latitude: true, longitude: true },
        })
      ).map(({ judul, ...r }) => ({ ...r, nama: judul })) as Row[],
  },
  {
    key: 'homecell',
    label: 'Homecell',
    table: 'homecell',
    load: async () =>
      (await prisma.homecell.findMany({ where: { mapsUrl: { not: null }, isActive: true }, select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true } })) as Row[],
  },
  {
    key: 'local',
    label: 'Local Market',
    table: 'local_business',
    load: async () =>
      (await prisma.localBusiness.findMany({ where: { mapsUrl: { not: null }, isActive: true }, select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true } })) as Row[],
  },
];

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
  console.log(`Periksa ulang titik Google Maps — ${APPLY ? 'MENYIMPAN' : 'DRY RUN (tanpa perubahan)'}${CLEAR ? ' + kosongkan titik kembar tak terbaca' : ''}\n`);
  const totals = { cek: 0, beda: 0, tidak: 0, kembar: 0, disimpan: 0, dikosongkan: 0 };
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
    byPoint.set(key, (byPoint.get(key) ?? new Set()).add(r.mapsUrl.trim()));
  }
  const isTwin = (r: Row) => r.latitude != null && (byPoint.get(`${r.latitude},${r.longitude}`)?.size ?? 0) > 1;

  for (const r of all) {
    totals.cek++;
    const twin = isTwin(r);
    if (twin) totals.kembar++;
    const loc = await resolveMapsLocation(r.mapsUrl).catch(() => null);
    await sleep(800); // sopan ke Google / OpenStreetMap
    const label = `[${r.kind.label}] ${r.nama}`;
    if (!loc) {
      totals.tidak++;
      console.log(`TIDAK_TERBACA${twin ? ' + KEMBAR' : ''}  ${label}  lama=${fmt(r)}  link=${r.mapsUrl}`);
      if (APPLY && CLEAR && twin) {
        await save(r.kind.table, r.id, null);
        totals.dikosongkan++;
      }
      continue;
    }
    const old = r.latitude != null && r.longitude != null ? { lat: r.latitude, lng: r.longitude } : null;
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
    `\nSelesai: diperiksa ${totals.cek}, beda ${totals.beda}, tidak terbaca ${totals.tidak}, kembar ${totals.kembar}` +
      (APPLY ? `, disimpan ${totals.disimpan}, dikosongkan ${totals.dikosongkan}` : ' — jalankan dengan --apply untuk menyimpan'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
