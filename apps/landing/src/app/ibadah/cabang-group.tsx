'use client';

import { useState } from 'react';
import {
  Calendar,
  Church,
  ChevronDown,
  ChevronUp,
  Globe,
  MapPin,
} from 'lucide-react';

export interface IbadahItem {
  id: string;
  tanggal: string;
  jam: string;
  jamSelesai: string;
  judul: string;
  kategori: { id: string; nama: string };
  lokasi: string | null;
  isOnline: boolean;
}

interface CabangGroupProps {
  /** Nama cabang gereja (header). */
  cabangNama: string;
  /** Total ibadah di cabang ini (untuk subtitle). */
  totalCount: number;
  /** Ibadah yang sudah di-group per tanggal — sorted by tanggal ASC. */
  perTanggal: Array<{ tanggal: string; items: IbadahItem[] }>;
  /** Apakah default state terbuka. Default false (collapsed). */
  defaultOpen?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function CabangGroup({
  cabangNama,
  totalCount,
  perTanggal,
  defaultOpen = false,
}: CabangGroupProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-neutral-200 rounded-2xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-neutral-50 transition text-left"
      >
        <div className="w-10 h-10 bg-brand-100 text-brand-600 rounded-lg flex items-center justify-center shrink-0">
          <Church className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-lg text-neutral-900 leading-tight">
            {cabangNama}
          </h2>
          <p className="text-xs text-neutral-500">
            {totalCount} ibadah dalam 30 hari ke depan
          </p>
        </div>
        <div className="shrink-0 text-neutral-400">
          {open ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-2 space-y-5 border-t border-neutral-100">
          {perTanggal.map(({ tanggal, items }) => (
            <div key={tanggal}>
              <h3 className="font-semibold text-xs text-neutral-700 mb-2 flex items-center gap-2 uppercase tracking-wide">
                <Calendar className="w-3.5 h-3.5 text-brand-500" />
                {formatDate(tanggal)}
              </h3>
              <div className="space-y-2">
                {items.map((e) => (
                  <div
                    key={`${e.id}-${e.tanggal}`}
                    className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="sm:w-24 shrink-0 text-center sm:text-left">
                      <div className="font-mono text-lg font-bold text-brand-600">
                        {e.jam}
                      </div>
                      <div className="text-xs text-neutral-400">{e.jamSelesai}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-neutral-900">{e.judul}</h4>
                        <span className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full text-[11px] font-semibold uppercase tracking-wide">
                          {e.kategori.nama}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                        {e.isOnline ? (
                          <span className="flex items-center gap-1 text-brand-600">
                            <Globe className="w-3.5 h-3.5" />
                            Online streaming
                          </span>
                        ) : e.lokasi ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {e.lokasi}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
