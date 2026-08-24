'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Power,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Save,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { MAINTENANCE_DURATION_PRESETS } from '@ecc/shared-types';

interface MaintenanceMode {
  id: string;
  isEnabled: boolean;
  message: string | null;
  startedAt: string | null;
  estimatedEndAt: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_MESSAGE =
  'Sistem sedang dalam pemeliharaan. Mohon coba kembali sebentar lagi.';

function fmtDuration(ms: number): string {
  if (ms <= 0) return 'Selesai';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}j ${m}m ${s}d`;
  if (m > 0) return `${m}m ${s}d`;
  return `${s}d`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MaintenanceModePage() {
  const qc = useQueryClient();
  const statusQ = useQuery<MaintenanceMode>({
    queryKey: ['maintenance-mode'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: MaintenanceMode }>(
        '/admin/maintenance-mode',
      );
      return res.data.data;
    },
    refetchInterval: 15_000, // poll setiap 15s supaya countdown / state sync
  });

  const status = statusQ.data;

  // Local edit form state
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [durationMinutes, setDurationMinutes] = useState<number | ''>(60);

  // Sync form dengan status saat data datang (kalau aktif, isi message dari server)
  useEffect(() => {
    if (status?.message) setMessage(status.message);
  }, [status?.message]);

  // Live countdown
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!status?.isEnabled || !status.estimatedEndAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status?.isEnabled, status?.estimatedEndAt]);

  const remainingMs =
    status?.isEnabled && status.estimatedEndAt
      ? new Date(status.estimatedEndAt).getTime() - now
      : null;
  const overdue = remainingMs !== null && remainingMs <= 0;

  const enableMut = useMutation({
    mutationFn: async () => {
      await apiClient.put('/admin/maintenance-mode', {
        isEnabled: true,
        message: message.trim() || undefined,
        durationMinutes: typeof durationMinutes === 'number' ? durationMinutes : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Maintenance mode AKTIF');
      qc.invalidateQueries({ queryKey: ['maintenance-mode'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const disableMut = useMutation({
    mutationFn: async () => {
      await apiClient.put('/admin/maintenance-mode', { isEnabled: false });
    },
    onSuccess: () => {
      toast.success('Maintenance mode dimatikan');
      qc.invalidateQueries({ queryKey: ['maintenance-mode'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      // Update message saja tanpa toggle off
      await apiClient.put('/admin/maintenance-mode', {
        isEnabled: true,
        message: message.trim() || undefined,
        durationMinutes: typeof durationMinutes === 'number' ? durationMinutes : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Pesan + durasi diperbarui');
      qc.invalidateQueries({ queryKey: ['maintenance-mode'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <Power className="w-6 h-6" />
          Maintenance Mode
        </h1>
        <p className="text-neutral-500 mt-1">
          Aktifkan flag global untuk paksa mobile app tampilkan full-screen modal "Sedang
          maintenance". Berguna saat deploy/migrate, fix urgent bug, atau test recovery.
        </p>
      </div>

      {statusQ.isLoading && !status ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : !status ? (
        <div className="text-red-600 text-sm">Gagal load status.</div>
      ) : (
        <>
          {/* Status banner */}
          <div
            className={`rounded-xl p-5 mb-5 border ${
              status.isEnabled
                ? 'bg-red-50 border-red-200'
                : 'bg-green-50 border-green-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  status.isEnabled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                }`}
              >
                {status.isEnabled ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-neutral-900">
                  {status.isEnabled ? '🔴 Maintenance AKTIF' : '🟢 Normal (maintenance off)'}
                </div>
                <div className="text-xs text-neutral-600 mt-1">
                  {status.isEnabled
                    ? 'Mobile app saat ini tampilkan modal maintenance ke semua user.'
                    : 'Mobile app berjalan normal. Toggle ON di bawah untuk aktifkan.'}
                </div>
                {status.isEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs">
                    <div>
                      <div className="text-neutral-500 uppercase tracking-wider text-[10px]">Mulai</div>
                      <div className="font-medium text-neutral-900">{fmtDateTime(status.startedAt)}</div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-wider text-[10px]">Perkiraan selesai</div>
                      <div className="font-medium text-neutral-900">
                        {fmtDateTime(status.estimatedEndAt) || 'Tidak di-set'}
                      </div>
                    </div>
                    <div>
                      <div className="text-neutral-500 uppercase tracking-wider text-[10px]">Sisa waktu</div>
                      <div
                        className={`font-mono font-semibold ${
                          overdue ? 'text-amber-700' : 'text-red-700'
                        }`}
                      >
                        {remainingMs === null
                          ? '-'
                          : overdue
                            ? 'Sudah lewat'
                            : fmtDuration(remainingMs)}
                      </div>
                    </div>
                  </div>
                )}
                {overdue && (
                  <div className="mt-2 text-xs text-amber-800 bg-amber-100 px-3 py-1.5 rounded inline-flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Estimasi sudah lewat — mobile auto-treat sebagai off. Jangan lupa matikan
                    flag-nya supaya bersih di audit log.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Pesan ke user
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder={DEFAULT_MESSAGE}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Tampil di modal mobile saat maintenance aktif. Plain text — markdown
                singkat OK (bold/italic). Default kalau kosong: "{DEFAULT_MESSAGE}"
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Durasi estimasi
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {MAINTENANCE_DURATION_PRESETS.map((p) => (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => setDurationMinutes(p.minutes)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                      durationMinutes === p.minutes
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={durationMinutes}
                    onChange={(e) =>
                      setDurationMinutes(e.target.value === '' ? '' : Number(e.target.value))
                    }
                    className="w-20 px-2 py-1.5 border border-neutral-300 rounded-lg text-xs text-center"
                  />
                  <span className="text-xs text-neutral-500">menit</span>
                </div>
              </div>
              <p className="text-xs text-neutral-500 mt-1.5">
                Server compute "perkiraan selesai" = sekarang + durasi. Mobile tampilkan countdown.
                Kosongkan kalau tidak ingin tampil countdown — modal cuma show pesan static.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100">
              {!status.isEnabled ? (
                <button
                  onClick={() => enableMut.mutate()}
                  disabled={enableMut.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {enableMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Power className="w-4 h-4" />
                  )}
                  Aktifkan Maintenance Mode
                </button>
              ) : (
                <>
                  <button
                    onClick={() => updateMut.mutate()}
                    disabled={updateMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
                  >
                    {updateMut.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Update Pesan + Durasi
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Matikan maintenance mode? Mobile akan kembali normal.')) {
                        disableMut.mutate();
                      }
                    }}
                    disabled={disableMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg disabled:opacity-50"
                  >
                    {disableMut.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Matikan Maintenance Mode
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Info card */}
          <div className="mt-5 bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Cara kerja
            </div>
            <ul className="list-disc ml-5 space-y-0.5 text-blue-800">
              <li>Mobile app polling endpoint <code className="bg-blue-100 px-1 rounded">GET /public/maintenance</code> di splash + periodic (rekomendasi setiap 60 detik).</li>
              <li>Kalau <code className="bg-blue-100 px-1 rounded">isEnabled=true</code> → mobile tampil full-screen modal blocking dengan pesan + countdown.</li>
              <li>User tidak bisa skip — wajib tunggu sampai admin matikan atau estimatedEndAt lewat.</li>
              <li>Kalau estimasi sudah lewat tapi flag belum di-off, mobile auto-treat sebagai off (graceful).</li>
              <li>Aktivitas server lain (login, API, dst) tidak otomatis blocked — flag ini cuma sinyal ke mobile.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
