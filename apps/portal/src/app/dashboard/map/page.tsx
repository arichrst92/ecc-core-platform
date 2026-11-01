'use client';

/**
 * Map View — peta cabang gereja, homecell area & homecell.
 * Pin/poligon bisa diklik → balon informasi. Pin dibedakan per fungsi:
 * cabang = pin oranye ikon gereja, homecell = pin ungu ikon rumah, nonaktif = abu.
 * Homecell area = poligon yang menghubungkan titik homecell di area tsb.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, MapPinned, Maximize2, Minimize2, Play, Search, Users, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  PIN_STYLE,
  areaPopup,
  cabangPopup,
  homecellPopup,
  jemaatPinElement,
  jemaatPopup,
  sebarTitikSama,
  formatJarak,
  fotoSrc,
  jarakLabelElement,
  memberPopup,
  LOKASI_LABEL,
  MEMBER_COLOR,
  PIC_COLOR,
  type HomecellMemberData,
  loadGoogleMaps,
  makeAreaShape,
  pinElement,
  pinHtml,
  type GMaps,
  type MapConfig,
  type MapJemaat,
  type MapViewData,
  type SebaranJemaat,
} from '@/lib/map-view';

/* eslint-disable @typescript-eslint/no-explicit-any */

const INDONESIA_CENTER = { lat: -2.5, lng: 118 };
/** Warna sebaran: biru (sedikit) → hijau → kuning → merah (padat). */
function densityColor(r: number) {
  return r < 0.25 ? '#3B82F6' : r < 0.5 ? '#22C55E' : r < 0.75 ? '#EAB308' : '#DC2626';
}

export default function MapViewPage() {
  const [showCabang, setShowCabang] = useState(true);
  const [showHomecell, setShowHomecell] = useState(true);
  const [showArea, setShowArea] = useState(true);
  // Sebaran jemaat (perkiraan dari alamat, tanpa nama) — default mati.
  const [showSebaran, setShowSebaran] = useState(false);
  // Pin jemaat + foto profil (perkiraan lokasi dari alamat) — default mati.
  const [showJemaat, setShowJemaat] = useState(false);
  const heatRef = useRef<any[]>([]);
  const [cabangId, setCabangId] = useState('');
  const [kategori, setKategori] = useState<'' | 'SINGLE' | 'COUPLE' | 'UMUM'>('');
  // Lihat satu area / satu homecell saja.
  const [areaId, setAreaId] = useState('');
  const [homecellId, setHomecellId] = useState('');
  const [search, setSearch] = useState('');
  const [mapError, setMapError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [tick, setTick] = useState(0);
  // Layar penuh: peta memenuhi layar, saringan & legenda mengambang di atas peta.
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  async function toggleFullscreen() {
    const el = wrapRef.current;
    if (!fullscreen) {
      setFullscreen(true);
      try {
        await el?.requestFullscreen?.();
      } catch {
        /* browser menolak → tetap layar penuh di dalam jendela */
      }
    } else {
      setFullscreen(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    }
  }
  useEffect(() => {
    // Esc / tombol browser keluar dari fullscreen → ikut keluar mode.
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const GRef = useRef<GMaps>(null);
  const infoRef = useRef<any>(null);
  const layerRef = useRef<{ cabang: any; homecell: any; jemaat: any; area: any[] } | null>(null);
  // Kunci → { posisi, html balon, objek peta } untuk fokus dari pencarian.
  const markerIndex = useRef<Map<string, { pos: { lat: number; lng: number }; html: string; obj?: any; bounds?: any }>>(new Map());

  const cfg = useQuery({
    queryKey: ['map-view', 'config'],
    queryFn: async () => (await apiClient.get<{ data: MapConfig }>('/admin/map-view/config')).data.data,
    staleTime: Infinity,
  });
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

  const qc = useQueryClient();
  const geo = useQuery({
    queryKey: ['map-view', 'geocode-status', cabangId],
    queryFn: async () =>
      (await apiClient.get<{ data: GeocodeStatus }>('/admin/map-view/geocode-status', { params: cabangId ? { cabangId } : {} }))
        .data.data,
    enabled: showJemaat || showSebaran,
    // Cepat saat sedang berjalan, santai saat menunggu jadwal.
    refetchInterval: (query) => (query.state.data?.proses.running ? 5_000 : 30_000),
  });
  // Titik baru berhasil → muat ulang pin & sebaran.
  const lastOk = useRef<number | null>(null);
  useEffect(() => {
    const ok = geo.data?.ok;
    if (ok == null) return;
    if (lastOk.current != null && ok !== lastOk.current) {
      void qc.invalidateQueries({ queryKey: ['map-view', 'jemaat'] });
      void qc.invalidateQueries({ queryKey: ['map-view', 'sebaran-jemaat'] });
    }
    lastOk.current = ok;
  }, [geo.data?.ok, qc]);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  async function runNow() {
    setRunMsg(null);
    try {
      const r = await apiClient.post<{ data: { started: boolean; alreadyRunning?: boolean } }>('/admin/map-view/geocode-run');
      setRunMsg(r.data.data.alreadyRunning ? 'Proses sedang berjalan.' : 'Proses dimulai.');
      void geo.refetch();
    } catch (e: any) {
      setRunMsg(e?.response?.status === 403 ? 'Butuh akses ubah menu Jemaat.' : e?.response?.data?.error?.message ?? 'Gagal memulai proses.');
    }
  }

  const jemaatQ = useQuery({
    queryKey: ['map-view', 'jemaat', cabangId],
    queryFn: async () =>
      (await apiClient.get<{ data: MapJemaat[] }>('/admin/map-view/jemaat', { params: cabangId ? { cabangId } : {} })).data
        .data,
    enabled: showJemaat,
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Cek Lokasi Member: homecell yang sedang dicek (dari tombol di balon homecell).
  const [cekHcId, setCekHcId] = useState<string | null>(null);
  const memberQ = useQuery({
    queryKey: ['map-view', 'homecell-member', cekHcId],
    queryFn: async () =>
      (await apiClient.get<{ data: HomecellMemberData }>(`/admin/map-view/homecell/${cekHcId}/member`)).data.data,
    enabled: !!cekHcId,
    retry: false,
  });
  const memberOverlay = useRef<any[]>([]);
  const memberIndex = useRef<Map<string, { pos: { lat: number; lng: number }; html: string }>>(new Map());
  useEffect(() => {
    // Tombol di balon homecell berupa HTML biasa → tangkap kliknya lewat delegasi.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.('[data-cek-member]') as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      setCekHcId(el.dataset.cekMember ?? null);
      infoRef.current?.close();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const cabangOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of q.data?.cabang ?? []) m.set(c.id, c.nama);
    for (const h of q.data?.homecell ?? []) m.set(h.area.cabang.id, h.area.cabang.nama);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id'));
  }, [q.data]);

  const needle = search.trim().toLowerCase();
  const areaOptions = useMemo(
    () =>
      (q.data?.area ?? [])
        .filter((a) => !cabangId || a.cabang.id === cabangId)
        .sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    [q.data, cabangId],
  );
  const homecellOptions = useMemo(
    () =>
      (q.data?.homecell ?? [])
        .filter(
          (h) =>
            (!cabangId || h.area.cabang.id === cabangId) &&
            (!areaId || h.area.id === areaId) &&
            (!kategori || (kategori === 'UMUM' ? !h.kategori : h.kategori === kategori)),
        )
        .sort((a, b) => a.nama.localeCompare(b.nama, 'id')),
    [q.data, cabangId, areaId, kategori],
  );
  // Area efektif: dipilih langsung, atau area dari homecell yang dipilih.
  const homecellPilih = homecellId ? (q.data?.homecell ?? []).find((h) => h.id === homecellId) ?? null : null;
  const areaEfektif = homecellPilih?.area.id ?? areaId;
  const cabangDariArea = areaEfektif ? (q.data?.area ?? []).find((a) => a.id === areaEfektif)?.cabang.id ?? null : null;
  const homecellDiArea = useMemo(
    () => new Set((q.data?.homecell ?? []).filter((h) => h.area.id === areaEfektif).map((h) => h.id)),
    [q.data, areaEfektif],
  );
  const cabangList = useMemo(
    () =>
      (q.data?.cabang ?? []).filter(
        (c) =>
          (!cabangId || c.id === cabangId) &&
          (!cabangDariArea || c.id === cabangDariArea) &&
          (!needle || `${c.nama} ${c.kode} ${c.alamat ?? ''}`.toLowerCase().includes(needle)),
      ),
    [q.data, cabangId, cabangDariArea, needle],
  );
  const homecellList = useMemo(
    () =>
      (q.data?.homecell ?? []).filter(
        (h) =>
          (!cabangId || h.area.cabang.id === cabangId) &&
          (!areaId || h.area.id === areaId) &&
          (!homecellId || h.id === homecellId) &&
          (!kategori || (kategori === 'UMUM' ? !h.kategori : h.kategori === kategori)) &&
          (!needle ||
            `${h.nama} ${h.area.nama} ${h.picJemaat?.namaLengkap ?? ''} ${h.alamat ?? ''}`.toLowerCase().includes(needle)),
      ),
    [q.data, cabangId, areaId, homecellId, kategori, needle],
  );

  const jemaatList = useMemo(
    () =>
      (jemaatQ.data ?? []).filter(
        (j) =>
          (!cabangId || j.cabang.id === cabangId) &&
          // Area/homecell dipilih → hanya anggota homecell tersebut.
          (!homecellId || j.homecell.some((h) => h.id === homecellId)) &&
          (homecellId || !areaId || j.homecell.some((h) => homecellDiArea.has(h.id))) &&
          (!needle || `${j.namaLengkap} ${j.kode ?? ''} ${j.alamat ?? ''}`.toLowerCase().includes(needle)),
      ),
    [jemaatQ.data, cabangId, areaId, homecellId, homecellDiArea, needle],
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
          (!areaEfektif || a.id === areaEfektif) &&
          (!needle || `${a.nama} ${a.cabang.nama} ${a.picJemaat?.namaLengkap ?? ''}`.toLowerCase().includes(needle)),
      )
      .map((a) => ({ area: a, ...(pts.get(a.id) ?? { points: [], names: [] }) }))
      .filter((x) => x.points.length > 0);
  }, [q.data, cabangId, areaEfektif, needle]);
  const areaTanpaTitik = useMemo(
    () => (q.data?.area ?? []).filter((a) => (!cabangId || a.cabang.id === cabangId) && a.denganTitik === 0),
    [q.data, cabangId],
  );

  // 1) Siapkan peta (Google Maps) sekali kunci tersedia.
  useEffect(() => {
    if (!cfg.data) return;
    if (!cfg.data.googleMapsKey) {
      setMapError('Kunci Google Maps belum diatur di server (GOOGLE_MAPS_BROWSER_KEY).');
      return;
    }
    let cancelled = false;
    loadGoogleMaps(cfg.data.googleMapsKey)
      .then((g) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        GRef.current = g;
        const map = new g.maps.Map(mapEl.current, {
          center: INDONESIA_CENTER,
          zoom: 5,
          // Advanced Markers butuh Map ID; DEMO_MAP_ID hanya untuk uji coba.
          mapId: cfg.data!.mapId || 'DEMO_MAP_ID',
          gestureHandling: 'greedy',
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: true,
          // Peta/Satelit di tengah atas supaya tidak tertutup panel saringan (kiri) & tombol keluar (kanan).
          mapTypeControlOptions: { position: g.maps.ControlPosition.TOP_CENTER },
          clickableIcons: false,
        });
        infoRef.current = new g.maps.InfoWindow({ maxWidth: 320 });
        const MC = (window as any).markerClusterer;
        const renderer = (color: string) => ({
          render: ({ count, position }: { count: number; position: any }) => {
            const size = count < 10 ? 34 : count < 100 ? 40 : 46;
            const el = document.createElement('div');
            el.style.cssText = `width:${size}px;height:${size}px;border-radius:999px;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid rgba(255,255,255,.9);box-shadow:0 2px 6px rgba(0,0,0,.3)`;
            el.textContent = String(count);
            return new g.maps.marker.AdvancedMarkerElement({ position, content: el, zIndex: 1000 + count });
          },
        });
        const cluster = (color: string) => new MC.MarkerClusterer({ map, markers: [], renderer: renderer(color) });
        layerRef.current = {
          area: [],
          cabang: cluster(PIN_STYLE.cabang.color),
          homecell: cluster(PIN_STYLE.homecell.color),
          jemaat: cluster(PIN_STYLE.jemaat.color),
        };
        mapRef.current = map;
        setMapError(null);
        setTick((x) => x + 1);
      })
      .catch((e) =>
        !cancelled &&
        setMapError(
          e?.message === 'GOOGLE_AUTH'
            ? 'Kunci Google Maps ditolak. Periksa pembatasan domain (HTTP referrer) & penagihan di Google Cloud.'
            : 'Peta gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.',
        ),
      );
    return () => {
      cancelled = true;
    };
  }, [cfg.data]);

  /** Balon informasi di posisi tertentu (offset ke atas pin bila marker). */
  function openInfo(html: string, pos: any, pinHeight = 0) {
    const g = GRef.current;
    const info = infoRef.current;
    if (!g || !info) return;
    info.setOptions({
      content: html,
      position: pos,
      pixelOffset: new g.maps.Size(0, -pinHeight),
      maxWidth: Math.min(320, window.innerWidth - 56), // muat di layar HP
    });
    info.open({ map: mapRef.current });
  }

  /** Marker Google (Advanced Marker) + klik → balon. */
  function makeMarker(pos: { lat: number; lng: number }, content: HTMLElement, title: string, html: string, pinHeight: number, zIndex = 0) {
    const g = GRef.current;
    const m = new g.maps.marker.AdvancedMarkerElement({ position: pos, content, title, zIndex });
    const open = () => openInfo(html, pos, pinHeight);
    if ('gmpClickable' in m) {
      (m as any).gmpClickable = true;
      m.addEventListener('gmp-click', open);
    } else {
      m.addListener('click', open);
    }
    return m;
  }

  // 2) Gambar ulang pin saat data / saringan berubah.
  useEffect(() => {
    const g = GRef.current;
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!g || !map || !layers) return;
    layers.cabang.clearMarkers();
    layers.homecell.clearMarkers();
    layers.jemaat.clearMarkers();
    layers.area.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null)));
    layers.area = [];
    markerIndex.current.clear();
    // Cek Lokasi Member aktif → hanya homecell yang dicek (+ anggotanya, digambar terpisah).
    if (cekHcId) {
      const h = (q.data?.homecell ?? []).find((x) => x.id === cekHcId);
      if (h) {
        const pos = { lat: h.latitude, lng: h.longitude };
        const html = homecellPopup(h);
        markerIndex.current.set(`h:${h.id}`, { pos, html });
        const m = makeMarker(pos, pinElement('homecell', h.isActive), h.nama, html, 40, 2200);
        m.map = map;
        layers.area.push(m); // ikut dibersihkan saat digambar ulang
      }
      return;
    }
    // Satu area/homecell dipilih → pin dipasang langsung (tanpa kluster) supaya
    // setiap homecell & anggota terlihat sebagai pin, bukan angka kluster.
    const satuPerSatu = !!areaEfektif;
    const pasang = (layer: any, ms: any[]) => {
      if (!satuPerSatu) return layer.addMarkers(ms);
      ms.forEach((m) => (m.map = map));
      layers.area.push(...ms); // ikut dibersihkan saat digambar ulang
    };
    const bounds = new g.maps.LatLngBounds();
    let nBounds = 0;
    const add = (p: { lat: number; lng: number }) => {
      bounds.extend(p);
      nBounds++;
    };

    if (showArea) {
      for (const { area, points, names } of areaList) {
        const shape = makeAreaShape(g, map, area, points);
        const html = areaPopup(area, names);
        shape.addListener('click', (e: any) => openInfo(html, e.latLng));
        shape.addListener('mouseover', () => shape.setOptions({ fillOpacity: 0.28, strokeWeight: 3.5 }));
        shape.addListener('mouseout', () => shape.setOptions({ fillOpacity: 0.14, strokeWeight: 2.5 }));
        layers.area.push(shape);
        const ab = new g.maps.LatLngBounds();
        for (const [lat, lng] of points) {
          ab.extend({ lat, lng });
          add({ lat, lng });
        }
        markerIndex.current.set(`a:${area.id}`, { pos: ab.getCenter().toJSON(), html, bounds: ab });
      }
    }

    if (showCabang) {
      const ms = cabangList.map((c) => {
        const pos = { lat: c.latitude, lng: c.longitude };
        const html = cabangPopup(c);
        markerIndex.current.set(`c:${c.id}`, { pos, html });
        add(pos);
        return makeMarker(pos, pinElement('cabang', c.isActive), c.nama, html, 48, 900);
      });
      pasang(layers.cabang, ms);
    }
    if (showHomecell) {
      const ms = homecellList.map((h) => {
        const pos = { lat: h.latitude, lng: h.longitude };
        const html = homecellPopup(h);
        markerIndex.current.set(`h:${h.id}`, { pos, html });
        add(pos);
        return makeMarker(pos, pinElement('homecell', h.isActive), h.nama, html, 40);
      });
      pasang(layers.homecell, ms);
    }
    if (showJemaat) {
      // Titik yang sama (mis. satu keluarga) disebar melingkar supaya semua pin terlihat.
      const sebar = sebarTitikSama(jemaatList);
      const ms = jemaatList.map((j) => {
        const s = sebar.get(j.id);
        const pos = s?.pos ?? { lat: j.latitude, lng: j.longitude };
        const html = jemaatPopup(j, s?.serumah ?? []);
        markerIndex.current.set(`j:${j.id}`, { pos, html });
        // Jemaat tidak ikut menentukan zoom awal kecuali satu-satunya lapisan.
        if (!showCabang && !showHomecell && !showArea) add(pos);
        return makeMarker(pos, jemaatPinElement(j), j.namaLengkap, html, 52);
      });
      pasang(layers.jemaat, ms);
    }

    // Arahkan peta ke semua pin hanya saat pertama dimuat atau saat cabang/kategori/pencarian
    // berubah. Centang/hapus centang lapisan TIDAK mengubah posisi & zoom peta.
    const key = `${cabangId}|${areaId}|${homecellId}|${kategori}|${needle}|${q.dataUpdatedAt > 0}`;
    if (nBounds && fittedKey.current !== key) {
      fittedKey.current = key;
      if (nBounds === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(15);
      } else {
        map.fitBounds(bounds, 40);
        g.maps.event.addListenerOnce(map, 'idle', () => {
          if (map.getZoom() > 15) map.setZoom(15);
        });
      }
    }
  }, [tick, cabangList, homecellList, areaList, jemaatList, showCabang, showArea, showHomecell, showJemaat, cabangId, areaId, homecellId, areaEfektif, kategori, needle, q.dataUpdatedAt, jemaatQ.dataUpdatedAt, cekHcId, q.data]);

  // Lapisan kepadatan (sebaran jemaat) — lingkaran per sel ±100 m, warna & ukuran
  // sesuai jumlah jemaat (lapisan heatmap Google sudah dihentikan Google).
  useEffect(() => {
    const g = GRef.current;
    const map = mapRef.current;
    heatRef.current.forEach((c) => c.setMap(null));
    heatRef.current = [];
    if (!g || !map || !showSebaran || !sebaran.data || cekHcId) return; // disembunyikan saat Cek Lokasi Member
    const cells = sebaran.data.cells;
    const max = Math.max(3, ...cells.map((c) => c[2]));
    heatRef.current = cells.map(
      ([lat, lng, n]) =>
        new g.maps.Circle({
          map,
          center: { lat, lng },
          radius: 90 + 70 * Math.sqrt(n),
          strokeWeight: 0,
          fillColor: densityColor(n / max),
          fillOpacity: 0.45,
          clickable: false,
          zIndex: 1,
        }),
    );
  }, [tick, showSebaran, sebaran.data, cekHcId]);

  // Garis lurus tebal homecell → anggota/PIC + balon jarak di tengah garis.
  useEffect(() => {
    const g = GRef.current;
    const map = mapRef.current;
    memberOverlay.current.forEach((o) => (o.setMap ? o.setMap(null) : (o.map = null)));
    memberOverlay.current = [];
    memberIndex.current.clear();
    const d = memberQ.data;
    if (!g || !map || !cekHcId || !d || d.homecell.latitude == null || d.homecell.longitude == null) return;
    const hc = { lat: d.homecell.latitude, lng: d.homecell.longitude };
    const ada = d.anggota.filter((m) => m.latitude != null && m.longitude != null);
    const bounds = new g.maps.LatLngBounds();
    bounds.extend(hc);
    // Titik yang sama (satu rumah) disebar sedikit supaya semua pin terlihat.
    const sebar = sebarTitikSama(
      ada.map((m) => ({ ...m, latitude: m.latitude!, longitude: m.longitude!, homecell: [] })),
    );
    for (const m of ada) {
      const pos = sebar.get(m.id)?.pos ?? { lat: m.latitude!, lng: m.longitude! };
      bounds.extend(pos);
    }
    for (const m of ada) {
      const pos = sebar.get(m.id)?.pos ?? { lat: m.latitude!, lng: m.longitude! };
      const color = m.isPic ? PIC_COLOR : MEMBER_COLOR;
      const html = memberPopup(m, d.homecell);
      // Garis lurus tebal: lapisan putih di bawah supaya tetap jelas di atas peta/satelit.
      const garisBawah = new g.maps.Polyline({ map, path: [hc, pos], geodesic: true, strokeColor: '#FFFFFF', strokeOpacity: 1, strokeWeight: 9, clickable: false, zIndex: 6 });
      const garis = new g.maps.Polyline({ map, path: [hc, pos], geodesic: true, strokeColor: color, strokeOpacity: 1, strokeWeight: 5, zIndex: 7 });
      garis.addListener('click', (e: any) => openInfo(html, e.latLng));
      garis.addListener('mouseover', () => garis.setOptions({ strokeWeight: 7 }));
      garis.addListener('mouseout', () => garis.setOptions({ strokeWeight: 5 }));
      memberOverlay.current.push(garisBawah, garis);
      // Balon jarak di tengah garis (klik → detail anggota).
      const mid = { lat: (hc.lat + pos.lat) / 2, lng: (hc.lng + pos.lng) / 2 };
      const balon = new g.maps.marker.AdvancedMarkerElement({
        map,
        position: mid,
        content: jarakLabelElement(m.namaLengkap, formatJarak(m.jarakKm), color),
        zIndex: m.isPic ? 1600 : 1500,
      });
      if ('gmpClickable' in balon) {
        (balon as any).gmpClickable = true;
        balon.addEventListener('gmp-click', () => openInfo(html, mid));
      }
      memberOverlay.current.push(balon);
      memberIndex.current.set(m.id, { pos, html });
      const mk = makeMarker(pos, jemaatPinElement(m, color), m.namaLengkap, html, 52, m.isPic ? 2100 : 2000);
      mk.map = map;
      memberOverlay.current.push(mk);
    }
    if (ada.length) map.fitBounds(bounds, 60);
    else {
      map.setCenter(hc);
      map.setZoom(15);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, cekHcId, memberQ.data]);

  function focusMember(id: string) {
    const it = memberIndex.current.get(id);
    const map = mapRef.current;
    if (!it || !map) return;
    map.panTo(it.pos);
    if (map.getZoom() < 15) map.setZoom(15);
    openInfo(it.html, it.pos, 52);
  }

  function focus(key: string) {
    const g = GRef.current;
    const map = mapRef.current;
    const it = markerIndex.current.get(key);
    if (!g || !map || !it) return;
    if (it.bounds) {
      map.fitBounds(it.bounds, 40);
      openInfo(it.html, it.pos);
      return;
    }
    map.setCenter(it.pos);
    map.setZoom(18); // cukup dekat supaya kluster terurai
    const h = key.startsWith('c:') ? 48 : key.startsWith('j:') ? 52 : 40;
    setTimeout(() => openInfo(it.html, it.pos, h), 300);
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
        ...(showJemaat ? jemaatList.map((j) => ({ key: `j:${j.id}`, nama: j.namaLengkap, sub: `Jemaat · ${j.cabang.nama}` })) : []),
      ].slice(0, 8)
    : [];

  // Saringan & status dipakai di tampilan biasa maupun layar penuh (mengambang).
  const filtersEl = (
    <>
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
            checked={showJemaat}
            onChange={setShowJemaat}
            color={PIN_STYLE.jemaat.color}
            label={`Jemaat${jemaatQ.data ? ` (${jemaatList.length})` : ''}`}
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
          onChange={(e) => {
            setCabangId(e.target.value);
            setAreaId('');
            setHomecellId('');
          }}
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
          onChange={(e) => {
            setKategori(e.target.value as typeof kategori);
            setHomecellId('');
          }}
          disabled={!showHomecell}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
        >
          <option value="">Semua kategori homecell</option>
          <option value="SINGLE">Single</option>
          <option value="COUPLE">Couple</option>
          <option value="UMUM">Umum</option>
        </select>
        <select
          value={areaId}
          onChange={(e) => {
            setAreaId(e.target.value);
            setHomecellId('');
          }}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500 max-w-[220px]"
        >
          <option value="">Semua area</option>
          {areaOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nama}
              {cabangId ? '' : ` · ${a.cabang.nama}`}
            </option>
          ))}
        </select>
        <select
          value={homecellId}
          onChange={(e) => setHomecellId(e.target.value)}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500 max-w-[220px]"
        >
          <option value="">Semua homecell{areaId ? ' di area ini' : ''}</option>
          {homecellOptions.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nama}
              {areaId ? '' : ` · ${h.area.nama}`}
            </option>
          ))}
        </select>
        {areaId || homecellId ? (
          <button
            onClick={() => {
              setAreaId('');
              setHomecellId('');
            }}
            className="text-xs text-sky-700 font-medium hover:underline"
          >
            Tampilkan semua
          </button>
        ) : null}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari cabang / area / homecell / jemaat…"
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
          </>
  );
  const statusEl = (
    <>
      {(showJemaat || showSebaran) && geo.data && <GeocodeProgress s={geo.data} onRun={runNow} msg={runMsg} cabangId={cabangId} />}

      {showJemaat && (jemaatQ.isLoading || jemaatQ.isError) && (
        <div
          className={`-mt-2 text-xs rounded-xl px-3 py-2 border ${jemaatQ.isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-neutral-200 text-neutral-600'}`}
        >
          {jemaatQ.isError
            ? 'Pin jemaat butuh akses menu Jemaat. Hubungi admin untuk Role Access.'
            : 'Memuat pin jemaat…'}
        </div>
      )}

      {showSebaran && (
        <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-600 bg-white border border-neutral-200 rounded-xl px-3 py-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-neutral-800">
            <span className="w-16 h-2 rounded-full" style={{ background: 'linear-gradient(90deg,#3B82F6,#22C55E,#EAB308,#DC2626)' }} />
            Sebaran jemaat (sedikit → padat)
          </span>
          {sebaran.isLoading ? <span>Memuat…</span> : null}
          <span className="text-neutral-400">Perkiraan dari alamat, digabung per ±100 m, tanpa nama.</span>
        </div>
      )}

    </>
  );
  const legendEl = (
    <>
      <Legend kind="cabang" />
      <AreaLegend />
      <Legend kind="homecell" />
      <JemaatLegend />
      <Legend kind="nonaktif" />
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        .ecc-pin-wrap{background:transparent;border:0}
        .ecc-pin{position:relative;transition:transform .15s ease}
        .ecc-pin-wrap:hover .ecc-pin{transform:translateY(-3px) scale(1.06)}
        .ecc-cluster{background:transparent;border:0}
        .ecc-pin-wrap{cursor:pointer}
        .gm-style .gm-style-iw-c{border-radius:14px;padding:12px 14px !important}
        .gm-style .gm-style-iw-d{overflow:auto !important}
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
        <div className="flex items-center gap-4 text-sm flex-wrap">
          {legendEl}
          <button
            onClick={() => void toggleFullscreen()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50 text-neutral-700 font-medium"
            title="Layar penuh"
          >
            <Maximize2 className="w-4 h-4" /> Layar penuh
          </button>
        </div>
      </div>

      {/* Saringan */}
      {!fullscreen && <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center gap-3">{filtersEl}</div>}
      {!fullscreen && statusEl}

      {/* Peta — wrapper yang sama dipakai untuk layar penuh supaya peta tidak dibuat ulang */}
      <div
        ref={wrapRef}
        className={
          fullscreen
            ? 'fixed inset-0 z-[2000] bg-white'
            : 'relative bg-white border border-neutral-200 rounded-xl overflow-hidden'
        }
      >
        <div
          ref={mapEl}
          className={`w-full z-0 ${fullscreen ? '' : 'h-[calc(100vh-320px)] min-h-[460px]'}`}
          // Tinggi eksplisit di layar penuh (persentase bisa 0 saat transisi fullscreen browser).
          style={fullscreen ? { height: '100dvh', minHeight: '100vh' } : undefined}
        />
        {cekHcId && (
          <MemberPanel
            data={memberQ.data}
            loading={memberQ.isLoading}
            error={memberQ.isError ? ((memberQ.error as any)?.response?.status === 403 ? 'Butuh akses menu Jemaat.' : 'Gagal memuat anggota.') : null}
            fullscreen={fullscreen}
            onClose={() => setCekHcId(null)}
            onFocus={focusMember}
          />
        )}
        {fullscreen && (
          <>
            {/* Panel saringan mengambang (kiri atas) */}
            <div className="absolute top-3 left-3 z-[1000] w-[min(560px,calc(100vw-140px))] max-h-[calc(100vh-120px)] overflow-y-auto space-y-2">
              <div className="bg-white/95 backdrop-blur border border-neutral-200 rounded-xl shadow-lg">
                <button
                  onClick={() => setPanelOpen((x) => !x)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-neutral-800"
                >
                  <span className="inline-flex items-center gap-2">
                    <MapPinned className="w-4 h-4" /> Map View · Saringan
                  </span>
                  {panelOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {panelOpen && <div className="px-3 pb-3 flex flex-wrap items-center gap-3">{filtersEl}</div>}
              </div>
              {panelOpen && <div className="space-y-2 [&>*]:mt-0 [&>*]:shadow-lg">{statusEl}</div>}
            </div>
            {/* Legenda mengambang (kiri bawah) */}
            <div className={`${cekHcId ? 'hidden sm:flex' : 'flex'} absolute bottom-6 left-3 z-[1000] bg-white/95 backdrop-blur border border-neutral-200 rounded-xl shadow-lg px-3 py-2 flex-wrap items-center gap-x-4 gap-y-1 text-sm max-w-[calc(100vw-24px)]`}>
              {legendEl}
            </div>
            {/* Keluar layar penuh (kanan atas) */}
            <button
              onClick={() => void toggleFullscreen()}
              className="absolute top-3 right-3 z-[1000] inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/95 border border-neutral-200 shadow-lg text-sm font-medium text-neutral-800 hover:bg-white"
              title="Keluar layar penuh (Esc)"
            >
              <Minimize2 className="w-4 h-4" /> Keluar
            </button>
          </>
        )}
        {(q.isLoading || cfg.isLoading || (!mapRef.current && !mapError)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        )}
        {(mapError || q.isError || cfg.isError) && (
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

/** Panel daftar anggota + PIC homecell, urut jarak ke homecell. */
function MemberPanel({
  data,
  loading,
  error,
  fullscreen,
  onClose,
  onFocus,
}: {
  data: HomecellMemberData | undefined;
  loading: boolean;
  error: string | null;
  fullscreen: boolean;
  onClose: () => void;
  onFocus: (id: string) => void;
}) {
  const ada = (data?.anggota ?? []).filter((m) => m.jarakKm != null);
  const belum = (data?.anggota ?? []).filter((m) => m.latitude == null);
  const jarak = ada.map((m) => m.jarakKm!);
  const rata = jarak.length ? jarak.reduce((a, b) => a + b, 0) / jarak.length : null;
  const maks = jarak.length ? Math.max(...jarak) : null;
  const nAnggota = (data?.anggota ?? []).filter((m) => m.isMember).length;
  // Di HP panel jadi lembar kecil di bawah & tertutup dulu supaya peta tetap terlihat.
  const [buka, setBuka] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640);
  return (
    <div
      className={`absolute z-[1001] flex flex-col bg-white/95 backdrop-blur border border-neutral-200 shadow-lg text-xs
        left-2 right-2 bottom-2 rounded-xl ${buka ? 'max-h-[45%]' : ''}
        sm:left-auto sm:bottom-auto sm:right-3 sm:w-[340px] sm:max-h-[min(70%,560px)] ${fullscreen ? 'sm:top-16' : 'sm:top-3'}`}
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-neutral-100">
        <button onClick={() => setBuka((x) => !x)} className="min-w-0 flex-1 text-left">
          <div className="font-semibold text-sm text-neutral-900 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-violet-600 shrink-0" /> Lokasi member
            {buka ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronUp className="w-4 h-4 text-neutral-400" />}
          </div>
          <div className="text-neutral-500 truncate">
            {data?.homecell.nama ?? 'Memuat…'}
            {!buka && data ? ` · ${nAnggota} anggota · rata-rata ${formatJarak(rata)}` : ''}
          </div>
        </button>
        <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 text-neutral-500 shrink-0" title="Tutup">
          <X className="w-4 h-4" />
        </button>
      </div>
      {!buka ? null : loading ? (
        <div className="p-4 text-center text-neutral-500"><Loader2 className="w-4 h-4 animate-spin inline" /> Memuat anggota…</div>
      ) : error ? (
        <div className="p-3 text-red-600">{error}</div>
      ) : data ? (
        <>
          {data.homecell.latitude == null ? (
            <div className="px-3 py-2 text-amber-700 bg-amber-50">Homecell belum punya titik lokasi, jarak tidak bisa dihitung.</div>
          ) : null}
          <div className="px-3 py-2 grid grid-cols-3 gap-2 border-b border-neutral-100">
            <Ringkas label="Anggota" value={`${nAnggota}`} />
            <Ringkas label="Rata-rata" value={formatJarak(rata)} />
            <Ringkas label="Terjauh" value={formatJarak(maks)} />
          </div>
          <div className="px-3 pt-2 flex items-center gap-3 text-neutral-500">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: PIC_COLOR }} /> PIC</span>
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: MEMBER_COLOR }} /> Anggota</span>
            <span className="ml-auto">Jarak garis lurus</span>
          </div>
          <div className="overflow-y-auto px-1.5 py-1.5">
            {ada.map((m) => (
              <button
                key={m.id}
                onClick={() => onFocus(m.id)}
                className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-neutral-50 text-left"
              >
                <Avatar nama={m.namaLengkap} foto={m.fotoUrl} color={m.isPic ? PIC_COLOR : MEMBER_COLOR} />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-neutral-800 truncate">{m.namaLengkap}</span>
                  <span className="block text-neutral-400 truncate">{m.isPic ? (m.isMember ? 'PIC · anggota' : 'PIC') : 'Anggota'}</span>
                </span>
                <span className="font-semibold text-neutral-800 whitespace-nowrap">{formatJarak(m.jarakKm)}</span>
              </button>
            ))}
            {belum.length ? (
              <div className="mt-1 pt-1.5 border-t border-neutral-100">
                <div className="px-1.5 pb-1 text-neutral-500 font-medium">Belum ada lokasi ({belum.length})</div>
                {belum.map((m) => (
                  <a
                    key={m.id}
                    href={`/dashboard/jemaat/${m.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-neutral-50"
                  >
                    <Avatar nama={m.namaLengkap} foto={m.fotoUrl} color="#A3A3A3" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-neutral-700 truncate">
                        {m.namaLengkap}
                        {m.isPic ? <span className="ml-1 text-amber-600 font-semibold">PIC</span> : null}
                      </span>
                      <span className="block text-neutral-400 truncate">{LOKASI_LABEL[m.lokasi]}</span>
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
            {!data.anggota.length ? <div className="p-3 text-center text-neutral-500">Belum ada anggota.</div> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Ringkas({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-neutral-400">{label}</div>
      <div className="text-sm font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function Avatar({ nama, foto, color }: { nama: string; foto: string | null; color: string }) {
  const src = fotoSrc(foto);
  const ini = nama.trim().split(/\s+/).filter(Boolean);
  const teks = ((ini[0]?.[0] ?? '') + (ini.length > 1 ? ini[ini.length - 1]![0] : '')).toUpperCase();
  return (
    <span className="shrink-0 w-7 h-7 rounded-full border-2 overflow-hidden flex items-center justify-center bg-neutral-200 text-[10px] font-bold text-neutral-600" style={{ borderColor: color }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : teks || '?'}
    </span>
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

interface GeocodeStatus {
  total: number;
  ok: number;
  tidakDitemukan: number;
  terlaluUmum?: number;
  terlaluJauh: number;
  menungguCabang: number;
  menunggu: number;
  rincian?: { semua: number; tamu: number; nonaktif: number; tanpaAlamat: number; beralamat: number };
  aktif: boolean;
  intervalMenit: number;
  perBatch: number;
  provider?: string;
  proses: {
    running: boolean;
    startedAt: string | null;
    batchSize: number;
    batchDone: number;
    lastRunAt: string | null;
    lastResult: { processed: number; ok: number; notFound: number; stopped?: string } | null;
    lastError: string | null;
  };
}

function GeocodeProgress({ s, onRun, msg, cabangId }: { s: GeocodeStatus; onRun: () => void; msg: string | null; cabangId: string }) {
  const [lihat, setLihat] = useState(false);
  const n = (x: number) => x.toLocaleString('id-ID');
  const umum = s.terlaluUmum ?? 0;
  const tidakDikenali = s.tidakDitemukan + s.terlaluJauh;
  const gagal = tidakDikenali + umum;
  const tungguCabang = s.menungguCabang ?? 0;
  const selesai = s.ok + gagal + tungguCabang;
  const pct = s.total ? Math.round((selesai / s.total) * 100) : 100;
  const w = (x: number) => `${s.total ? (x / s.total) * 100 : 0}%`;
  const sisaBatch = Math.ceil(s.menunggu / s.perBatch);
  const etaMenit = sisaBatch * s.intervalMenit;
  const eta = etaMenit >= 60 ? `±${Math.ceil(etaMenit / 60)} jam` : `±${Math.max(etaMenit, 5)} menit`;
  const p = s.proses;
  const jam = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—');
  return (
    <div className="-mt-2 bg-white border border-neutral-200 rounded-xl px-3 py-2.5 text-xs text-neutral-600">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className="font-semibold text-neutral-800 inline-flex items-center gap-1.5">
          {p.running ? <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-600" /> : null}
          Pemetaan alamat jemaat{s.provider ? ` (${s.provider})` : ''}: {n(selesai)} / {n(s.total)} ({pct}%)
        </span>
        {s.rincian ? (
          <span className="basis-full text-[11px] font-normal text-neutral-500 -mt-1">
            Dari {n(s.rincian.semua)} data jemaat: <b className="text-neutral-700">{n(s.rincian.beralamat)}</b> jemaat aktif punya
            alamat (yang dipetakan) · {n(s.rincian.tanpaAlamat)} jemaat aktif belum mengisi alamat · {n(s.rincian.tamu)} tamu ·{' '}
            {n(s.rincian.nonaktif)} nonaktif
          </span>
        ) : null}
        <span className="inline-flex items-center gap-2">
          {msg ? <span className="text-neutral-500">{msg}</span> : null}
          {s.aktif && s.menunggu > 0 && !p.running ? (
            <button
              onClick={onRun}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-neutral-300 hover:bg-neutral-50 text-neutral-700 font-medium"
            >
              <Play className="w-3 h-3" /> Proses sekarang
            </button>
          ) : null}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-neutral-100 overflow-hidden flex">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: w(s.ok) }} />
        <div className="h-full bg-amber-400 transition-all" style={{ width: w(gagal + tungguCabang) }} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />{n(s.ok)} berhasil (tampil di peta)</span>
        <span>
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />
          {n(tidakDikenali)} alamat tidak dikenali
          {umum > 0 ? ` · ${n(umum)} terlalu umum (hanya nama kota/kecamatan)` : ''}
          {gagal > 0 ? (
            <button onClick={() => setLihat((x) => !x)} className="ml-1.5 text-sky-700 font-medium hover:underline">
              {lihat ? 'Tutup daftar' : 'Lihat daftar'}
            </button>
          ) : null}
        </span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-neutral-300 mr-1" />{n(s.menunggu)} menunggu</span>
        {!s.aktif ? (
          <span className="text-red-600">Pemetaan dimatikan di server (GEOCODE_JEMAAT_ENABLED=0).</span>
        ) : p.running ? (
          <span className="text-sky-700">
            Sedang memproses {n(p.batchDone)} / {n(p.batchSize)} alamat via {s.provider ?? 'layanan peta'}…
          </span>
        ) : s.menunggu > 0 ? (
          <span>
            Berjalan otomatis {n(s.perBatch)} alamat tiap {s.intervalMenit} menit · perkiraan selesai {eta}
            {p.lastRunAt ? ` · terakhir ${jam(p.lastRunAt)}` : ' · belum pernah berjalan sejak server menyala'}
          </span>
        ) : (
          <span className="text-emerald-700">Semua alamat sudah diproses.</span>
        )}
        {p.lastError ? <span className="text-red-600">Kendala terakhir: {p.lastError}</span> : null}
      </div>
      {lihat ? <AlamatPerluDicek cabangId={cabangId} /> : null}
    </div>
  );
}

interface AlamatBermasalah {
  id: string;
  namaLengkap: string;
  kode: string | null;
  noHp: string | null;
  alamat: string | null;
  cabang: string;
  status: 'NOT_FOUND' | 'TERLALU_UMUM';
}

/** Daftar jemaat yang alamatnya perlu dilengkapi — untuk ditindaklanjuti. */
function AlamatPerluDicek({ cabangId }: { cabangId: string }) {
  const [cari, setCari] = useState('');
  const [jenis, setJenis] = useState<'' | 'NOT_FOUND' | 'TERLALU_UMUM'>('');
  const q = useQuery({
    queryKey: ['map-view', 'alamat-perlu-dicek', cabangId],
    queryFn: async () =>
      (await apiClient.get<{ data: AlamatBermasalah[] }>('/admin/map-view/alamat-perlu-dicek', { params: cabangId ? { cabangId } : {} }))
        .data.data,
  });
  const rows = useMemo(() => {
    const k = cari.trim().toLowerCase();
    return (q.data ?? []).filter(
      (r) =>
        (!jenis || r.status === jenis) &&
        (!k || `${r.namaLengkap} ${r.kode ?? ''} ${r.alamat ?? ''} ${r.cabang}`.toLowerCase().includes(k)),
    );
  }, [q.data, cari, jenis]);
  const label = (st: AlamatBermasalah['status']) => (st === 'TERLALU_UMUM' ? 'Terlalu umum' : 'Tidak dikenali');
  function unduhCsv() {
    const esc = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      ['Nama', 'Kode', 'No HP', 'Cabang', 'Alamat', 'Masalah'].join(','),
      ...rows.map((r) => [esc(r.namaLengkap), esc(r.kode), esc(r.noHp), esc(r.cabang), esc(r.alamat), esc(label(r.status))].join(',')),
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'alamat-jemaat-perlu-dicek.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <div className="mt-2.5 border-t border-neutral-100 pt-2.5">
      <p className="text-[11px] text-neutral-500 mb-2">
        <b>Tidak dikenali</b>: alamat tidak ditemukan di Google Maps. <b>Terlalu umum</b>: alamat hanya menyebut kota/kecamatan
        (mis. cuma &quot;Bandung&quot;) sehingga titiknya hanya tengah kota. Minta jemaat melengkapi alamat (nama jalan, nomor,
        kelurahan) di app atau ubah di detail jemaat — alamat yang diperbaiki otomatis dipetakan ulang.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari nama, kode, atau alamat"
            className="w-full pl-7 pr-2 py-1.5 border border-neutral-300 rounded-md text-xs"
          />
        </div>
        <select value={jenis} onChange={(e) => setJenis(e.target.value as typeof jenis)} className="px-2 py-1.5 border border-neutral-300 rounded-md text-xs bg-white">
          <option value="">Semua masalah</option>
          <option value="TERLALU_UMUM">Terlalu umum</option>
          <option value="NOT_FOUND">Tidak dikenali</option>
        </select>
        <button
          onClick={unduhCsv}
          disabled={!rows.length}
          className="px-2 py-1.5 rounded-md border border-neutral-300 hover:bg-neutral-50 text-neutral-700 font-medium disabled:opacity-50"
        >
          Unduh CSV
        </button>
        <span className="text-neutral-500">{rows.length.toLocaleString('id-ID')} jemaat</span>
      </div>
      {q.isLoading ? (
        <div className="py-4 text-center text-neutral-500"><Loader2 className="w-4 h-4 animate-spin inline" /> Memuat…</div>
      ) : q.isError ? (
        <div className="py-3 text-red-600">Gagal memuat daftar (butuh akses menu Jemaat).</div>
      ) : (
        <div className="max-h-72 overflow-auto border border-neutral-200 rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 sticky top-0">
              <tr className="text-left text-neutral-500">
                <th className="px-2 py-1.5 font-medium">Jemaat</th>
                <th className="px-2 py-1.5 font-medium hidden sm:table-cell">Cabang</th>
                <th className="px-2 py-1.5 font-medium">Alamat</th>
                <th className="px-2 py-1.5 font-medium">Masalah</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-neutral-100 align-top">
                  <td className="px-2 py-1.5">
                    <a href={`/dashboard/jemaat/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-sky-700 font-medium hover:underline">
                      {r.namaLengkap}
                    </a>
                    {r.kode ? <div className="text-neutral-400">{r.kode}</div> : null}
                  </td>
                  <td className="px-2 py-1.5 hidden sm:table-cell">{r.cabang}</td>
                  <td className="px-2 py-1.5 break-words max-w-[260px]">{r.alamat}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded ${r.status === 'TERLALU_UMUM' ? 'bg-amber-50 text-amber-700' : 'bg-neutral-100 text-neutral-600'}`}>
                      {label(r.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr><td colSpan={4} className="px-2 py-4 text-center text-neutral-500">Tidak ada data.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function JemaatLegend() {
  const c = PIN_STYLE.jemaat.color;
  return (
    <span className="inline-flex items-center gap-1.5 text-neutral-700">
      <span className="w-5 h-5 rounded-full border-[3px]" style={{ borderColor: c, background: '#e0f2fe' }} />
      {PIN_STYLE.jemaat.label}
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
