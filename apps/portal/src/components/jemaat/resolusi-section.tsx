'use client';

/**
 * Resolusi Tahunan jemaat — read-only di detail jemaat (portal).
 * Diisi jemaat sendiri dari Els App (Home → Resolusi).
 * API: GET /admin/jemaat/:id/resolusi?tahun=
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle, Loader2, Target } from 'lucide-react';
import { RESOLUSI_KATEGORI_LABEL, type ResolusiKategori } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';

interface ResolusiItem {
  id: string;
  judul: string;
  catatan: string | null;
  kategori: string;
  isDone: boolean;
  doneAt: string | null;
}
interface ResolusiData {
  tahun: number;
  years: { tahun: number; total: number }[];
  items: ResolusiItem[];
  progress: { done: number; total: number };
}

const fmt = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

export function ResolusiSection({ jemaatId }: { jemaatId: string }) {
  const thisYear = new Date().getFullYear();
  const [tahun, setTahun] = useState(thisYear);
  const q = useQuery({
    queryKey: ['jemaat', jemaatId, 'resolusi', tahun],
    queryFn: async () =>
      (await apiClient.get<{ data: ResolusiData }>(`/admin/jemaat/${jemaatId}/resolusi`, { params: { tahun } })).data.data,
  });
  const d = q.data;
  const years = Array.from(new Set([...(d?.years ?? []).map((y) => y.tahun), thisYear, tahun])).sort((a, b) => b - a);
  const pct = d && d.progress.total ? Math.round((d.progress.done / d.progress.total) * 100) : 0;

  return (
    <section className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-500" />
            Resolusi Tahunan
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">Diisi jemaat dari Els App. Hanya bisa dilihat di portal.</p>
        </div>
        <select
          value={tahun}
          onChange={(e) => setTahun(Number(e.target.value))}
          className="h-9 px-3 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
              {d?.years.find((x) => x.tahun === y) ? ` (${d.years.find((x) => x.tahun === y)!.total})` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="p-4 sm:p-6">
        {q.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : !d || d.items.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-6">Belum ada resolusi untuk tahun {tahun}.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-sm font-semibold text-neutral-700">
                {d.progress.done}/{d.progress.total} tercapai
              </span>
            </div>
            <ul className="divide-y divide-neutral-100">
              {d.items.map((r) => (
                <li key={r.id} className="py-2.5 flex items-start gap-3">
                  {r.isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  ) : (
                    <Circle className="w-5 h-5 text-neutral-300 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm ${r.isDone ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>{r.judul}</div>
                    {r.catatan ? <div className="text-xs text-neutral-500 mt-0.5 whitespace-pre-line">{r.catatan}</div> : null}
                    {r.isDone && r.doneAt ? <div className="text-[11px] text-green-700 mt-0.5">Tercapai {fmt(r.doneAt)}</div> : null}
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 shrink-0">
                    {RESOLUSI_KATEGORI_LABEL[r.kategori as ResolusiKategori]?.id ?? r.kategori}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
