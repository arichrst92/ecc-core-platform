'use client';

/**
 * Ulasan jemaat (rating 1–5 + komentar) — dipakai di detail ibadah & event
 * serta halaman laporan ibadah/event.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, MessageSquareQuote, Star } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export interface ReviewSummary {
  count: number;
  avg: number | null;
  dist: number[]; // index 0 = 1★
  withComment: number;
}
export interface ReviewItem {
  id: string;
  rating: number;
  komentar: string | null;
  nama: string;
  isAnonim: boolean;
  tanggal: string | null;
  createdAt: string;
  label?: string;
}

export function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  const v = Math.round(value ?? 0);
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((k) => (
        <Star key={k} style={{ width: size, height: size }} className={k <= v ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'} />
      ))}
    </span>
  );
}

export function ReviewSummaryBlock({ s }: { s: ReviewSummary }) {
  const max = Math.max(1, ...s.dist);
  return (
    <div className="flex flex-col sm:flex-row gap-6 sm:items-center">
      <div className="text-center min-w-[120px]">
        <div className="text-4xl font-extrabold text-brand-700 leading-none">{s.avg ?? '—'}</div>
        <div className="mt-1"><Stars value={s.avg} /></div>
        <div className="text-xs text-neutral-500 mt-1">{s.count} ulasan · {s.withComment} komentar</div>
      </div>
      <div className="flex-1 space-y-1">
        {[5, 4, 3, 2, 1].map((k) => {
          const c = s.dist[k - 1] ?? 0;
          return (
            <div key={k} className="flex items-center gap-2 text-xs">
              <span className="w-6 text-neutral-600">{k}★</span>
              <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${(c / max) * 100}%` }} />
              </div>
              <span className="w-8 text-right text-neutral-600 tabular-nums">{c}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReviewList({ items, showLabel }: { items: ReviewItem[]; showLabel?: boolean }) {
  const [filter, setFilter] = useState<number | 'komentar' | null>('komentar');
  const shown = items.filter((r) => (filter === 'komentar' ? !!r.komentar?.trim() : filter ? r.rating === filter : true));
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {([['komentar', 'Dengan komentar'], [null, 'Semua'], [5, '5★'], [4, '4★'], [3, '3★'], [2, '2★'], [1, '1★']] as const).map(([v, l]) => (
          <button
            key={String(v)}
            onClick={() => setFilter(v)}
            className={`px-2.5 py-1 text-xs rounded-full border ${filter === v ? 'bg-brand-500 text-white border-brand-500' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-neutral-400">Tidak ada ulasan untuk filter ini.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {shown.map((r) => (
            <li key={r.id} className="py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                <Stars value={r.rating} size={12} />
                <span className="font-medium text-neutral-700">{r.nama}</span>
                {showLabel && r.label ? <span>· {r.label}</span> : null}
                {r.tanggal ? <span>· {new Date(r.tanggal).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span> : null}
              </div>
              {r.komentar ? <p className="text-sm text-neutral-800 mt-1 whitespace-pre-line">{r.komentar}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Kartu ulasan di halaman detail ibadah / event (fetch sendiri). */
export function ReviewPanel({ kind, id }: { kind: 'ibadah' | 'event'; id: string }) {
  const [days, setDays] = useState(90);
  const q = useQuery({
    queryKey: ['reviews', kind, id, days],
    queryFn: async () => {
      const qs = kind === 'ibadah' ? `?from=${new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)}` : '';
      return (await apiClient.get<{ data: { summary: ReviewSummary; items: ReviewItem[]; perTanggal?: (ReviewSummary & { tanggal: string })[] } }>(`/admin/reviews/${kind}/${id}${qs}`)).data.data;
    },
  });
  return (
    <section className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-b border-neutral-100">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <MessageSquareQuote className="w-4 h-4" />
            Ulasan Jemaat
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">Dari tiket reservasi — bisa diberikan sejak acara dimulai sampai 14 hari setelah selesai.</p>
        </div>
        {kind === 'ibadah' && (
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="text-xs border border-neutral-300 rounded-lg px-2 py-1.5">
            <option value={30}>30 hari terakhir</option>
            <option value={90}>90 hari terakhir</option>
            <option value={365}>1 tahun terakhir</option>
          </select>
        )}
      </div>
      <div className="p-6">
        {q.isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>
        ) : !q.data || q.data.summary.count === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada ulasan.</p>
        ) : (
          <div className="space-y-6">
            <ReviewSummaryBlock s={q.data.summary} />
            {q.data.perTanggal && q.data.perTanggal.length > 1 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-neutral-500 uppercase"><tr><th className="text-left py-1.5">Tanggal</th><th className="text-right">Ulasan</th><th className="text-right">Rata-rata</th><th /></tr></thead>
                  <tbody>
                    {q.data.perTanggal.map((p) => (
                      <tr key={p.tanggal} className="border-t border-neutral-100">
                        <td className="py-1.5">{new Date(p.tanggal).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        <td className="text-right tabular-nums">{p.count}</td>
                        <td className="text-right font-semibold tabular-nums">{p.avg}</td>
                        <td className="pl-3"><Stars value={p.avg} size={12} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ReviewList items={q.data.items} />
          </div>
        )}
      </div>
    </section>
  );
}

/** Kartu ulasan di halaman laporan (data dari endpoint laporan). */
export function ReviewReportCard({
  data,
  itemHeader,
}: {
  data: { overall: ReviewSummary; perItem: (ReviewSummary & { key: string; label: string })[]; comments: ReviewItem[] } | undefined;
  itemHeader: string;
}) {
  if (!data) return null;
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <h3 className="font-semibold text-neutral-900 flex items-center gap-2 mb-4">
        <MessageSquareQuote className="w-4 h-4" /> Ulasan Jemaat
      </h3>
      {data.overall.count === 0 ? (
        <p className="text-sm text-neutral-400">Belum ada ulasan di periode ini.</p>
      ) : (
        <div className="space-y-5">
          <ReviewSummaryBlock s={data.overall} />
          {data.perItem.length > 1 && (
            <table className="w-full text-sm">
              <thead className="text-xs text-neutral-500 uppercase"><tr><th className="text-left py-1.5">{itemHeader}</th><th className="text-right">Ulasan</th><th className="text-right">Rata-rata</th><th /></tr></thead>
              <tbody>
                {[...data.perItem].sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0)).map((p) => (
                  <tr key={p.key} className="border-t border-neutral-100">
                    <td className="py-1.5">{p.label}</td>
                    <td className="text-right tabular-nums">{p.count}</td>
                    <td className="text-right font-semibold tabular-nums">{p.avg}</td>
                    <td className="pl-3"><Stars value={p.avg} size={12} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ReviewList items={data.comments} showLabel />
        </div>
      )}
    </div>
  );
}
