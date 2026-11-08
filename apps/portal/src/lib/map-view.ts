/**
 * Map View — Google Maps (JavaScript API + Advanced Markers + MarkerClusterer)
 * + pembuat pin & isi balon informasi. Dipakai app/dashboard/map/page.tsx.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type GMaps = any;

/** Kunci & Map ID dari server (GET /admin/map-view/config) — tidak di-bundle di Portal. */
export interface MapConfig {
  googleMapsKey: string | null;
  mapId: string | null;
}

function addScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing?.dataset.loaded === '1') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = existing ?? document.createElement('script');
    s.addEventListener('load', () => {
      s.dataset.loaded = '1';
      resolve();
    });
    s.addEventListener('error', () => reject(new Error(`Gagal memuat ${src}`)));
    if (!existing) {
      s.src = src;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

const CLUSTERER_JS = 'https://unpkg.com/@googlemaps/markerclusterer@2.5.3/dist/index.min.js';

let loading: Promise<GMaps> | null = null;
/** Muat Google Maps JavaScript API (+ library marker) dan MarkerClusterer. */
export function loadGoogleMaps(key: string): Promise<GMaps> {
  const w = window as any;
  if (w.google?.maps?.marker?.AdvancedMarkerElement && w.markerClusterer) return Promise.resolve(w.google);
  if (!loading) {
    loading = new Promise<GMaps>((resolve, reject) => {
      w.__eccGmapsReady = () => resolve(w.google);
      const url =
        `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}` +
        '&v=weekly&libraries=marker&language=id&region=ID&loading=async&callback=__eccGmapsReady';
      addScript(url).catch(reject);
      // Kunci ditolak (referrer/billing) → Google memanggil gm_authFailure.
      w.gm_authFailure = () => reject(new Error('GOOGLE_AUTH'));
    })
      .then(async (g) => {
        await addScript(CLUSTERER_JS);
        return g;
      })
      .catch((e) => {
        loading = null;
        throw e;
      });
  }
  return loading;
}

export interface SebaranJemaat {
  /** [lat, lng, jumlah jemaat] per sel ±100 m — tanpa nama. */
  cells: [number, number, number][];
  status: { total: number; ok: number; tidakDitemukan: number; terlaluJauh: number; menunggu: number };
}

// ------------------------------------------------------------------ data

export interface MapCabang {
  id: string;
  nama: string;
  kode: string;
  alamat: string | null;
  kontak: string | null;
  latitude: number;
  longitude: number;
  mapsUrl: string | null;
  timezone: string;
  isActive: boolean;
  jemaatCount: number;
  ibadahCount: number;
  homecellCount: number;
}

export interface MapHomecell {
  id: string;
  nama: string;
  alamat: string | null;
  hari: string | null;
  jam: string | null;
  kategori: 'SINGLE' | 'COUPLE' | null;
  usiaMin: number | null;
  usiaMax: number | null;
  latitude: number;
  longitude: number;
  mapsUrl: string | null;
  isActive: boolean;
  memberCount: number;
  picJemaat: { namaLengkap: string; noHp: string | null } | null;
  area: { id: string; nama: string; cabang: { id: string; nama: string } };
}

export interface MapArea {
  id: string;
  nama: string;
  deskripsi: string | null;
  isActive: boolean;
  cabang: { id: string; nama: string };
  picJemaat: { namaLengkap: string; noHp: string | null } | null;
  /** Pastor zona (boleh kosong / lebih dari satu). */
  pastors?: { id: string; namaLengkap: string }[];
  homecellCount: number;
  memberCount: number;
  denganTitik: number;
}

export interface MapLocalBusiness {
  id: string;
  nama: string;
  industri: string | null;
  lokasi: string | null;
  logoUrl: string | null;
  mapsUrl: string | null;
  waAdmin: string | null;
  latitude: number;
  longitude: number;
  itemCount: number;
  owner: { namaLengkap: string; cabang: { id: string; nama: string } | null };
}

export interface MapViewData {
  cabang: MapCabang[];
  localMarket?: MapLocalBusiness[];
  area: MapArea[];
  homecell: MapHomecell[];
  tanpaTitik: { cabang: { id: string; nama: string }[]; homecell: { id: string; nama: string; cabang: string }[] };
}

// ------------------------------------------------------------------ pin

export const PIN_STYLE = {
  cabang: { color: '#EA580C', label: 'Cabang gereja' },
  area: { color: '#0D9488', label: 'Zona' },
  jemaat: { color: '#0284C7', label: 'Jemaat' },
  homecell: { color: '#7C3AED', label: 'Homecell' },
  localMarket: { color: '#D97706', label: 'Local Market' },
  nonaktif: { color: '#9CA3AF', label: 'Nonaktif' },
} as const;

/** Ikon (path SVG 24×24, gaya garis) di dalam pin. */
const ICON_PATH = {
  // gereja: menara + salib
  cabang:
    '<path d="M12 2v4M10 4h4"/><path d="M18 22V11l-6-4-6 4v11"/><path d="M4 22h16"/><path d="M10 22v-4a2 2 0 0 1 4 0v4"/>',
  // rumah
  homecell:
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  // bisnis / toko (lucide "store")
  localMarket:
    '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7"/>',
};

/**
 * Ukuran pin bertingkat (lebar × tinggi px):
 *   Sangat besar — Cabang gereja · Besar — Homecell · Sedang — Local Market · Kecil — Jemaat.
 */
export type PinKind = 'cabang' | 'homecell' | 'localMarket';
export const PIN_SIZE: Record<PinKind, { w: number; h: number; icon: number }> = {
  cabang: { w: 52, h: 68, icon: 26 },
  homecell: { w: 40, h: 52, icon: 20 },
  localMarket: { w: 32, h: 42, icon: 16 },
};
/** Tinggi pin (px) — untuk posisi balon di atas pin. */
export const JEMAAT_PIN_H = 36;

export function pinHtml(kind: PinKind, active = true): string {
  const color = active ? PIN_STYLE[kind].color : PIN_STYLE.nonaktif.color;
  const { w, h, icon } = PIN_SIZE[kind];
  // lingkaran putih di kepala pin (viewBox 40×52: pusat y 19.5, r 13) → posisi ikon proporsional
  const top = (19.5 / 52) * h - icon / 2;
  return `
<div class="ecc-pin" style="width:${w}px;height:${h}px">
  <svg viewBox="0 0 40 52" width="${w}" height="${h}" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="M20 1C9.5 1 1 9.4 1 19.8 1 33.7 20 51 20 51s19-17.3 19-31.2C39 9.4 30.5 1 20 1z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="20" cy="19.5" r="13" fill="#fff"/>
  </svg>
  <svg viewBox="0 0 24 24" width="${icon}" height="${icon}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
       style="position:absolute;left:${(w - icon) / 2}px;top:${top}px">${ICON_PATH[kind]}</svg>
</div>`;
}

/** Elemen pin (untuk AdvancedMarkerElement — ujung pin = titik lokasi). */
export function pinElement(kind: PinKind, active = true): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ecc-pin-wrap';
  el.innerHTML = pinHtml(kind, active);
  return el;
}

// ------------------------------------------------------------------ balon

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const HARI: Record<string, string> = {
  SENIN: 'Senin',
  SELASA: 'Selasa',
  RABU: 'Rabu',
  KAMIS: 'Kamis',
  JUMAT: 'Jumat',
  SABTU: 'Sabtu',
  MINGGU: 'Minggu',
};

function usiaText(min: number | null, max: number | null) {
  if (min != null && max != null) return min === max ? `${min} th` : `${min}–${max} th`;
  if (min != null) return `≥ ${min} th`;
  if (max != null) return `≤ ${max} th`;
  return 'Semua usia';
}

function gmapsHref(mapsUrl: string | null, lat: number, lng: number) {
  return mapsUrl && /^https?:\/\//i.test(mapsUrl) ? mapsUrl : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

function badge(text: string, bg: string, fg: string) {
  return `<span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${bg};color:${fg};font-size:11px;font-weight:600">${esc(text)}</span>`;
}

function row(label: string, value: string) {
  return `<div style="display:flex;gap:8px;font-size:12px;line-height:1.5"><span style="color:#737373;min-width:62px">${label}</span><span style="color:#171717;flex:1">${value}</span></div>`;
}

function buttons(detailHref: string, mapsHref: string, color: string) {
  return `<div style="display:flex;gap:6px;margin-top:10px">
    <a href="${esc(detailHref)}" style="flex:1;text-align:center;padding:6px 8px;border-radius:8px;background:${color};color:#fff;font-size:12px;font-weight:600;text-decoration:none">Lihat detail</a>
    <a href="${esc(mapsHref)}" target="_blank" rel="noopener noreferrer" style="flex:1;text-align:center;padding:6px 8px;border-radius:8px;border:1px solid #e5e5e5;color:#404040;font-size:12px;font-weight:600;text-decoration:none">Google Maps</a>
  </div>`;
}

export function cabangPopup(c: MapCabang): string {
  const color = PIN_STYLE.cabang.color;
  return `<div style="min-width:230px;max-width:280px;font-family:inherit">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
      ${badge('Cabang gereja', '#FFEDD5', '#C2410C')}
      ${c.isActive ? '' : badge('Nonaktif', '#F5F5F5', '#525252')}
    </div>
    <div style="font-size:15px;font-weight:700;color:#171717;margin:4px 0 6px">${esc(c.nama)} <span style="color:#a3a3a3;font-weight:500;font-size:12px">${esc(c.kode)}</span></div>
    ${c.alamat ? row('Alamat', esc(c.alamat)) : ''}
    ${c.kontak ? row('Kontak', esc(c.kontak)) : ''}
    <div style="display:flex;gap:6px;margin-top:8px">
      ${stat(c.jemaatCount, 'Jemaat')}${stat(c.homecellCount, 'Homecell')}${stat(c.ibadahCount, 'Ibadah')}
    </div>
    ${buttons(`/dashboard/cabang/${c.id}`, gmapsHref(c.mapsUrl, c.latitude, c.longitude), color)}
  </div>`;
}

function stat(n: number, label: string) {
  return `<div style="flex:1;text-align:center;background:#FAFAFA;border:1px solid #F0F0F0;border-radius:8px;padding:4px 2px">
    <div style="font-size:14px;font-weight:700;color:#171717">${n.toLocaleString('id-ID')}</div>
    <div style="font-size:10px;color:#737373">${label}</div></div>`;
}

export function homecellPopup(h: MapHomecell): string {
  const color = PIN_STYLE.homecell.color;
  const kat =
    h.kategori === 'SINGLE'
      ? badge('Single', '#E0F2FE', '#0369A1')
      : h.kategori === 'COUPLE'
        ? badge('Couple', '#FCE7F3', '#BE185D')
        : badge('Umum', '#D1FAE5', '#047857');
  const jadwal = [h.hari ? HARI[h.hari] ?? h.hari : null, h.jam].filter(Boolean).join(', ');
  const wa = h.picJemaat?.noHp ? h.picJemaat.noHp.replace(/\D/g, '') : null;
  const pic = h.picJemaat
    ? `${esc(h.picJemaat.namaLengkap)}${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" style="color:#16A34A;font-weight:600">WhatsApp</a>` : ''}`
    : '<span style="color:#a3a3a3">Belum ada</span>';
  return `<div style="min-width:230px;max-width:280px;font-family:inherit">
    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      ${badge('Homecell', '#EDE9FE', '#6D28D9')}${kat}${badge(usiaText(h.usiaMin, h.usiaMax), '#F5F5F5', '#525252')}
      ${h.isActive ? '' : badge('Nonaktif', '#F5F5F5', '#525252')}
    </div>
    <div style="font-size:15px;font-weight:700;color:#171717;margin:6px 0 2px">${esc(h.nama)}</div>
    <div style="font-size:12px;color:#737373;margin-bottom:6px">${esc(h.area.nama)} · ${esc(h.area.cabang.nama)}</div>
    ${row('Jadwal', jadwal ? esc(jadwal) : '<span style="color:#a3a3a3">Belum diatur</span>')}
    ${row('Pemimpin', pic)}
    ${row('Anggota', `${h.memberCount.toLocaleString('id-ID')} orang`)}
    ${h.alamat ? row('Alamat', esc(h.alamat)) : ''}
    <div style="display:flex;gap:6px;margin-top:10px">
      <button type="button" data-cek-member="${esc(h.id)}" style="flex:1;padding:7px 6px;border-radius:8px;border:1px solid ${color};background:#F5F3FF;color:${color};font-size:12px;font-weight:700;cursor:pointer">Cek Lokasi Member</button>
      <button type="button" data-potensial="${esc(h.id)}" style="flex:1;padding:7px 6px;border-radius:8px;border:1px solid ${POTENSIAL_COLOR};background:#ECFDF5;color:${POTENSIAL_COLOR};font-size:12px;font-weight:700;cursor:pointer">Cari Potensial Member</button>
    </div>
    ${buttons(`/dashboard/homecell/${h.id}`, gmapsHref(h.mapsUrl, h.latitude, h.longitude), color)}
  </div>`;
}

// ------------------------------------------------------------------ poligon area

/** Warna per area (stabil dari id) — supaya area bertetangga mudah dibedakan. */
const AREA_PALETTE = ['#0D9488', '#2563EB', '#DB2777', '#CA8A04', '#7C3AED', '#16A34A', '#DC2626', '#0891B2', '#9333EA', '#EA580C'];
export function areaColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AREA_PALETTE[h % AREA_PALETTE.length]!;
}

type Pt = [number, number]; // [lat, lng]

/** Convex hull (monotone chain) — keliling terluar titik homecell. */
export function convexHull(points: Pt[]): Pt[] {
  const uniq = Array.from(new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values());
  if (uniq.length < 3) return uniq;
  const pts = uniq.map(([lat, lng]) => ({ x: lng, y: lat })).sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  return hull.map((p) => [p.y, p.x]);
}

/**
 * Poligon yang melewati SEMUA titik (bukan hanya keliling terluar): titik diurutkan
 * menurut sudut dari titik tengahnya → setiap homecell menjadi sudut poligon dan
 * garisnya tidak saling bersilangan.
 */
export function polygonSemuaTitik(points: Pt[]): Pt[] {
  const uniq = Array.from(new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values());
  if (uniq.length < 3) return uniq;
  const cLat = uniq.reduce((a, p) => a + p[0], 0) / uniq.length;
  const cLng = uniq.reduce((a, p) => a + p[1], 0) / uniq.length;
  const k = Math.cos((cLat * Math.PI) / 180); // skala bujur supaya sudut tidak terdistorsi
  const info = uniq.map((p) => {
    const x = (p[1] - cLng) * k;
    const y = p[0] - cLat;
    return { p, a: Math.atan2(y, x), d: x * x + y * y };
  });
  info.sort((u, v) => u.a - v.a || u.d - v.d);
  return info.map((i) => i.p);
}

/**
 * Bentuk area di peta dari titik homecell-nya:
 *  ≥3 titik (tidak segaris) → poligon yang menghubungkan semua titik homecell,
 *  2 titik / segaris → garis penghubung, 1 titik → lingkaran kecil.
 */
export function makeAreaShape(g: GMaps, map: any, area: MapArea, points: Pt[]) {
  const color = area.isActive ? areaColor(area.id) : PIN_STYLE.nonaktif.color;
  const style = {
    map,
    strokeColor: color,
    strokeOpacity: 0.9,
    strokeWeight: 2.5,
    fillColor: color,
    fillOpacity: 0.14,
    clickable: true,
  };
  const hull = convexHull(points);
  if (hull.length >= 3) {
    const semua = polygonSemuaTitik(points).map(([lat, lng]) => ({ lat, lng }));
    return new g.maps.Polygon({ ...style, paths: semua });
  }
  // Segaris: garis melewati semua titik, diurutkan sepanjang garis.
  const path = [...points]
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(([lat, lng]) => ({ lat, lng }));
  if (hull.length === 2) return new g.maps.Polyline({ ...style, path, strokeWeight: 5 });
  return new g.maps.Circle({ ...style, center: path[0], radius: 350 });
}

export function areaPopup(a: MapArea, homecellNames: string[]): string {
  const color = a.isActive ? areaColor(a.id) : PIN_STYLE.nonaktif.color;
  const wa = a.picJemaat?.noHp ? a.picJemaat.noHp.replace(/\D/g, '') : null;
  const pic = a.picJemaat
    ? `${esc(a.picJemaat.namaLengkap)}${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" style="color:#16A34A;font-weight:600">WhatsApp</a>` : ''}`
    : '<span style="color:#a3a3a3">Belum ada</span>';
  const list = homecellNames.slice(0, 8).map((n) => `<li>${esc(n)}</li>`).join('');
  const more = homecellNames.length > 8 ? `<li style="color:#737373">+${homecellNames.length - 8} lainnya</li>` : '';
  const belum = a.homecellCount - a.denganTitik;
  return `<div style="min-width:230px;max-width:280px;font-family:inherit">
    <div style="display:flex;align-items:center;gap:6px">
      <span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${color}22;color:${color};font-size:11px;font-weight:600">Zona</span>
      ${a.isActive ? '' : badge('Nonaktif', '#F5F5F5', '#525252')}
    </div>
    <div style="font-size:15px;font-weight:700;color:#171717;margin:6px 0 2px">${esc(a.nama)}</div>
    <div style="font-size:12px;color:#737373;margin-bottom:6px">${esc(a.cabang.nama)}</div>
    ${row('PIC zona', pic)}
    ${row('Pastor', a.pastors?.length ? esc(a.pastors.map((p) => p.namaLengkap).join(', ')) : '<span style="color:#a3a3a3">Belum ada</span>')}
    <div style="display:flex;gap:6px;margin-top:8px">${stat(a.homecellCount, 'Homecell')}${stat(a.memberCount, 'Anggota')}</div>
    ${list ? `<div style="font-size:12px;color:#404040;margin-top:8px"><div style="color:#737373;margin-bottom:2px">Homecell di peta</div><ul style="margin:0;padding-left:16px;line-height:1.5">${list}${more}</ul></div>` : ''}
    ${belum > 0 ? `<div style="font-size:11px;color:#B45309;margin-top:6px">${belum} homecell belum punya titik lokasi</div>` : ''}
    <div style="margin-top:10px"><a href="/dashboard/homecell-area/${esc(a.id)}" style="display:block;text-align:center;padding:6px 8px;border-radius:8px;background:${color};color:#fff;font-size:12px;font-weight:600;text-decoration:none">Lihat detail zona</a></div>
  </div>`;
}

// ------------------------------------------------------------------ jemaat

export interface MapJemaat {
  id: string;
  namaLengkap: string;
  kode: string | null;
  fotoUrl: string | null;
  jenisKelamin: 'L' | 'P' | null;
  noHp: string | null;
  alamat: string | null;
  latitude: number;
  longitude: number;
  placeId?: string | null;
  presisi?: 'RUMAH' | 'JALAN' | 'KAWASAN' | null;
  cabang: { id: string; nama: string };
  homecell: { id: string; nama: string }[];
}

const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
export const fotoSrc = (u: string | null) => (!u ? null : /^https?:\/\//i.test(u) ? u : `${API_BASE}${u}`);

function initials(nama: string) {
  const p = nama.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1]![0] : '')).toUpperCase() || '?';
}

function avatarHtml(j: Pick<MapJemaat, 'fotoUrl' | 'jenisKelamin' | 'namaLengkap'>, size: number) {
  const src = fotoSrc(j.fotoUrl);
  const bg = j.jenisKelamin === 'P' ? '#DB2777' : j.jenisKelamin === 'L' ? '#2563EB' : '#64748B';
  const fallback = `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size * 0.38)}px">${esc(initials(j.namaLengkap))}</div>`;
  if (!src) return fallback;
  // Foto gagal dimuat → tampilkan inisial.
  return `<img src="${esc(src)}" alt="" loading="lazy" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;border-radius:999px;object-fit:cover;display:block;background:#e5e7eb"
    onerror="this.outerHTML=this.dataset.fb" data-fb="${esc(fallback)}"/>`;
}

/** Pin jemaat: foto profil bulat dengan bingkai biru + ujung penunjuk. */
export function jemaatPinElement(j: Pick<MapJemaat, 'fotoUrl' | 'jenisKelamin' | 'namaLengkap'>, c: string = PIN_STYLE.jemaat.color): HTMLElement {
  // Kecil (pin terkecil di peta): lingkaran 28 px + ekor.
  const html = `<div class="ecc-pin" style="width:28px;height:${JEMAAT_PIN_H}px">
    <div style="box-sizing:border-box;width:28px;height:28px;border-radius:999px;background:${c};padding:2px;box-shadow:0 1px 3px rgba(0,0,0,.35)">
      <div style="box-sizing:border-box;width:24px;height:24px;border-radius:999px;overflow:hidden;border:1.5px solid #fff">${avatarHtml(j, 21)}</div>
    </div>
    <div style="width:0;height:0;margin:-1px auto 0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${c}"></div>
  </div>`;
  const el = document.createElement('div');
  el.className = 'ecc-pin-wrap';
  el.innerHTML = html;
  return el;
}

/** Jemaat lain di titik yang sama (mis. satu keluarga) ikut ditampilkan di balon. */
export function jemaatPopup(j: MapJemaat, serumah: MapJemaat[] = []): string {
  const c = PIN_STYLE.jemaat.color;
  const wa = j.noHp ? j.noHp.replace(/\D/g, '') : null;
  const hc = j.homecell.length ? j.homecell.map((h) => esc(h.nama)).join(', ') : '<span style="color:#a3a3a3">Belum ikut homecell</span>';
  // Titik hasil geocoding Google (place_id bila ada) → tepat ke lokasi yang dipetakan.
  const maps = `https://www.google.com/maps/search/?api=1&query=${j.latitude},${j.longitude}${
    j.placeId ? `&query_place_id=${encodeURIComponent(j.placeId)}` : ''
  }`;
  return `<div style="min-width:240px;max-width:290px;font-family:inherit">
    <div style="display:flex;gap:10px;align-items:center">
      <div style="flex-shrink:0;border-radius:999px;border:3px solid ${c}">${avatarHtml(j, 56)}</div>
      <div style="min-width:0">
        ${badge('Jemaat', '#E0F2FE', '#0369A1')}
        <div style="font-size:15px;font-weight:700;color:#171717;margin-top:3px;line-height:1.25">${esc(j.namaLengkap)}</div>
        <div style="font-size:12px;color:#737373">${j.kode ? `${esc(j.kode)} · ` : ''}${esc(j.cabang.nama)}</div>
      </div>
    </div>
    <div style="margin-top:8px">
      ${row('Homecell', hc)}
      ${j.noHp ? row('No HP', `${esc(j.noHp)}${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" style="color:#16A34A;font-weight:600">WhatsApp</a>` : ''}`) : ''}
      ${j.alamat ? row('Alamat', esc(j.alamat)) : ''}
      ${serumah.length ? row(`Satu titik (${serumah.length})`, serumah.map((o) => `<a href="/dashboard/jemaat/${o.id}" target="_blank" rel="noopener noreferrer" style="color:#0369A1">${esc(o.namaLengkap)}</a>`).join(', ')) : ''}
    </div>
    <div style="font-size:11px;color:#a3a3a3;margin-top:6px">Lokasi pin = perkiraan dari alamat${
      j.presisi === 'RUMAH' ? ' (tingkat rumah/gedung).' : j.presisi === 'JALAN' ? ' (tingkat jalan).' : j.presisi === 'KAWASAN' ? ' (tingkat kelurahan/perumahan).' : '.'
    }</div>
    ${buttons(`/dashboard/jemaat/${j.id}`, maps, c)}
  </div>`;
}

/**
 * Jemaat dengan titik yang sama (mis. satu keluarga di satu alamat) disebar
 * melingkar beberapa meter di sekitar titik aslinya supaya setiap pin terlihat.
 * Mengembalikan posisi tampil per jemaat + daftar jemaat lain di titik yang sama.
 */
export function sebarTitikSama(list: MapJemaat[]): Map<string, { pos: { lat: number; lng: number }; serumah: MapJemaat[] }> {
  const grup = new Map<string, MapJemaat[]>();
  for (const j of list) {
    const k = `${j.latitude.toFixed(5)},${j.longitude.toFixed(5)}`; // ±1 m dianggap sama
    const g = grup.get(k);
    if (g) g.push(j);
    else grup.set(k, [j]);
  }
  const out = new Map<string, { pos: { lat: number; lng: number }; serumah: MapJemaat[] }>();
  for (const g of grup.values()) {
    if (g.length === 1) {
      out.set(g[0]!.id, { pos: { lat: g[0]!.latitude, lng: g[0]!.longitude }, serumah: [] });
      continue;
    }
    g.sort((a, b) => a.namaLengkap.localeCompare(b.namaLengkap));
    // Jari-jari (meter) bertambah dengan jumlah orang agar pin tidak saling menutupi saat diperbesar.
    const rM = Math.max(8, g.length * 2.5);
    const { latitude: lat0, longitude: lng0 } = g[0]!;
    const dLat = rM / 111_320;
    const dLng = rM / (111_320 * Math.max(0.2, Math.cos((lat0 * Math.PI) / 180)));
    g.forEach((j, i) => {
      const a = (2 * Math.PI * i) / g.length - Math.PI / 2;
      out.set(j.id, {
        pos: { lat: lat0 + dLat * Math.sin(a), lng: lng0 + dLng * Math.cos(a) },
        serumah: g.filter((o) => o.id !== j.id),
      });
    });
  }
  return out;
}

// ------------------------------------------------------------------ cek lokasi member homecell

export interface HomecellMemberLokasi {
  id: string;
  namaLengkap: string;
  kode: string | null;
  fotoUrl: string | null;
  jenisKelamin: 'L' | 'P' | null;
  noHp: string | null;
  alamat: string | null;
  cabang: { id: string; nama: string };
  isPic: boolean;
  isMember: boolean;
  lokasi: 'OK' | 'TANPA_ALAMAT' | 'TIDAK_DIKENALI' | 'TERLALU_UMUM' | 'MENUNGGU';
  latitude: number | null;
  longitude: number | null;
  presisi: 'RUMAH' | 'JALAN' | 'KAWASAN' | null;
  jarakKm: number | null;
}
export interface HomecellMemberData {
  homecell: { id: string; nama: string; latitude: number | null; longitude: number | null };
  anggota: HomecellMemberLokasi[];
}

export const MEMBER_COLOR = '#0EA5E9';
export const PIC_COLOR = '#F59E0B';

export function formatJarak(km: number | null): string {
  if (km == null) return '-';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('id-ID', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

export const LOKASI_LABEL: Record<HomecellMemberLokasi['lokasi'], string> = {
  OK: 'Terpetakan',
  TANPA_ALAMAT: 'Belum mengisi alamat',
  TIDAK_DIKENALI: 'Alamat tidak dikenali',
  TERLALU_UMUM: 'Alamat terlalu umum',
  MENUNGGU: 'Menunggu dipetakan',
};

/** Balon jarak di tengah garis homecell → member: nama + jarak, dengan ekor ke garis. */
export function jarakLabelElement(nama: string, jarak: string, color: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'ecc-pin-wrap';
  const depan = nama.trim().split(/\s+/)[0] ?? nama;
  // Layar HP: balon jarak ringkas (angka saja) supaya tidak menutupi peta.
  const kecil = typeof window !== 'undefined' && window.innerWidth < 640;
  el.innerHTML = `<div class="ecc-pin" style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))">
    <div style="background:#fff;border:2px solid ${color};border-radius:10px;padding:${kecil ? '1px 5px' : '3px 8px'};text-align:center;line-height:1.15;white-space:nowrap">
      <div style="font-size:${kecil ? 11 : 13}px;font-weight:800;color:#171717">${esc(jarak)}</div>
      ${kecil ? '' : `<div style="font-size:10px;color:#737373;max-width:110px;overflow:hidden;text-overflow:ellipsis">${esc(depan)} → homecell</div>`}
    </div>
    <div style="width:0;height:0;margin-top:-1px;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color}"></div>
  </div>`;
  return el;
}

export function memberPopup(m: HomecellMemberLokasi, hc: HomecellMemberData['homecell']): string {
  const c = m.isPic ? PIC_COLOR : MEMBER_COLOR;
  const wa = m.noHp ? m.noHp.replace(/\D/g, '') : null;
  const peran = m.isPic ? badge(m.isMember ? 'PIC · Anggota' : 'PIC', '#FEF3C7', '#B45309') : badge('Anggota', '#E0F2FE', '#0369A1');
  const presisi = m.presisi === 'RUMAH' ? 'rumah/gedung' : m.presisi === 'JALAN' ? 'jalan' : m.presisi === 'KAWASAN' ? 'kelurahan/perumahan' : null;
  const rute =
    m.latitude != null && hc.latitude != null
      ? `https://www.google.com/maps/dir/?api=1&origin=${m.latitude},${m.longitude}&destination=${hc.latitude},${hc.longitude}`
      : null;
  return `<div style="min-width:230px;max-width:280px;font-family:inherit">
    <div style="display:flex;gap:10px;align-items:center">
      <div style="flex-shrink:0;border-radius:999px;border:3px solid ${c}">${avatarHtml(m, 52)}</div>
      <div style="min-width:0">
        ${peran}
        <div style="font-size:15px;font-weight:700;color:#171717;margin-top:3px;line-height:1.25">${esc(m.namaLengkap)}</div>
        <div style="font-size:12px;color:#737373">${m.kode ? `${esc(m.kode)} · ` : ''}${esc(m.cabang.nama)}</div>
      </div>
    </div>
    <div style="margin-top:8px">
      ${row('Jarak ke homecell', `<b>${esc(formatJarak(m.jarakKm))}</b> <span style="color:#a3a3a3">(garis lurus)</span>`)}
      ${m.noHp ? row('No HP', `${esc(m.noHp)}${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" style="color:#16A34A;font-weight:600">WhatsApp</a>` : ''}`) : ''}
      ${m.alamat ? row('Alamat', esc(m.alamat)) : ''}
    </div>
    <div style="font-size:11px;color:#a3a3a3;margin-top:6px">Lokasi = perkiraan dari alamat${presisi ? ` (tingkat ${presisi})` : ''}.</div>
    ${
      rute
        ? buttons(`/dashboard/jemaat/${m.id}`, rute, c).replace('>Google Maps<', '>Rute ke homecell<')
        : buttons(`/dashboard/jemaat/${m.id}`, `https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`, c)
    }
  </div>`;
}

// ------------------------------------------------------------------ potensial member homecell

/** Warna pin & lingkaran radius "Cari Potensial Member". */
export const POTENSIAL_COLOR = '#059669';

export interface PotensialMember {
  id: string;
  namaLengkap: string;
  kode: string | null;
  fotoUrl: string | null;
  jenisKelamin: 'L' | 'P' | null;
  noHp: string | null;
  alamat: string | null;
  usia: number | null;
  cabang: { id: string; nama: string };
  latitude: number;
  longitude: number;
  jarakKm: number;
}
export interface PotensialMemberData {
  homecell: { id: string; nama: string; latitude: number; longitude: number; cabangId: string };
  radiusKm: number;
  total: number;
  data: PotensialMember[];
}

export function potensialPopup(m: PotensialMember, hc: PotensialMemberData['homecell']): string {
  const c = POTENSIAL_COLOR;
  const wa = m.noHp ? m.noHp.replace(/\D/g, '') : null;
  const rute = `https://www.google.com/maps/dir/?api=1&origin=${m.latitude},${m.longitude}&destination=${hc.latitude},${hc.longitude}`;
  return `<div style="min-width:230px;max-width:280px;font-family:inherit">
    <div style="display:flex;gap:10px;align-items:center">
      <div style="flex-shrink:0;border-radius:999px;border:3px solid ${c}">${avatarHtml(m, 52)}</div>
      <div style="min-width:0">
        ${badge('Belum homecell', '#D1FAE5', '#047857')}
        <div style="font-size:15px;font-weight:700;color:#171717;margin-top:3px;line-height:1.25">${esc(m.namaLengkap)}</div>
        <div style="font-size:12px;color:#737373">${m.kode ? `${esc(m.kode)} · ` : ''}${esc(m.cabang.nama)}</div>
      </div>
    </div>
    <div style="margin-top:8px">
      ${row('Jarak ke homecell', `<b>${esc(formatJarak(m.jarakKm))}</b> <span style="color:#a3a3a3">(garis lurus)</span>`)}
      ${m.usia != null ? row('Usia', `${m.usia} tahun`) : ''}
      ${m.noHp ? row('No HP', `${esc(m.noHp)}${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" style="color:#16A34A;font-weight:600">WhatsApp</a>` : ''}`) : ''}
      ${m.alamat ? row('Alamat', esc(m.alamat)) : ''}
    </div>
    <div style="font-size:11px;color:#a3a3a3;margin-top:6px">Lokasi = perkiraan dari alamat.</div>
    ${buttons(`/dashboard/jemaat/${m.id}`, rute, c).replace('>Google Maps<', '>Rute ke homecell<')}
  </div>`;
}

// ------------------------------------------------------------------ Local Market

export function localMarketPopup(b: MapLocalBusiness): string {
  const color = PIN_STYLE.localMarket.color;
  const wa = b.waAdmin ? b.waAdmin.replace(/\D/g, '').replace(/^0/, '62') : null;
  const web = `https://eccchurch.global/local-market/${encodeURIComponent(b.id)}`;
  return `<div style="min-width:230px;max-width:280px;font-family:inherit">
    <div style="display:flex;align-items:center;gap:6px">${badge('Local Market', '#FEF3C7', '#B45309')}${b.industri ? badge(b.industri, '#F5F5F5', '#525252') : ''}</div>
    <div style="font-size:15px;font-weight:700;color:#171717;margin:6px 0 2px">${esc(b.nama)}</div>
    <div style="font-size:12px;color:#737373;margin-bottom:6px">${esc(b.owner.namaLengkap)}${b.owner.cabang ? ` · ${esc(b.owner.cabang.nama)}` : ''}</div>
    ${b.lokasi ? row('Lokasi', esc(b.lokasi)) : ''}
    ${row('Katalog', `${b.itemCount.toLocaleString('id-ID')} item`)}
    ${wa ? row('WhatsApp', `<a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" style="color:#16A34A;font-weight:600">Chat</a>`) : ''}
    <div style="display:flex;gap:6px;margin-top:10px">
      <a href="${esc(web)}" target="_blank" rel="noopener noreferrer" style="flex:1;text-align:center;padding:6px 8px;border-radius:8px;background:${color};color:#fff;font-size:12px;font-weight:600;text-decoration:none">Lihat usaha</a>
      <a href="${esc(gmapsHref(b.mapsUrl, b.latitude, b.longitude))}" target="_blank" rel="noopener noreferrer" style="flex:1;text-align:center;padding:6px 8px;border-radius:8px;border:1px solid #e5e5e5;color:#404040;font-size:12px;font-weight:600;text-decoration:none">Google Maps</a>
    </div>
  </div>`;
}
