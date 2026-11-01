'use client';

/**
 * Map View — peta pin cabang gereja & homecell.
 * Pin bisa diklik → balon informasi di atas pin. Pin dibedakan per fungsi:
 * cabang = pin oranye ikon gereja, homecell = pin ungu ikon rumah, nonaktif = abu.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, MapPinned, Search, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  PIN_STYLE,
  cabangPopup,
  homecellPopup,
  loadLeaflet,
  makeIcon,
  pinHtml,
  type Leaflet,
  type MapViewData,
} from '@/lib/map-view';

/* eslint-disable @typescript-eslint/no-explicit-any */

const INDONESIA_CENTER: [number, number] = [-2.5, 118];

export default function MapViewPage() {
  const [showCabang, setShowCabang] = useState(true);
  const [showHomecell, setShowHomecell] = useState(true);
  const [cabangId, setCabangId] = useState('');
  const [kategori, setKategori] = useState<'' | 'SINGLE' | 'COUPLE' | 'UMUM'>('');
  const [search, setSearch] = useState('');
  const [mapError, setMapError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [tick, setTick] = useState(0);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<Leaflet>(null);
  const layerRef = useRef<{ cabang: any; homecell: any } | null>(null);
  const markerIndex = useRef<Map<string, any>>(new Map());
  const fittedKey = useRef<string>('');

  const q = useQuery({
    queryKey: ['map-view'],
    queryFn: async () => (await apiClient.get<{ data: MapViewData }>('/admin/map-view')).data.data,
    staleTime: 60_000,
  });

  const cabangOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of q.data?.cabang ?? []) m.set(c.id, c.nama);
    for (const h of q.data?.homecell ?? []) m.set(h.area.cabang.id, h.area.cabang.nama);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id'));
  }, [q.data]);

  const needle = search.trim().toLowerCase();
  const cabangList = useMemo(
    () =>
      (q.data?.cabang ?? []).filter(
        (c) =>
          (!cabangId || c.id === cabangId) &&
          (!needle || `${c.nama} ${c.kode} ${c.alamat ?? ''}`.toLowerCase().includes(needle)),
      ),
    [q.data, cabangId, needle],
  );
  const homecellList = useMemo(
    () =>
      (q.data?.homecell ?? []).filter(
        (h) =>
          (!cabangId || h.area.cabang.id === cabangId) &&
          (!kategori || (kategori === 'UMUM' ? !h.kategori : h.kategori === kategori)) &&
          (!needle ||
            `${h.nama} ${h.area.nama} ${h.picJemaat?.namaLengkap ?? ''} ${h.alamat ?? ''}`.toLowerCase().includes(needle)),
      ),
    [q.data, cabangId, kategori, needle],
  );

  // 1) Siapkan peta sekali.
  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        LRef.current = L;
        const map = L.map(mapEl.current, { zoomControl: true, worldCopyJump: true }).setView(INDONESIA_CENTER, 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        const clusterOpts = (color: string) => ({
          showCoverageOnHover: false,
          maxClusterRadius: 45,
          iconCreateFunction: (cl: any) => {
            const n = cl.getChildCount();
            const size = n < 10 ? 34 : n < 100 ? 40 : 46;
            return L.divIcon({
              html: `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid rgba(255,255,255,.9);box-shadow:0 2px 6px rgba(0,0,0,.3)">${n}</div>`,
              className: 'ecc-cluster',
              iconSize: [size, size],
            });
          },
        });
        layerRef.current = {
          cabang: L.markerClusterGroup(clusterOpts(PIN_STYLE.cabang.color)).addTo(map),
          homecell: L.markerClusterGroup(clusterOpts(PIN_STYLE.homecell.color)).addTo(map),
        };
        mapRef.current = map;
        // Ukuran kontainer bisa berubah setelah layout selesai.
        setTimeout(() => map.invalidateSize(), 50);
        setMapError(null);
        setTick((x) => x + 1);
      })
      .catch(() => !cancelled && setMapError('Peta gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  // 2) Gambar ulang pin saat data / saringan berubah.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!L || !map || !layers) return;
    layers.cabang.clearLayers();
    layers.homecell.clearLayers();
    markerIndex.current.clear();
    const bounds: [number, number][] = [];

    if (showCabang) {
      for (const c of cabangList) {
        const m = L.marker([c.latitude, c.longitude], {
          icon: makeIcon(L, 'cabang', c.isActive),
          title: c.nama,
          zIndexOffset: 1000,
        }).bindPopup(cabangPopup(c), { maxWidth: 300, className: 'ecc-popup' });
        layers.cabang.addLayer(m);
        markerIndex.current.set(`c:${c.id}`, m);
        bounds.push([c.latitude, c.longitude]);
      }
    }
    if (showHomecell) {
      for (const h of homecellList) {
        const m = L.marker([h.latitude, h.longitude], {
          icon: makeIcon(L, 'homecell', h.isActive),
          title: h.nama,
        }).bindPopup(homecellPopup(h), { maxWidth: 300, className: 'ecc-popup' });
        layers.homecell.addLayer(m);
        markerIndex.current.set(`h:${h.id}`, m);
        bounds.push([h.latitude, h.longitude]);
      }
    }

    // Arahkan peta ke semua pin bila saringan berubah (bukan saat data dimuat ulang saja).
    const key = `${cabangId}|${kategori}|${needle}|${showCabang}|${showHomecell}|${q.dataUpdatedAt > 0}`;
    if (bounds.length && fittedKey.current !== key) {
      fittedKey.current = key;
      if (bounds.length === 1) map.setView(bounds[0], 15);
      else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [tick, cabangList, homecellList, showCabang, showHomecell, cabangId, kategori, needle, q.dataUpdatedAt]);

  function focus(key: string) {
    const m = markerIndex.current.get(key);
    const layers = layerRef.current;
    if (!m || !layers) return;
    const group = key.startsWith('c:') ? layers.cabang : layers.homecell;
    group.zoomToShowLayer(m, () => m.openPopup());
  }

  const missingCabang = (q.data?.tanpaTitik.cabang ?? []).filter((c) => !cabangId || c.id === cabangId);
  const missingHomecell = (q.data?.tanpaTitik.homecell ?? []).filter(
    (h) => !cabangId || h.cabang === cabangOptions.find(([id]) => id === cabangId)?.[1],
  );
  const results = needle
    ? [
        ...(showCabang ? cabangList.map((c) => ({ key: `c:${c.id}`, nama: c.nama, sub: 'Cabang gereja' })) : []),
        ...(showHomecell
          ? homecellList.map((h) => ({ key: `h:${h.id}`, nama: h.nama, sub: `Homecell · ${h.area.cabang.nama}` }))
          : []),
      ].slice(0, 8)
    : [];

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        .ecc-pin-wrap{background:transparent;border:0}
        .ecc-pin{position:relative;transition:transform .15s ease}
        .ecc-pin-wrap:hover .ecc-pin{transform:translateY(-3px) scale(1.06)}
        .ecc-cluster{background:transparent;border:0}
        .ecc-popup .leaflet-popup-content-wrapper{border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.18)}
        .ecc-popup .leaflet-popup-content{margin:12px 14px}
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <MapPinned className="w-6 h-6" />
            Map View
          </h1>
          <p className="text-neutral-500 mt-1">Lokasi cabang gereja dan homecell. Klik pin untuk melihat informasinya.</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Legend kind="cabang" />
          <Legend kind="homecell" />
          <Legend kind="nonaktif" />
        </div>
      </div>

      {/* Saringan */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <Toggle
          checked={showCabang}
          onChange={setShowCabang}
          color={PIN_STYLE.cabang.color}
          label={`Cabang (${cabangList.length})`}
        />
        <Toggle
          checked={showHomecell}
          onChange={setShowHomecell}
          color={PIN_STYLE.homecell.color}
          label={`Homecell (${homecellList.length})`}
        />
        <select
          value={cabangId}
          onChange={(e) => setCabangId(e.target.value)}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Semua cabang</option>
          {cabangOptions.map(([id, nama]) => (
            <option key={id} value={id}>
              {nama}
            </option>
          ))}
        </select>
        <select
          value={kategori}
          onChange={(e) => setKategori(e.target.value as typeof kategori)}
          disabled={!showHomecell}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
        >
          <option value="">Semua kategori homecell</option>
          <option value="SINGLE">Single</option>
          <option value="COUPLE">Couple</option>
          <option value="UMUM">Umum</option>
        </select>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama cabang / homecell / pemimpin…"
            className="w-full pl-9 pr-8 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
          {search ? (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
          {results.length > 0 && (
            <div className="absolute z-[1000] mt-1 w-full bg-white border border-neutral-200 rounded-lg shadow-lg overflow-hidden">
              {results.map((r) => (
                <button
                  key={r.key}
                  onClick={() => focus(r.key)}
                  className="w-full text-left px-3 py-2 hover:bg-neutral-50 border-b border-neutral-100 last:border-0"
                >
                  <div className="text-sm font-medium text-neutral-900">{r.nama}</div>
                  <div className="text-xs text-neutral-500">{r.sub}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Peta */}
      <div className="relative bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div ref={mapEl} className="w-full h-[calc(100vh-320px)] min-h-[460px] z-0" />
        {(q.isLoading || (!mapRef.current && !mapError)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        )}
        {(mapError || q.isError) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6 text-center text-sm text-red-600">
            {mapError ?? 'Data peta gagal dimuat. Coba muat ulang halaman.'}
          </div>
        )}
      </div>

      {/* Yang belum punya titik */}
      {(missingCabang.length > 0 || missingHomecell.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
          <button onClick={() => setShowMissing((x) => !x)} className="flex items-center gap-2 text-amber-800 font-medium">
            <AlertTriangle className="w-4 h-4" />
            Belum tampil di peta karena belum punya link Google Maps: {missingCabang.length} cabang, {missingHomecell.length} homecell
            <span className="text-xs underline">{showMissing ? 'sembunyikan' : 'lihat daftar'}</span>
          </button>
          {showMissing && (
            <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-amber-900">
              {missingCabang.map((c) => (
                <a key={c.id} href={`/dashboard/cabang`} className="hover:underline">
                  Cabang · {c.nama}
                </a>
              ))}
              {missingHomecell.map((h) => (
                <a key={h.id} href={`/dashboard/homecell/${h.id}`} className="hover:underline">
                  Homecell · {h.nama} <span className="text-amber-700">({h.cabang})</span>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Legend({ kind }: { kind: 'cabang' | 'homecell' | 'nonaktif' }) {
  const html = kind === 'nonaktif' ? pinHtml('homecell', false) : pinHtml(kind);
  return (
    <span className="inline-flex items-center gap-1.5 text-neutral-700">
      <span className="inline-block scale-[0.6] origin-left -mr-3" style={{ height: 30 }} dangerouslySetInnerHTML={{ __html: html }} />
      {PIN_STYLE[kind].label}
    </span>
  );
}

function Toggle({ checked, onChange, color, label }: { checked: boolean; onChange: (v: boolean) => void; color: string; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-neutral-50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" style={{ accentColor: color }} />
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {label}
    </label>
  );
}
