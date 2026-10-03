'use client';

/**
 * Jemaat Duplicate Scanner.
 *
 * Scan 3 strategi:
 *   - noHp sama (ignore null)
 *   - email sama (ignore null)
 *   - namaLengkap + tanggalLahir sama
 *
 * Setiap group tampilkan jemaat yg redudant + Last Login, dgn action:
 *   - View (buka detail jemaat baru tab)
 *   - Deactivate (set isActive=false)
 *   - Delete (hard delete, confirm dulu)
 */
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Copy,
  ArrowLeft,
  ExternalLink,
  Phone,
  Mail,
  CalendarDays,
  Power,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type Strategy = 'noHp' | 'email' | 'nameAndDob';

interface DupJemaat {
  id: string;
  kode: string | null;
  namaLengkap: string;
  noHp: string | null;
  email: string | null;
  tanggalLahir: string | null;
  jenisKelamin: 'L' | 'P' | null;
  isActive: boolean;
  createdAt: string;
  cabang: { id: string; nama: string } | null;
  user: { lastLoginAt: string | null } | null;
}

interface DupGroup {
  strategy: Strategy;
  value: string;
  jemaats: DupJemaat[];
}

interface DupResponse {
  groups: DupGroup[];
  summary: { total: number; byNoHp: number; byEmail: number; byNameAndDob: number };
}

const STRATEGY_LABEL: Record<Strategy, string> = {
  noHp: 'No HP sama',
  email: 'Email sama',
  nameAndDob: 'Nama + Tanggal Lahir sama',
};

const STRATEGY_ICON: Record<Strategy, typeof Phone> = {
  noHp: Phone,
  email: Mail,
  nameAndDob: CalendarDays,
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'Belum pernah login';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return '';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}h lalu`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}bln lalu`;
  return `${Math.floor(day / 365)}thn lalu`;
}

export default function JemaatDuplicatesPage() {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['jemaat', 'duplicates'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: DupResponse }>('/admin/jemaat/duplicates');
      return res.data.data;
    },
  });

  const deactivateMut = useMutation({
    mutationFn: async (id: string) => apiClient.patch(`/admin/jemaat/${id}`, { isActive: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jemaat', 'duplicates'] });
      toast.success('Jemaat di-nonaktifkan');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal nonaktifkan'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/jemaat/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jemaat', 'duplicates'] });
      toast.success('Jemaat dihapus');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal hapus'),
  });

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/jemaat"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700 mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke daftar jemaat
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <Copy className="w-6 h-6 text-amber-600" />
          Cek Duplikat Jemaat
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Scan jemaat yang ter-duplikat berdasarkan No HP, Email, atau Nama+Tanggal Lahir.
        </p>
      </div>

      {q.isLoading && <p className="text-sm text-neutral-500">Scanning…</p>}
      {q.isError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          Gagal memuat data. Coba refresh.
        </div>
      )}

      {q.data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Total Grup" count={q.data.summary.total} color="neutral" />
            <SummaryCard label="No HP sama" count={q.data.summary.byNoHp} color="blue" />
            <SummaryCard label="Email sama" count={q.data.summary.byEmail} color="purple" />
            <SummaryCard label="Nama + DOB sama" count={q.data.summary.byNameAndDob} color="emerald" />
          </div>

          {q.data.groups.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-800">
                Tidak ada duplikat ditemukan 🎉
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {q.data.groups.map((g, i) => {
                const Icon = STRATEGY_ICON[g.strategy];
                return (
                  <div
                    key={`${g.strategy}-${i}`}
                    className="bg-white border border-neutral-200 rounded-xl overflow-hidden"
                  >
                    <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-900">
                          {STRATEGY_LABEL[g.strategy]}
                        </p>
                        <p className="text-sm text-neutral-700 truncate flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-neutral-500" />
                          <span className="font-mono">{g.value}</span>
                        </p>
                      </div>
                      <span className="text-xs bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-medium">
                        {g.jemaats.length} jemaat
                      </span>
                    </div>
                    <div className="divide-y divide-neutral-100">
                      {g.jemaats.map((j) => (
                        <div key={j.id} className="px-4 py-3 flex items-center gap-3 hover:bg-neutral-50">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/dashboard/jemaat/${j.id}`}
                                target="_blank"
                                className="font-medium text-neutral-900 hover:text-brand-600 truncate"
                              >
                                {j.namaLengkap}
                              </Link>
                              {!j.isActive && (
                                <span className="text-[10px] bg-neutral-200 text-neutral-600 px-1.5 py-0.5 rounded">
                                  Nonaktif
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-neutral-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                              {j.kode && <span>#{j.kode}</span>}
                              {j.noHp && <span>{j.noHp}</span>}
                              {j.email && <span>{j.email}</span>}
                              {j.cabang && <span>📍 {j.cabang.nama}</span>}
                              <span
                                className={
                                  j.user?.lastLoginAt
                                    ? 'text-neutral-500'
                                    : 'text-red-600 font-medium'
                                }
                                title={
                                  j.user?.lastLoginAt
                                    ? new Date(j.user.lastLoginAt).toLocaleString('id-ID')
                                    : undefined
                                }
                              >
                                🕐 {formatRelative(j.user?.lastLoginAt)}
                              </span>
                              <span className="text-neutral-400">
                                Dibuat {new Date(j.createdAt).toLocaleDateString('id-ID')}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Link
                              href={`/dashboard/jemaat/${j.id}`}
                              target="_blank"
                              className="p-1.5 text-neutral-600 hover:text-brand-600 hover:bg-brand-50 rounded"
                              title="Buka detail (new tab)"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                            {j.isActive && (
                              <button
                                onClick={() => {
                                  if (confirm(`Nonaktifkan ${j.namaLengkap}?`)) {
                                    deactivateMut.mutate(j.id);
                                  }
                                }}
                                className="p-1.5 text-neutral-600 hover:text-amber-700 hover:bg-amber-50 rounded"
                                title="Nonaktifkan"
                              >
                                <Power className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (
                                  confirm(
                                    `HAPUS PERMANEN ${j.namaLengkap}? Aksi ini tidak bisa di-undo.`,
                                  )
                                ) {
                                  deleteMut.mutate(j.id);
                                }
                              }}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                              title="Hapus permanen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: 'neutral' | 'blue' | 'purple' | 'emerald';
}) {
  const colors = {
    neutral: 'bg-neutral-50 border-neutral-200 text-neutral-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  };
  return (
    <div className={`border rounded-lg p-3 ${colors[color]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{count}</p>
    </div>
  );
}
