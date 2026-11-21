'use client';

/**
 * Tanda & penjelasan titik lokasi homecell yang bermasalah (dihitung server,
 * lihat core-api lib/homecell-location.ts). Dipakai di daftar & detail Homecell.
 */
import { AlertTriangle, MapPin, MapPinOff } from 'lucide-react';

export type LokasiIssueCode = 'LINK_TIDAK_TERBACA' | 'TITIK_BAWAAN' | 'LINTANG_TERBALIK' | 'JAUH_DARI_CABANG' | 'BELUM_ADA_LOKASI';

export interface LokasiIssue {
  code: LokasiIssueCode;
  serius: boolean;
  label: string;
  saran: string;
  jarakKm?: number;
  jarakSetelahDibetulkanKm?: number;
  titik?: { lat: number; lng: number } | null;
  cabangNama?: string | null;
}

/** "1.533 km" / "850 m" (format Indonesia). */
export function fmtJarak(km: number | null | undefined): string {
  if (km == null) return '–';
  if (km < 1) return km < 0.05 ? "< 50 m" : `${Math.round(km * 1000)} m`;
  return `${km.toLocaleString('id-ID', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

const fmtTitik = (t: { lat: number; lng: number }) => `${t.lat.toFixed(5)}, ${t.lng.toFixed(5)}`;
const gmaps = (t: { lat: number; lng: number }) => `https://www.google.com/maps?q=${t.lat},${t.lng}`;

export const LOKASI_CODE_LABEL: Record<LokasiIssueCode, string> = {
  TITIK_BAWAAN: 'titik di laut (bawaan Google)',
  LINTANG_TERBALIK: 'tanda minus koordinat hilang',
  JAUH_DARI_CABANG: 'jauh dari cabang',
  LINK_TIDAK_TERBACA: 'link tidak terbaca',
  BELUM_ADA_LOKASI: 'belum ada lokasi',
};

/** Badge + titik bermasalah + jarak ke cabang, untuk kolom daftar. */
export function LokasiBadge({
  issue,
  jarakKm,
  cabangNama,
}: {
  issue: LokasiIssue | null | undefined;
  /** Jarak titik ke cabang (km) — ditampilkan juga untuk titik yang OK. */
  jarakKm?: number | null;
  cabangNama?: string | null;
}) {
  const cab = issue?.cabangNama ?? cabangNama ?? 'cabang';
  if (!issue) {
    return (
      <div className="leading-tight">
        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700" title="Titik lokasi terbaca & wajar">
          <MapPin className="w-3 h-3" /> OK
        </span>
        {jarakKm != null && <div className="text-[10px] text-neutral-500 mt-0.5">{fmtJarak(jarakKm)} dari {cab}</div>}
      </div>
    );
  }
  return (
    <div className="leading-tight" title={issue.saran}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
          issue.serius ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-600'
        }`}
      >
        {issue.serius ? <AlertTriangle className="w-3 h-3" /> : <MapPinOff className="w-3 h-3" />}
        {issue.label}
      </span>
      {issue.titik && (
        <div className="text-[10px] text-neutral-500 mt-0.5">
          Titik:{' '}
          <a href={gmaps(issue.titik)} target="_blank" rel="noreferrer" className="underline font-mono" onClick={(e) => e.stopPropagation()}>
            {fmtTitik(issue.titik)}
          </a>
        </div>
      )}
      {(issue.jarakKm ?? jarakKm) != null && (
        <div className={`text-[10px] mt-0.5 ${issue.serius ? 'text-red-700 font-medium' : 'text-neutral-500'}`}>
          {fmtJarak(issue.jarakKm ?? jarakKm)} dari {cab}
          {issue.jarakSetelahDibetulkanKm != null && (
            <span className="text-emerald-700 font-normal"> · ±{fmtJarak(issue.jarakSetelahDibetulkanKm)} bila minus dibetulkan</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Kotak penjelasan + cara memperbaiki (halaman detail). */
export function LokasiIssueBox({
  issue,
  latitude,
  longitude,
  mapsUrl,
  jarakKm,
  cabangNama,
}: {
  issue: LokasiIssue | null | undefined;
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
  jarakKm?: number | null;
  cabangNama?: string | null;
}) {
  if (!issue) return null;
  const cab = issue.cabangNama ?? cabangNama ?? 'cabang';
  const km = issue.jarakKm ?? jarakKm;
  const pt = latitude != null && longitude != null ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` : null;
  return (
    <div
      className={`rounded-xl border p-4 text-sm ${
        issue.serius ? 'bg-red-50 border-red-200 text-red-900' : 'bg-amber-50 border-amber-200 text-amber-900'
      }`}
    >
      <div className="font-semibold flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> Lokasi homecell: {issue.label}
      </div>
      <p className="mt-1">{issue.saran}</p>
      <div className="mt-2 text-xs flex flex-wrap gap-x-4 gap-y-1 opacity-90">
        {pt && (
          <span>
            Titik tersimpan:{' '}
            <a className="underline" href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noreferrer">
              {pt}
            </a>
          </span>
        )}
        <span>
          Jarak ke {cab}: <b>{km != null ? fmtJarak(km) : 'tidak diketahui (titik homecell/cabang belum ada)'}</b>
          {issue.jarakSetelahDibetulkanKm != null && (
            <> · bila tanda minus dibetulkan: <b>±{fmtJarak(issue.jarakSetelahDibetulkanKm)}</b></>
          )}
        </span>
        {mapsUrl && (
          <span className="truncate max-w-full">
            Link:{' '}
            <a className="underline break-all" href={mapsUrl} target="_blank" rel="noreferrer">
              {mapsUrl}
            </a>
          </span>
        )}
      </div>
      <p className="mt-2 text-xs">
        <b>Cara memperbaiki:</b> Portal → Homecell → <b>Edit</b> homecell ini → isi <b>Lokasi (link Google Maps)</b> dengan link
        Bagikan dari titik lokasi pertemuan, atau tempel koordinat (mis. -6.2088, 106.8456). PIC juga bisa mengubahnya dari app
        (Homecell → Lokasi).
      </p>
    </div>
  );
}
