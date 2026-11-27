'use client';

import { useState } from 'react';
import { AlertTriangle, ScanLine } from 'lucide-react';
/** Petugas yang berwenang scan check-in (detail event & halaman Kehadiran ibadah). Kosong → peringatan. */
export function ScanAccessCard({
  loading,
  scanners,
  onManage,
  kind = 'event',
  manageLabel,
}: {
  loading: boolean;
  scanners: { id: string; nama: string; fotoUrl: string | null; pelayanan: string; peran: string | null; khususTanggal?: boolean }[];
  onManage: () => void;
  kind?: 'event' | 'ibadah';
  manageLabel?: string;
}) {
  const where = kind === 'ibadah' ? 'detail ibadah → tab Pelayanan' : 'tab Pelayanan & Volunteer';
  const [showAll, setShowAll] = useState(false);
  if (loading) return null;
  if (scanners.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 sm:px-6 py-3 flex flex-wrap items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-[14rem]">
          <div className="text-sm font-semibold text-amber-900">Belum ada petugas yang bisa scan check-in</div>
          <p className="text-xs text-amber-800 leading-5">
            Di hari {kind === 'ibadah' ? 'ibadah' : 'acara'} tidak ada yang bisa scan QR {kind === 'ibadah' ? 'jemaat' : 'peserta'} dari Els App. Tambahkan petugas di {where} lalu
            centang izin scan. Sementara itu, check-in hanya bisa dilakukan admin lewat tombol Check-in di Portal
            {' '}atau self check-in jemaat (bila aktif){kind === 'ibadah' ? '; ibadah anak juga oleh petugas CKids' : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={onManage}
          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shrink-0"
        >
          {manageLabel ?? 'Atur petugas scan'}
        </button>
      </div>
    );
  }
  const LIMIT = 8;
  const list = showAll ? scanners : scanners.slice(0, LIMIT);
  return (
    <div className="mb-4 rounded-xl border border-neutral-200 bg-white px-4 sm:px-6 py-3">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <ScanLine className="w-4 h-4 text-green-600" />
        <span className="text-sm font-semibold text-neutral-900">Berwenang scan check-in ({scanners.length})</span>
        <span className="text-xs text-neutral-500 flex-1 min-w-[12rem]">
          {kind === 'ibadah'
            ? 'Petugas ini bisa scan QR jemaat dari Els App (menu Scanner). Admin Kehadiran juga bisa check-in dari Portal.'
            : 'Petugas ini bisa scan QR peserta dari Els App (menu Scanner). Admin event juga bisa check-in dari Portal.'}
        </span>
        <button type="button" onClick={onManage} className="text-xs font-semibold text-brand-700 hover:underline">
          Ubah
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {list.map((v) => (
          <span key={v.id} className="flex items-center gap-2 rounded-full bg-neutral-50 border border-neutral-200 pl-1 pr-3 py-1 max-w-full">
            {v.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={/^https?:/.test(v.fotoUrl) ? v.fotoUrl : `${process.env.NEXT_PUBLIC_CORE_API_URL ?? ''}${v.fotoUrl}`} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />
            ) : (
              <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                {v.nama
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((x) => x[0])
                  .join('')
                  .toUpperCase()}
              </span>
            )}
            <span className="min-w-0">
              <span className="block text-xs font-medium text-neutral-900 truncate">{v.nama}</span>
              <span className="block text-[10px] text-neutral-500 truncate">
                {v.pelayanan}
                {v.peran ? ` · ${v.peran}` : ''}
                {v.khususTanggal ? ' · khusus tanggal ini' : ''}
              </span>
            </span>
          </span>
        ))}
        {scanners.length > LIMIT ? (
          <button type="button" onClick={() => setShowAll((x) => !x)} className="text-xs font-semibold text-brand-700 hover:underline px-2">
            {showAll ? 'Sembunyikan' : `+${scanners.length - LIMIT} lainnya`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
