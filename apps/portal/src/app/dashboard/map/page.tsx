'use client';

/**
 * Map View — peta cabang gereja, homecell area & homecell.
 * Pin/poligon bisa diklik → balon informasi. Pin dibedakan per fungsi:
 * cabang = pin oranye ikon gereja, homecell = pin ungu ikon rumah, nonaktif = abu.
 * Homecell area = poligon yang menghubungkan titik homecell di area tsb.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, MapPinned, Search, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  PIN_STYLE,
  areaPopup,
  cabangPopup,
  homecellPopup,
  loadHeat,
  loadLeaflet,
  makeAreaLayer,
  makeIcon,
  pinHtml,
  type Leaflet,
  type MapViewData,
  type SebaranJemaat,
} from '@/lib/map-view';

/* eslint-disable @typescript-eslint/no-explicit-any */

const INDONESIA_CENTER: [number, number] = [-2.5, 118];

export default function MapViewPage() {
  const [showCabang, setShowCabang] = useState(true);
  const [showHomecell, setShowHomecell] = useState(true);
  const [showArea, setShowArea] = useState(true);
  // Sebaran jemaat (perkiraan dari alamat, tanpa nama) — default mati.
  const [showSebaran, setShowSebaran] = useState(false);
  const heatRef = useRef<any>(null);
  const [cabangId, setCabangId] = useState('');
  const [kategori, setKategori] = useState<'' | 'SINGLE' | 'COUPLE' | 'UMUM'>('');
  const [search, setSearch] = useState('');
  const [mapError, setMapError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [tick, setTick] = useState(0);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const LRef = useRef<Leaflet>(null);
  const layerRef = useRef<{ cabang: any; homecell: any; area: any } | null>(null);
  const markerIndex = useRef<Map<string, any>>(new Map());
  const fittedKey = useRef<string>('');

  const q = useQuery({
    queryKey: ['map-view'],
    queryFn: async () => (await apiClient.get<{ data: MapViewData }>('/admin/map-view')).data.data,
    staleTime: 60_000,
  });

  const sebaran = useQuery({
    queryKey: ['map-view', 'sebaran-jemaat', cabangId],
    queryFn: async () =>
      (
        await apiClient.get<{ data: SebaranJemaat }>('/admin/map-view/sebaran-jemaat', {
          params: cabangId ? { cabangId } : {},
        })
      ).data.data,
    enabled: showSebaran,
    staleTime: 5 * 60_000,
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

  // Area + titik homecell-nya (semua homecell area tsb, tidak terpengaruh saringan kategori).
  const areaList = useMemo(() => {
    const pts = new Map<string, { points: [number, number][]; names: string[] }>();
    for (const h of q.data?.homecell ?? []) {
      const e = pts.get(h.area.id) ?? { points: [], names: [] };
      e.points.push([h.latitude, h.longitude]);
      e.names.push(h.nama);
      pts.set(h.area.id, e);
    }
    return (q.data?.area ?? [])
      .filter(
        (a) =>
          (!cabangId || a.cabang.id === cabangId) &&
          (!needle || `${a.nama} ${a.cabang.nama} ${a.picJemaat?.namaLengkap ?? ''}`.toLowerCase().includes(needle)),
      )
      .map((a) => ({ area: a, ...(pts.get(a.id) ?? { points: [], names: [] }) }))
      .filter((x) => x.points.length > 0);
  }, [q.data, cabangId, needle]);
  const areaTanpaTitik = useMemo(
    () => (q.data?.area ?? []).filter((a) => (!cabangId || a.cabang.id === cabangId) && a.denganTitik === 0),
    [q.data, cabangId],
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
          // Poligon area di bawah pin (ditambahkan lebih dulu).
          area: L.featureGroup().addTo(map),
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
    layers.area.clearLayers();
    markerIndex.current.clear();
    const bounds: [number, number][] = [];

    if (showArea) {
      for (const { area, points, names } of areaList) {
        const shape = makeAreaLayer(L, area, points)
          .bindPopup(areaPopup(area, names), { maxWidth: 300, className: 'ecc-popup' })
          .bindTooltip(area.nama, { sticky: true, direction: 'top', className: 'ecc-area-tip' });
        shape.on('mouseover', () => shape.setStyle?.({ fillOpacity: 0.28 }));
        shape.on('mouseout', () => shape.setStyle?.({ fillOpacity: 0.14 }));
        layers.area.addLayer(shape);
        markerIndex.current.set(`a:${area.id}`, shape);
        for (const p of points) bounds.push(p);
      }
    }

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
    const key = `${cabangId}|${kategori}|${needle}|${showCabang}|${showArea}|${showHomecell}|${q.dataUpdatedAt > 0}`;
    if (bounds.length && fittedKey.current !== key) {
      fittedKey.current = key;
      if (bounds.length === 1) map.setView(bounds[0], 15);
      else map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [tick, cabangList, homecellList, areaList, showCabang, showArea, showHomecell, cabangId, kategori, needle, q.dataUpdatedAt]);

  // Lapisan peta kepadatan (sebaran jemaat).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }
    if (!showSebaran || !sebaran.data) return;
    let cancelled = false;
    loadHeat()
      .then((L) => {
        if (cancelled || !mapRef.current) return;
        const max = Math.max(3, ...sebaran.data!.cells.map((c) => c[2]));
        heatRef.current = L.heatLayer(sebaran.data!.cells, {
          radius: 22,
          blur: 18,
          maxZoom: 14,
          max,
          minOpacity: 0.35,
          gradient: { 0.2: '#3B82F6', 0.45: '#22C55E', 0.7: '#EAB308', 1: '#DC2626' },
        }).addTo(mapRef.current);
      })
      .catch(() => setMapError('Lapisan sebaran jemaat gagal dimuat. Periksa koneksi internet.'));
    return () => {
      cancelled = true;
    };
  }, [tick, showSebaran, sebaran.data]);

  function focus(key: string) {
    const m = markerIndex.current.get(key);
    const layers = layerRef.current;
    if (!m || !layers) return;
    if (key.startsWith('a:')) {
      const b = m.getBounds?.();
      if (b) mapRef.current?.fitBounds(b, { padding: [40, 40], maxZoom: 16 });
      m.openPopup(b ? b.getCenter() : undefined);
      return;
    }
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
        ...(showArea ? areaList.map(({ area }) => ({ key: `a:${area.id}`, nama: area.nama, sub: `Homecell area · ${area.cabang.nama}` })) : []),
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
        .ecc-area-tip{font-weight:600;font-size:12px;border-radius:8px;padding:2px 8px}
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <MapPinned className="w-6 h-6" />
            Map View
          </h1>
          <p className="text-neutral-500 mt-1">
            Lokasi cabang gereja, wilayah homecell area, dan homecell. Klik pin atau area untuk melihat informasinya.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Legend kind="cabang" />
          <AreaLegend />
          <Legend kind="homecell" />
          <Legend kind="nonaktif" />
        </div>
      </div>

      {/* Saringan */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1 pr-2 mr-1 border-r border-neutral-200">
          <span className="text-xs font-medium text-neutral-500 mr-1">Tampilkan:</span>
          <Toggle
            checked={showCabang}
            onChange={setShowCabang}
            color={PIN_STYLE.cabang.color}
            label={`Cabang Gereja (${cabangList.length})`}
          />
          <Toggle
            checked={showArea}
            onChange={setShowArea}
            color={PIN_STYLE.area.color}
            label={`Homecell Area (${areaList.length})`}
            square
          />
          <Toggle
            checked={showHomecell}
            onChange={setShowHomecell}
            color={PIN_STYLE.homecell.color}
            label={`Homecell (${homecellList.length})`}
          />
          <Toggle
            checked={showSebaran}
            onChange={setShowSebaran}
            color="#DC2626"
            label="Sebaran Jemaat"
            square
          />
        </div>
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
            placeholder="Cari cabang / area / homecell / pemimpin…"
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

      {showSebaran && (
        <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 bg-white border border-neutral-200 rounded-xl px-3 py-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-neutral-800">
            <span className="w-16 h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#3B82F6,#22C55E,#EAB308,#DC2626)' }} />
            Sebaran jemaat (sedikit → padat)
          </span>
          {sebaran.isLoading ? (
            <span>Memuat…</span>
          ) : sebaran.data ? (
            <>
              <span>
                {sebaran.data.status.ok.toLocaleString('id-ID')} dari {sebaran.data.status.total.toLocaleString('id-ID')} alamat
                berhasil dipetakan
              </span>
              {sebaran.data.status.menunggu > 0 && (
                <span className="text-amber-700">{sebaran.data.status.menunggu.toLocaleString('id-ID')} menunggu diproses (bertahap otomatis)</span>
              )}
              {sebaran.data.status.tidakDitemukan + sebaran.data.status.terlaluJauh > 0 && (
                <span>
                  {(sebaran.data.status.tidakDitemukan + sebaran.data.status.terlaluJauh).toLocaleString('id-ID')} alamat tidak dikenali
                </span>
              )}
            </>
          ) : null}
          <span className="text-neutral-400">Perkiraan dari alamat, digabung per ±100 m, tanpa nama.</span>
        </div>
      )}

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
      {(missingCabang.length > 0 || missingHomecell.length > 0 || areaTanpaTitik.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm">
          <button onClick={() => setShowMissing((x) => !x)} className="flex items-center gap-2 text-amber-800 font-medium">
            <AlertTriangle className="w-4 h-4" />
            Belum tampil di peta karena belum punya link Google Maps: {missingCabang.length} cabang, {areaTanpaTitik.length} area,{' '}
            {missingHomecell.length} homecell
            <span className="text-xs underline">{showMissing ? 'sembunyikan' : 'lihat daftar'}</span>
          </button>
          {showMissing && (
            <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-amber-900">
              {missingCabang.map((c) => (
                <a key={c.id} href={`/dashboard/cabang`} className="hover:underline">
                  Cabang · {c.nama}
                </a>
              ))}
              {areaTanpaTitik.map((a) => (
                <a key={a.id} href={`/dashboard/homecell-area/${a.id}`} className="hover:underline">
                  Area · {a.nama} <span className="text-amber-700">(belum ada homecell bertitik)</span>
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

function AreaLegend() {
  const c = PIN_STYLE.area.color;
  return (
    <span className="inline-flex items-center gap-1.5 text-neutral-700">
      <svg width="22" height="18" viewBox="0 0 22 18">
        <polygon points="2,14 7,2 19,4 20,15" fill={c} fillOpacity="0.18" stroke={c} strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {PIN_STYLE.area.label}
    </span>
  );
}

function Toggle({
  checked,
  onChange,
  color,
  label,
  square,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  color: string;
  label: string;
  square?: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none px-2 py-1 rounded-lg hover:bg-neutral-50">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" style={{ accentColor: color }} />
      <span
        className={`w-2.5 h-2.5 ${square ? 'rounded-[3px]' : 'rounded-full'}`}
        style={square ? { background: `${color}33`, border: `2px solid ${color}` } : { background: color }}
      />
      {label}
    </label>
  );
}
