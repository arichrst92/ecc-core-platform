'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, BarChart3, Users, Gift, Award } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useCabangStore } from '@/lib/cabang-store';
import { Header, AuthGuard } from '@/components/header';

interface ReportData {
  date: string;
  cabangId: string;
  summary: {
    totalRedeem: number;
    totalPointSpent: number;
    uniqueJemaat: number;
  };
  topHadiah: Array<{ nama: string; count: number }>;
  redeems: Array<{
    id: string;
    processedAt: string;
    pointDeducted: number;
    hadiahNama: string;
    jemaat: { namaLengkap: string; fotoUrl: string | null };
    hadiah: { nama: string; fotoUrl: string | null };
    processedBy: { namaLengkap: string };
  }>;
}

export default function ReportPage() {
  return (
    <AuthGuard>
      <Header />
      <ReportContent />
    </AuthGuard>
  );
}

function ReportContent() {
  const { cabangId, cabangNama } = useCabangStore();

  const q = useQuery({
    queryKey: ['gift-stall', 'report', 'today', cabangId],
    enabled: !!cabangId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const res = await apiClient.get<{ data: ReportData }>(
        `/admin/gift-stall/report/today?cabangId=${cabangId}`,
      );
      return res.data.data;
    },
  });

  if (!cabangId) {
    return <main className="p-8 text-center text-neutral-500">Pilih cabang dulu.</main>;
  }
  if (q.isLoading) {
    return (
      <main className="p-10 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
      </main>
    );
  }
  if (!q.data) return null;

  const { summary, topHadiah, redeems } = q.data;

  return (
    <main className="max-w-6xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" /> Report Hari Ini — {cabangNama}
        </h1>
        <p className="text-sm text-neutral-500">
          {new Date(q.data.date).toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}{' '}
          · auto-refresh 30s
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          icon={Gift}
          label="Total Redeem"
          value={summary.totalRedeem}
          color="kids"
        />
        <SummaryCard
          icon={Award}
          label="Point Spent"
          value={summary.totalPointSpent}
          color="brand"
        />
        <SummaryCard
          icon={Users}
          label="Unique Anak"
          value={summary.uniqueJemaat}
          color="green"
        />
      </div>

      {/* Top hadiah */}
      {topHadiah.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <h2 className="font-semibold text-neutral-900 mb-3">🏆 Top 5 Hadiah Hari Ini</h2>
          <div className="space-y-2">
            {topHadiah.map((h, i) => (
              <div key={h.nama} className="flex items-center gap-2">
                <span className="text-xs font-bold text-neutral-500 w-6">#{i + 1}</span>
                <span className="flex-1 text-sm">{h.nama}</span>
                <span className="bg-kids-100 text-kids-700 px-2 py-0.5 rounded text-xs font-semibold">
                  {h.count}x
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All redeems today */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Transaksi Hari Ini ({redeems.length})</h2>
        </div>
        {redeems.length === 0 ? (
          <div className="p-10 text-center text-neutral-500">
            Belum ada transaksi hari ini.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Waktu</th>
                <th className="text-left px-4 py-2">Anak</th>
                <th className="text-left px-4 py-2">Hadiah</th>
                <th className="text-right px-4 py-2">Point</th>
                <th className="text-left px-4 py-2">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {redeems.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                    {new Date(r.processedAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{r.jemaat.namaLengkap}</td>
                  <td className="px-4 py-2.5">{r.hadiahNama}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-red-600">
                    -{r.pointDeducted.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">
                    {r.processedBy.namaLengkap}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Gift;
  label: string;
  value: number;
  color: 'kids' | 'brand' | 'green';
}) {
  const bg = {
    kids: 'bg-kids-50 border-kids-200 text-kids-700',
    brand: 'bg-brand-50 border-brand-200 text-brand-700',
    green: 'bg-green-50 border-green-200 text-green-700',
  }[color];
  return (
    <div className={`border rounded-xl p-5 ${bg}`}>
      <div className="flex items-center gap-2 text-sm opacity-80">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="text-3xl font-bold mt-2">{value.toLocaleString('id-ID')}</div>
    </div>
  );
}
