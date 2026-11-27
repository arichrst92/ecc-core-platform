'use client';

/**
 * Tab bergaya persona ECC (sama dengan detail event): garis bawah oranye,
 * ikon dalam kotak — aktif = gradien brand, lainnya netral. Dipakai semua
 * halaman Portal yang punya tab supaya seragam.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type PersonaTab<K extends string> = {
  key: K;
  label: ReactNode;
  Icon?: LucideIcon;
  /** Angka di samping label (0 / null = disembunyikan). */
  badge?: number | null;
  /** Badge merah (perlu tindakan). */
  warn?: boolean;
  /** Elemen tambahan setelah label (mis. badge "Perlu diisi"). */
  extra?: ReactNode;
  disabled?: boolean;
  title?: string;
};

export function PersonaTabs<K extends string>({
  items,
  value,
  onChange,
  sticky = false,
  className = '',
}: {
  items: PersonaTab<K>[];
  value: K;
  onChange: (k: K) => void;
  /** Menempel di atas saat digulir (halaman panjang). */
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex gap-1 overflow-x-auto border-b border-neutral-200 ${
        sticky ? 'sticky top-0 z-20 bg-neutral-50/95 backdrop-blur' : ''
      } ${className}`}
    >
      {items.map((x) => {
        const on = x.key === value;
        return (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={x.disabled}
            title={x.title}
            onClick={() => onChange(x.key)}
            className={`inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px disabled:opacity-40 ${
              on ? 'border-brand-500 text-brand-700' : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {x.Icon ? (
              <span
                className={`w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0 ${
                  on ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                <x.Icon className="w-3.5 h-3.5" />
              </span>
            ) : null}
            {x.label}
            {x.extra}
            {x.badge ? (
              <span
                className={`text-[11px] font-bold px-1.5 rounded-full ${
                  x.warn ? 'bg-red-500 text-white' : on ? 'bg-brand-100 text-brand-700' : 'bg-neutral-200 text-neutral-600'
                }`}
              >
                {x.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
