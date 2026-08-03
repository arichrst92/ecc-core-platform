'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  ClipboardList,
  RefreshCw,
  Users,
  CheckCircle2,
  Clock,
  Baby,
  Search,
  LogOut as LogOutIcon,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useCabangStore } from '@/lib/cabang-store';
import { Header, AuthGuard } from '@/components/header';
import { resolveMediaUrl } from '@/lib/media';

interface HadirItem {
  id: string;
  kode: string;
  joinedAt: string | null;
  checkedOutAt: string | null;
  pickedUpAt: string | null;
  pickupCode: string | null;
  tanggalIbadah: string;
  jemaat: {
    id: string;
    namaLengkap: string;
    fotoUrl: string | null;
    tanggalLahir: string | null;
    kode: string | null;
  };
  ibadah: {
    id: string;
    nama: string;
    jamMulai: string;
    isKidsIbadah: boolean;
    requiresCheckout: boolean;
  };
}

type Filter = 'all' | 'belum-checkout' | 'belum-dijemput';

function calcUmur(tanggalLahir: string | null): number | null {
  if (!tanggalLahir) return null;
  const d = new Date(tanggalLahir);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HadirPage() {
  return (
    <AuthGuard>
      <Header />
      <HadirContent />
    </AuthGuard>
  );
}

function HadirContent() {
  const { cabangId, cabangNama } = useCabangStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: ['hadir', 'today', cabangId],
    enabled: !!cabangId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const res = await apiClient.get<{ data: HadirItem[] }>(
        '/admin/reservasi/today',
        { params: { cabangId } },
      );
      return res.data.data;
    },
  });

  const items = q.data ?? [];

  // Apply filter + search
  const filtered = useMemo(() => {
    let out = items;
    if (filter === 'belum-checkout') {
      out = out.filter((r) => r.ibadah.requiresCheckout && !r.checkedOutAt);
    } else if (filter === 'belum-dijemput') {
      out = out.filter((r) => r.ibadah.isKidsIbadah && !r.pickedUpAt);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.jemaat.namaLengkap.toLowerCase().includes(q) ||
          r.ibadah.nama.toLowerCase().includes(q),
      );
    }
    return out;
  }, [items, filter, search]);

  // Summary counters
  const stats = useMemo(() => {
    const kids = items.filter((r) => r.ibadah.isKidsIbadah).length;
    const belumCheckout = items.filter(
      (r) => r.ibadah.requiresCheckout && !r.checkedOutAt,
    ).length;
    const belumDijemput = items.filter(
      (r) => r.ibadah.isKidsIbadah && !r.pickedUpAt,
    ).length;
    return { total: items.length, kids, belumCheckout, belumDijemput };
  }, [items]);

  if (!cabangId) {
    return (
      <main className="p-8 text-center text-neutral-500">
        Pilih cabang dulu di header.
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5" /> Daftar Hadir Hari Ini
          </h1>
          <p className="text-xs text-neutral-500">
            {cabangNama} · auto-refresh 15s
          </p>
        </div>
        <button
          onClick={() => q.refetch()}
          className="p-2 rounded hover:bg-neutral-100"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${q.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <StatCard
          label="Total Hadir"
          value={stats.total}
          Icon={Users}
          color="bg-blue-50 text-blue-800 border-blue-200"
        />
        <StatCard
          label="Anak"
          value={stats.kids}
          Icon={Baby}
          color="bg-kids-50 text-kids-700 border-kids-200"
        />
        <StatCard
          label="Belum Checkout"
          value={stats.belumCheckout}
          Icon={LogOutIcon}
          color="bg-amber-50 text-amber-800 border-amber-200"
        />
        <StatCard
          label="Belum Dijemput"
          value={stats.belumDijemput}
          Icon={Clock}
          color="bg-red-50 text-red-800 border-red-200"
        />
      </div>

      {/* Filter chips + search */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 mb-3 space-y-2">
        <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / ibadah..."
            className="flex-1 py-2 outline-none bg-transparent"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(
            [
              { value: 'all', label: 'Semua' },
              { value: 'belum-checkout', label: 'Belum Checkout' },
              { value: 'belum-dijemput', label: 'Belum Dijemput' },
            ] as { value: Filter; label: string }[]
          ).map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${
                filter === f.value
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {q.isLoading ? (
        <div className="text-center py-10">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-xl border border-neutral-200 text-neutral-500 text-sm">
          {items.length === 0
            ? 'Belum ada kehadiran hari ini.'
            : `Tidak ada hasil untuk filter "${filter}"${search ? ` + search "${search}"` : ''}.`}
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-neutral-100">
            {filtered.map((r) => (
              <HadirRow key={r.id} r={r} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

// ============================================================
//  Sub-components
// ============================================================

function StatCard({
  label,
  value,
  Icon,
  color,
}: {
  label: string;
  value: number;
  Icon: typeof Users;
  color: string;
}) {
  return (
    <div className={`border rounded-lg p-3 ${color}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-80">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  );
}

function HadirRow({ r }: { r: HadirItem }) {
  const umur = calcUmur(r.jemaat.tanggalLahir);
  const isKids = r.ibadah.isKidsIbadah;
  const needsCheckout = r.ibadah.requiresCheckout;

  return (
    <div className="p-3 sm:p-4 hover:bg-neutral-50">
      <div className="flex items-start gap-3">
        {r.jemaat.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolveMediaUrl(r.jemaat.fotoUrl) ?? ''}
            alt=""
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 font-semibold shrink-0">
            {r.jemaat.namaLengkap.charAt(0)}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-neutral-900 truncate">
              {r.jemaat.namaLengkap}
            </span>
            {umur !== null && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  umur < 18
                    ? 'bg-kids-100 text-kids-700'
                    : 'bg-neutral-100 text-neutral-700'
                }`}
              >
                {umur}th
              </span>
            )}
            {isKids && (
              <span className="bg-kids-100 text-kids-700 text-[10px] px-1.5 rounded">
                🧒
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {r.ibadah.nama} · check-in {formatTime(r.joinedAt)}
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {needsCheckout ? (
              r.checkedOutAt ? (
                <StatusBadge
                  color="green"
                  label={`Checkout ${formatTime(r.checkedOutAt)}`}
                  Icon={CheckCircle2}
                />
              ) : (
                <StatusBadge color="amber" label="Belum checkout" Icon={Clock} />
              )
            ) : null}

            {isKids ? (
              r.pickedUpAt ? (
                <StatusBadge
                  color="green"
                  label={`Dijemput ${formatTime(r.pickedUpAt)}`}
                  Icon={CheckCircle2}
                />
              ) : (
                <StatusBadge
                  color="red"
                  label={
                    r.pickupCode
                      ? `Belum dijemput · ${r.pickupCode}`
                      : 'Belum dijemput'
                  }
                  Icon={Clock}
                />
              )
            ) : null}

            {!needsCheckout && !isKids && (
              <StatusBadge color="green" label="Selesai" Icon={CheckCircle2} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  color,
  label,
  Icon,
}: {
  color: 'green' | 'amber' | 'red';
  label: string;
  Icon: typeof Clock;
}) {
  const cls = {
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
  }[color];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}
    >
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}
