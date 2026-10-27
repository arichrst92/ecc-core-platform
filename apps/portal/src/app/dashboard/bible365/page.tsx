'use client';

/**
 * Bible 365 — statistik program baca Alkitab 365 hari dari Els App.
 * Hanya angka agregat: catatan renungan jemaat bersifat pribadi dan tidak
 * pernah tampil di portal.
 * API: GET /admin/bible365/stats?cabangId=
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useCabangOptions } from '@/components/report/report-ui';

interface Stats {
  totalPeserta: number;
  aktif: number;
  selesai: number;
  dihentikan: number;
  aktif7Hari: number;
  sesuaiJadwal: number;
  rataProgres: number;
  distribusi: { label: string; n: number }[];
  perCabang: { cabangId: string; nama: string; aktif: number; selesai: number; sesuaiJadwal: number; rataProgres: number }[];
  pesertaBaruPerBulan: { bulan: string; n: number }[];
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const labelBulan = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${BULAN[Number(m) - 1] ?? m} ${y?.slice(2)}`;
};

export default function Bible365Page() {
  const [cabangId, setCabangId] = useState('');
  const cabangQ = useCabangOptions();
  const q = useQuery({
    queryKey: ['bible365', 'stats', cabangId],
    queryFn: async () =>
      (await apiClient.get<{ data: Stats }>('/admin/bible365/stats', { params: { cabangId: cabangId || undefined } })).data.data,
  });
  const s = q.data;
  const maxDist = Math.max(1, ...(s?.distribusi.map((d) => d.n) ?? [1]));
  const maxBulan = Math.max(1, ...(s?.pesertaBaruPerBulan.map((d) => d.n) ?? [1]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Bible 365</h1>
            <p className="text-sm text-neutral-500">Program baca Alkitab 365 hari dari Els App. Catatan renungan jemaat bersifat pribadi.</p>
          </div>
        </div>
        <select
          value={cabangId}
          onChange={(e) => setCabangId(e.target.value)}
          className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm"
        >
          <option value="">Semua cabang</option>
          {(cabangQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>
      </div>

      {q.isPending ? (
        <div className="flex items-center gap-2 text-sm text-neutral-500 py-16 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat statistik…
        </div>
      ) : q.isError || !s ? (
        <div className="text-sm text-red-600 py-16 text-center">Gagal memuat statistik. Coba muat ulang.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              ['Peserta aktif', s.aktif],
              ['Aktif 7 hari terakhir', s.aktif7Hari],
              ['Sesuai jadwal', s.sesuaiJadwal],
              ['Rata-rata progres', `${s.rataProgres}%`],
              ['Sudah selesai', s.selesai],
            ].map(([label, val]) => (
              <div key={label as string} className="rounded-xl bg-white border border-neutral-200 p-4">
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="text-2xl font-bold text-neutral-900 mt-1">{val}</div>
              </div>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white border border-neutral-200 p-4">
              <div className="text-sm font-semibold text-neutral-900 mb-3">Sebaran progres</div>
              <div className="space-y-2">
                {s.distribusi.map((d) => (
                  <div key={d.label} className="flex items-center gap-3 text-sm">
                    <div className="w-16 text-neutral-500">{d.label}</div>
                    <div className="flex-1 h-3 rounded-full bg-neutral-100 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(d.n / maxDist) * 100}%` }} />
                    </div>
                    <div className="w-10 text-right font-medium text-neutral-800">{d.n}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-neutral-400 mt-3">
                Total {s.totalPeserta} putaran dimulai · {s.dihentikan} dihentikan. &ldquo;Sesuai jadwal&rdquo; = sudah membaca ≥ 90% target sampai hari ini.
              </p>
            </div>

            <div className="rounded-xl bg-white border border-neutral-200 p-4">
              <div className="text-sm font-semibold text-neutral-900 mb-3">Peserta baru per bulan</div>
              {s.pesertaBaruPerBulan.length === 0 ? (
                <div className="text-sm text-neutral-400 py-8 text-center">Belum ada peserta.</div>
              ) : (
                <div className="flex items-end gap-2 h-36">
                  {s.pesertaBaruPerBulan.map((m) => (
                    <div key={m.bulan} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs font-medium text-neutral-700">{m.n}</div>
                      <div className="w-full rounded-t-md bg-brand-500" style={{ height: `${Math.max(4, (m.n / maxBulan) * 100)}px` }} />
                      <div className="text-[11px] text-neutral-500">{labelBulan(m.bulan)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 text-sm font-semibold text-neutral-900 border-b border-neutral-100">Per cabang</div>
            {s.perCabang.length === 0 ? (
              <div className="text-sm text-neutral-400 py-10 text-center">Belum ada jemaat yang memulai Bible 365.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 text-xs">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Cabang</th>
                    <th className="text-right font-medium px-4 py-2">Aktif</th>
                    <th className="text-right font-medium px-4 py-2">Sesuai jadwal</th>
                    <th className="text-right font-medium px-4 py-2">Rata-rata progres</th>
                    <th className="text-right font-medium px-4 py-2">Selesai</th>
                  </tr>
                </thead>
                <tbody>
                  {s.perCabang.map((r) => (
                    <tr key={r.cabangId} className="border-t border-neutral-100">
                      <td className="px-4 py-2 text-neutral-900">{r.nama}</td>
                      <td className="px-4 py-2 text-right">{r.aktif}</td>
                      <td className="px-4 py-2 text-right">{r.sesuaiJadwal}</td>
                      <td className="px-4 py-2 text-right">{r.rataProgres}%</td>
                      <td className="px-4 py-2 text-right">{r.selesai}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
