/**
 * Map View — pemuat Leaflet (dari CDN, tanpa dependensi npm baru) + pembuat
 * pin & isi balon informasi. Dipakai app/dashboard/map/page.tsx.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Leaflet = any;

const CDN = 'https://cdnjs.cloudflare.com/ajax/libs';
const ASSETS = {
  leafletCss: `${CDN}/leaflet/1.9.4/leaflet.min.css`,
  leafletJs: `${CDN}/leaflet/1.9.4/leaflet.min.js`,
  clusterCss: `${CDN}/leaflet.markercluster/1.5.3/MarkerCluster.min.css`,
  clusterJs: `${CDN}/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js`,
  heatJs: `${CDN}/leaflet.heat/0.2.0/leaflet-heat.js`,
};

function addCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
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

let loading: Promise<Leaflet> | null = null;
export function loadLeaflet(): Promise<Leaflet> {
  const w = window as any;
  if (w.L?.markerClusterGroup) return Promise.resolve(w.L);
  if (!loading) {
    loading = (async () => {
      addCss(ASSETS.leafletCss);
      addCss(ASSETS.clusterCss);
      await addScript(ASSETS.leafletJs);
      await addScript(ASSETS.clusterJs);
      return w.L;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/** Plugin peta kepadatan — dimuat hanya saat lapisan Sebaran Jemaat dinyalakan. */
export async function loadHeat(): Promise<Leaflet> {
  const L = await loadLeaflet();
  if (!L.heatLayer) await addScript(ASSETS.heatJs);
  return L;
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
  homecellCount: number;
  memberCount: number;
  denganTitik: number;
}

export interface MapViewData {
  cabang: MapCabang[];
  area: MapArea[];
  homecell: MapHomecell[];
  tanpaTitik: { cabang: { id: string; nama: string }[]; homecell: { id: string; nama: string; cabang: string }[] };
}

// ------------------------------------------------------------------ pin

export const PIN_STYLE = {
  cabang: { color: '#EA580C', label: 'Cabang gereja' },
  area: { color: '#0D9488', label: 'Homecell area' },
  jemaat: { color: '#0284C7', label: 'Jemaat' },
  homecell: { color: '#7C3AED', label: 'Homecell' },
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
};

export function pinHtml(kind: 'cabang' | 'homecell', active = true): string {
  const color = active ? PIN_STYLE[kind].color : PIN_STYLE.nonaktif.color;
  const big = kind === 'cabang';
  const w = big ? 40 : 32;
  const h = big ? 52 : 42;
  const icon = big ? 20 : 16;
  return `
<div class="ecc-pin" style="width:${w}px;height:${h}px">
  <svg viewBox="0 0 40 52" width="${w}" height="${h}" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
    <path d="M20 1C9.5 1 1 9.4 1 19.8 1 33.7 20 51 20 51s19-17.3 19-31.2C39 9.4 30.5 1 20 1z" fill="${color}" stroke="#fff" stroke-width="2"/>
    <circle cx="20" cy="19.5" r="13" fill="#fff"/>
  </svg>
  <svg viewBox="0 0 24 24" width="${icon}" height="${icon}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
       style="position:absolute;left:${(w - icon) / 2}px;top:${big ? 9.5 : 7.5}px">${ICON_PATH[kind]}</svg>
</div>`;
}

export function makeIcon(L: Leaflet, kind: 'cabang' | 'homecell', active = true) {
  const big = kind === 'cabang';
  const w = big ? 40 : 32;
  const h = big ? 52 : 42;
  return L.divIcon({
    html: pinHtml(kind, active),
    className: 'ecc-pin-wrap',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    popupAnchor: [0, -h + 4],
  });
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
 * Bentuk area di peta dari titik homecell-nya:
 *  ≥3 titik (tidak segaris) → poligon keliling terluar,
 *  2 titik / segaris → garis penghubung, 1 titik → lingkaran kecil.
 */
export function makeAreaLayer(L: Leaflet, area: MapArea, points: Pt[]) {
  const color = area.isActive ? areaColor(area.id) : PIN_STYLE.nonaktif.color;
  const style = {
    color,
    weight: 2.5,
    opacity: 0.9,
    fillColor: color,
    fillOpacity: 0.14,
    dashArray: area.isActive ? undefined : '6 6',
  };
  const hull = convexHull(points);
  if (hull.length >= 3) return L.polygon(hull, style);
  if (hull.length === 2) return L.polyline(hull, { ...style, weight: 5, dashArray: '8 6' });
  return L.circle(hull[0], { ...style, radius: 350 });
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
      <span style="display:inline-block;padding:1px 8px;border-radius:999px;background:${color}22;color:${color};font-size:11px;font-weight:600">Homecell area</span>
      ${a.isActive ? '' : badge('Nonaktif', '#F5F5F5', '#525252')}
    </div>
    <div style="font-size:15px;font-weight:700;color:#171717;margin:6px 0 2px">${esc(a.nama)}</div>
    <div style="font-size:12px;color:#737373;margin-bottom:6px">${esc(a.cabang.nama)}</div>
    ${row('PIC area', pic)}
    <div style="display:flex;gap:6px;margin-top:8px">${stat(a.homecellCount, 'Homecell')}${stat(a.memberCount, 'Anggota')}</div>
    ${list ? `<div style="font-size:12px;color:#404040;margin-top:8px"><div style="color:#737373;margin-bottom:2px">Homecell di peta</div><ul style="margin:0;padding-left:16px;line-height:1.5">${list}${more}</ul></div>` : ''}
    ${belum > 0 ? `<div style="font-size:11px;color:#B45309;margin-top:6px">${belum} homecell belum punya titik lokasi</div>` : ''}
    <div style="margin-top:10px"><a href="/dashboard/homecell-area/${esc(a.id)}" style="display:block;text-align:center;padding:6px 8px;border-radius:8px;background:${color};color:#fff;font-size:12px;font-weight:600;text-decoration:none">Lihat detail area</a></div>
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
  cabang: { id: string; nama: string };
  homecell: { id: string; nama: string }[];
}

const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
export const fotoSrc = (u: string | null) => (!u ? null : /^https?:\/\//i.test(u) ? u : `${API_BASE}${u}`);

function initials(nama: string) {
  const p = nama.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1]![0] : '')).toUpperCase() || '?';
}

function avatarHtml(j: MapJemaat, size: number) {
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
export function makeJemaatIcon(L: Leaflet, j: MapJemaat) {
  const c = PIN_STYLE.jemaat.color;
  const html = `<div class="ecc-pin" style="width:44px;height:54px">
    <div style="box-sizing:border-box;width:44px;height:44px;border-radius:999px;background:${c};padding:3px;box-shadow:0 2px 4px rgba(0,0,0,.35)">
      <div style="box-sizing:border-box;width:38px;height:38px;border-radius:999px;overflow:hidden;border:2px solid #fff">${avatarHtml(j, 34)}</div>
    </div>
    <div style="width:0;height:0;margin:-2px auto 0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:11px solid ${c}"></div>
  </div>`;
  return L.divIcon({ html, className: 'ecc-pin-wrap', iconSize: [44, 54], iconAnchor: [22, 54], popupAnchor: [0, -50] });
}

export function jemaatPopup(j: MapJemaat): string {
  const c = PIN_STYLE.jemaat.color;
  const wa = j.noHp ? j.noHp.replace(/\D/g, '') : null;
  const hc = j.homecell.length ? j.homecell.map((h) => esc(h.nama)).join(', ') : '<span style="color:#a3a3a3">Belum ikut homecell</span>';
  const maps = j.alamat
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.alamat)}`
    : `https://www.google.com/maps/search/?api=1&query=${j.latitude},${j.longitude}`;
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
    </div>
    <div style="font-size:11px;color:#a3a3a3;margin-top:6px">Lokasi pin = perkiraan dari alamat.</div>
    ${buttons(`/dashboard/jemaat/${j.id}`, maps, c)}
  </div>`;
}
