'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Gift, ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { CrudPage } from '@/components/crud/crud-page';
import { hadiahResource } from '@/lib/resources/hadiah-config';
import { apiClient } from '@/lib/api-client';

const STATUS = [
  { v: '', l: 'Semua status' },
  { v: 'aktif', l: 'Aktif' },
  { v: 'nonaktif', l: 'Nonaktif' },
];
const STOK = [
  { v: '', l: 'Semua stok' },
  { v: 'tersedia', l: 'Tersedia' },
  { v: 'menipis', l: 'Menipis (< 5)' },
  { v: 'habis', l: 'Habis' },
];

function HadiahInner() {
  const sp = useSearchParams();
  const [cabangId, setCabangId] = useState(sp.get('cabangId') ?? '');
  const [status, setStatus] = useState('');
  const [stok, setStok] = useState('');
  const [minPoint, setMinPoint] = useState('');
  const [maxPoint, setMaxPoint] = useState('');

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () =>
      (await apiClient.get<{ data: { id: string; nama: string }[] }>('/admin/cabang', {
        params: { limit: 100, sortBy: 'nama', sortOrder: 'asc' },
      })).data.data,
    staleTime: 300_000,
  });

  const active = !!(cabangId || status || stok || minPoint || maxPoint);
  const sel = 'h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm';

  const banner = (
    <div className="flex flex-wrap items-center gap-2">
      <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={sel}>
        <option value="">Semua cabang</option>
        {(cabangQ.data ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.nama}
          </option>
        ))}
      </select>
      <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
        {STATUS.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
      <select value={stok} onChange={(e) => setStok(e.target.value)} className={sel}>
        {STOK.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1 text-sm text-neutral-500">
        <input
          type="number"
          min={0}
          value={minPoint}
          onChange={(e) => setMinPoint(e.target.value)}
          placeholder="Point min"
          className={`${sel} w-28`}
        />
        –
        <input
          type="number"
          min={0}
          value={maxPoint}
          onChange={(e) => setMaxPoint(e.target.value)}
          placeholder="Point max"
          className={`${sel} w-28`}
        />
      </div>
      {active ? (
        <button
          onClick={() => {
            setCabangId('');
            setStatus('');
            setStok('');
            setMinPoint('');
            setMaxPoint('');
          }}
          className="inline-flex items-center gap-1 h-9 px-2.5 text-xs text-brand-700 hover:bg-brand-50 rounded-lg"
        >
          <X className="w-3.5 h-3.5" /> Reset filter
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Gift className="w-6 h-6 text-kids-500" /> Katalog Hadiah
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Master data hadiah per cabang. Redeem transaksi + adjust stock live-nya di{' '}
            <Link
              href="https://ckids.eccchurch.global"
              target="_blank"
              className="text-brand-600 hover:underline inline-flex items-center gap-0.5"
            >
              CKids Gift Stall <ExternalLink className="w-3 h-3" />
            </Link>{' '}
            (admin subdomain).
          </p>
        </div>
      </div>

      <CrudPage
        config={hadiahResource}
        // cabangId juga mengisi otomatis form Tambah. status/stok/point bukan
        // field form (dibuang schema saat simpan).
        extraParams={{
          cabangId: cabangId || undefined,
          status: status || undefined,
          stok: stok || undefined,
          minPoint: minPoint || undefined,
          maxPoint: maxPoint || undefined,
        }}
        filterBanner={banner}
      />
    </>
  );
}

export default function HadiahPage() {
  return (
    <Suspense fallback={null}>
      <HadiahInner />
    </Suspense>
  );
}
