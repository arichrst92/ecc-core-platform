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

export interface MapViewData {
  cabang: MapCabang[];
  homecell: MapHomecell[];
  tanpaTitik: { cabang: { id: string; nama: string }[]; homecell: { id: string; nama: string; cabang: string }[] };
}

// ------------------------------------------------------------------ pin

export const PIN_STYLE = {
  cabang: { color: '#EA580C', label: 'Cabang gereja' },
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
