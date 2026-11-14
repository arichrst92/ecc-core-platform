'use client';

/**
 * Modal tambah pelayanan ke Ibadah / Event secara bulk: cari, centang
 * beberapa (atau "Pilih semua"), lalu tautkan sekaligus.
 */
import { useMemo, useState } from 'react';
import { CheckSquare, Loader2, Search, Square, X } from 'lucide-react';
import { PelayananIcon } from '@/components/pelayanan/pelayanan-icon';

export interface BulkPelayananOption {
  id: string;
  nama: string;
  deskripsi?: string | null;
  ikon?: string | null;
  warna?: string | null;
}

export function BulkPelayananPicker({
  title,
  available,
  loading,
  submitting,
  progress,
  onClose,
  onAdd,
  emptyText,
}: {
  title: string;
  available: BulkPelayananOption[];
  loading: boolean;
  submitting: boolean;
  /** Progres saat menautkan, mis. { done: 3, total: 10 }. */
  progress?: { done: number; total: number } | null;
  onClose: () => void;
  onAdd: (pelayananIds: string[]) => void;
  emptyText: string;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return k ? available.filter((p) => p.nama.toLowerCase().includes(k) || (p.deskripsi ?? '').toLowerCase().includes(k)) : available;
  }, [available, q]);
  const allShownSelected = shown.length > 0 && shown.every((p) => sel.has(p.id));

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSel((s) => {
      const n = new Set(s);
      if (allShownSelected) shown.forEach((p) => n.delete(p.id));
      else shown.forEach((p) => n.add(p.id));
      return n;
    });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">{title}</h2>
            <button onClick={onClose} disabled={submitting} className="p-1 rounded hover:bg-neutral-100 disabled:opacity-40">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          <div className="px-6 pt-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari pelayanan…"
                className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={toggleAll}
                disabled={loading || shown.length === 0 || submitting}
                className="inline-flex items-center gap-2 font-medium text-brand-700 hover:text-brand-800 disabled:opacity-40"
              >
                {allShownSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                {allShownSelected ? 'Batalkan semua' : `Pilih semua${q ? ' (hasil cari)' : ''}`}
              </button>
              <span className="text-neutral-500">
                {sel.size} dipilih · {available.length} tersedia
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : available.length === 0 ? (
              <p className="text-sm text-neutral-500 py-8 text-center">{emptyText}</p>
            ) : shown.length === 0 ? (
              <p className="text-sm text-neutral-500 py-8 text-center">Tidak ada pelayanan yang cocok.</p>
            ) : (
              <div className="space-y-1.5">
                {shown.map((p) => {
                  const on = sel.has(p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 cursor-pointer transition ${
                        on ? 'border-brand-300 bg-brand-50/60' : 'border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(p.id)}
                        disabled={submitting}
                        className="w-4 h-4 accent-orange-500 shrink-0"
                      />
                      <PelayananIcon ikon={p.ikon} warna={p.warna} size={18} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-neutral-900 truncate">{p.nama}</span>
                        {p.deskripsi ? <span className="block text-xs text-neutral-500 truncate">{p.deskripsi}</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl">
            <span className="text-xs text-neutral-500">
              {submitting && progress ? `Menautkan ${progress.done}/${progress.total}…` : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={() => onAdd([...sel])}
                disabled={sel.size === 0 || submitting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Tautkan {sel.size > 0 ? `${sel.size} pelayanan` : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Jalankan tautan satu per satu (urut) → ringkasan berhasil / gagal. */
export async function linkAll(
  ids: string[],
  fn: (id: string) => Promise<unknown>,
  onProgress?: (done: number) => void,
): Promise<{ ok: number; failed: { id: string; message: string }[] }> {
  let ok = 0;
  const failed: { id: string; message: string }[] = [];
  for (let i = 0; i < ids.length; i++) {
    try {
      await fn(ids[i]!);
      ok++;
    } catch (e: any) {
      failed.push({ id: ids[i]!, message: e?.response?.data?.error?.message ?? 'Gagal' });
    }
    onProgress?.(i + 1);
  }
  return { ok, failed };
}
