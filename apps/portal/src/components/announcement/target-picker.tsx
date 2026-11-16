'use client';

/**
 * Pilih penerima Announcement: chip Cabang / Area / Homecell (dropdown cari) +
 * Jemaat (cari nama/kode ke server).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';

export interface TargetOption {
  id: string;
  nama: string;
  sub?: string | null;
}
interface Targets {
  cabang: { id: string; nama: string }[];
  areas: { id: string; nama: string; cabang: string | null }[];
  homecells: { id: string; nama: string; area: string | null; cabang: string | null }[];
  jemaat: { id: string; nama: string; kode: string | null; cabang: string | null }[];
}

export function useTargets(q = '') {
  return useQuery({
    queryKey: ['announcement-targets', q],
    queryFn: async () => (await apiClient.get<{ data: Targets }>('/admin/announcement/targets', { params: { q: q || undefined } })).data.data,
    staleTime: q ? 30_000 : 5 * 60_000,
  });
}

/** Dropdown pilih banyak dengan pencarian lokal / server. */
export function ChipSelect({
  label,
  options,
  selected,
  onChange,
  disabled,
  onSearch,
  loading,
  placeholder,
  names,
}: {
  label: string;
  options: TargetOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  /** Bila diisi: pencarian ke server (opsi = hasil cari). Tanpa ini: saring lokal. */
  onSearch?: (q: string) => void;
  loading?: boolean;
  placeholder: string;
  /** Nama untuk id terpilih yang tidak ada di `options` (mis. jemaat hasil cari sebelumnya). */
  names: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    const list = onSearch ? options : options.filter((o) => !k || `${o.nama} ${o.sub ?? ''}`.toLowerCase().includes(k));
    return list.slice(0, 60);
  }, [options, q, onSearch]);
  const nameOf = (id: string) => names.get(id) ?? options.find((o) => o.id === id)?.nama ?? '…';

  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 items-start py-1.5">
      <div className="text-sm text-neutral-500 pt-1.5">{label}</div>
      <div ref={box} className="relative">
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-brand-50 text-brand-800">
              {nameOf(id)}
              {!disabled ? (
                <button type="button" onClick={() => onChange(selected.filter((x) => x !== id))} aria-label={`Hapus ${nameOf(id)}`}>
                  <X className="w-3 h-3" />
                </button>
              ) : null}
            </span>
          ))}
          {!disabled ? (
            <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-brand-700 px-2 py-1">
              <Plus className="w-3 h-3" /> {placeholder}
            </button>
          ) : null}
        </div>
        {open ? (
          <div className="absolute z-20 mt-1 w-full max-w-md bg-white border border-neutral-200 rounded-lg shadow-lg">
            <input
              autoFocus
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                onSearch?.(e.target.value);
              }}
              placeholder={onSearch ? 'Ketik minimal 2 huruf nama / kode' : 'Cari'}
              className="w-full px-3 py-2 text-sm border-b border-neutral-100 outline-none"
            />
            <div className="max-h-64 overflow-y-auto py-1">
              {loading ? (
                <div className="px-3 py-3 text-xs text-neutral-500 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mencari…
                </div>
              ) : shown.length === 0 ? (
                <div className="px-3 py-3 text-xs text-neutral-500">{onSearch && q.trim().length < 2 ? 'Ketik untuk mencari.' : 'Tidak ada yang cocok.'}</div>
              ) : (
                shown.map((o) => {
                  const on = selected.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        names.set(o.id, o.nama);
                        onChange(on ? selected.filter((x) => x !== o.id) : [...selected, o.id]);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-neutral-50 flex items-center gap-2 ${on ? 'text-brand-700' : ''}`}
                    >
                      <input type="checkbox" readOnly checked={on} className="accent-brand-600" />
                      <span className="flex-1 min-w-0 truncate">{o.nama}</span>
                      {o.sub ? <span className="text-[11px] text-neutral-400 truncate max-w-[45%]">{o.sub}</span> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Pencarian jemaat (server, debounce). */
export function useJemaatSearch() {
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const res = useTargets(dq.trim().length >= 2 ? dq.trim() : '');
  const options: TargetOption[] =
    dq.trim().length >= 2 ? (res.data?.jemaat ?? []).map((j) => ({ id: j.id, nama: j.nama, sub: [j.kode, j.cabang].filter(Boolean).join(' · ') })) : [];
  return { setQ, options, loading: res.isFetching && dq.trim().length >= 2 };
}
