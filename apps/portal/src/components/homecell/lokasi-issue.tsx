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
}

export const LOKASI_CODE_LABEL: Record<LokasiIssueCode, string> = {
  TITIK_BAWAAN: 'titik di laut (bawaan Google)',
  LINTANG_TERBALIK: 'tanda minus koordinat hilang',
  JAUH_DARI_CABANG: 'jauh dari cabang',
  LINK_TIDAK_TERBACA: 'link tidak terbaca',
  BELUM_ADA_LOKASI: 'belum ada lokasi',
};

/** Badge kecil untuk kolom daftar. */
export function LokasiBadge({ issue }: { issue: LokasiIssue | null | undefined }) {
  if (!issue) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700" title="Titik lokasi terbaca & wajar">
        <MapPin className="w-3 h-3" /> OK
      </span>
    );
  }
  return (
    <span
      title={issue.saran}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
        issue.serius ? 'bg-red-100 text-red-700' : 'bg-neutral-100 text-neutral-600'
      }`}
    >
      {issue.serius ? <AlertTriangle className="w-3 h-3" /> : <MapPinOff className="w-3 h-3" />}
      {issue.label}
    </span>
  );
}

/** Kotak penjelasan + cara memperbaiki (halaman detail). */
export function LokasiIssueBox({
  issue,
  latitude,
  longitude,
  mapsUrl,
}: {
  issue: LokasiIssue | null | undefined;
  latitude?: number | null;
  longitude?: number | null;
  mapsUrl?: string | null;
}) {
  if (!issue) return null;
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
