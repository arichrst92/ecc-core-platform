'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Settings,
  RefreshCw,
  Loader2,
  Search,
  ChevronRight,
  Bug,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';

type Tab = 'errors' | 'config';

export default function DiagnosticsPage() {
  const [tab, setTab] = useState<Tab>('errors');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-brand-500" />
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Diagnostics</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              Observability Els App — laporan error dari aplikasi (mobile & web) dan konfigurasi aplikasi.
            </p>
          </div>
        </div>
      </div>

      <div className="border-b border-neutral-200 mb-6">
        <div className="flex gap-1">
          <TabButton active={tab === 'errors'} onClick={() => setTab('errors')} icon={Bug}>
            Error Events
          </TabButton>
          <TabButton active={tab === 'config'} onClick={() => setTab('config')} icon={Settings}>
            App Config
          </TabButton>
        </div>
      </div>

      {tab === 'errors' && <ErrorEventsTab />}
      {tab === 'config' && <AppConfigTab />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Activity;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
        active
          ? 'border-brand-500 text-brand-600'
          : 'border-transparent text-neutral-500 hover:text-neutral-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

// ============================================================
//  Error Events Tab
// ============================================================

interface ErrorGroup {
  fingerprint: string;
  total: number;
  firstSeen: string;
  lastSeen: string;
  userCount: number;
  sampleMessage: string;
  sampleErrorName: string | null;
  type: 'error' | 'message';
  platforms: string[];
  releases: string[];
}

const PERIODS = [
  { value: '1', label: '24 jam terakhir' },
  { value: '7', label: '7 hari terakhir' },
  { value: '30', label: '30 hari terakhir' },
] as const;
const PAGE_SIZE = 20;
const fmtDT = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const errMsg = (e: unknown) =>
  (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
  (e instanceof Error ? e.message : 'Gagal memuat data');

function ErrorEventsTab() {
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput.trim(), 400);
  const [platform, setPlatform] = useState<'all' | 'ios' | 'android' | 'web'>('all');
  const [type, setType] = useState<'all' | 'error' | 'message'>('error');
  const [days, setDays] = useState<'1' | '7' | '30'>('7');
  const [releaseInput, setReleaseInput] = useState('');
  const release = useDebounce(releaseInput.trim(), 400);
  const [page, setPage] = useState(1);
  const [selectedFp, setSelectedFp] = useState<string | null>(null);

  const from = useMemo(() => new Date(Date.now() - Number(days) * 86_400_000).toISOString(), [days]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['diagnostics', 'error-events', search, platform, type, days, release, page],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: { pagination: { totalGroups: number; page: number; limit: number }; groups: ErrorGroup[] };
      }>('/admin/diagnostics/error-events', {
        params: {
          search: search || undefined,
          platform,
          type: type === 'all' ? undefined : type,
          release: release || undefined,
          from,
          page,
          limit: PAGE_SIZE,
        },
      });
      return res.data.data;
    },
    placeholderData: (p) => p,
  });
  const totalPages = data ? Math.max(1, Math.ceil(data.pagination.totalGroups / PAGE_SIZE)) : 1;
  const reset = () => setPage(1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              reset();
            }}
            placeholder="Cari pesan / nama error…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>
        <Select label="Periode" value={days} onChange={(v) => { setDays(v as typeof days); reset(); }}>
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select label="Platform" value={platform} onChange={(v) => { setPlatform(v as typeof platform); reset(); }}>
          <option value="all">Semua</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
          <option value="web">Web</option>
        </Select>
        <Select label="Tipe" value={type} onChange={(v) => { setType(v as typeof type); reset(); }}>
          <option value="error">Error</option>
          <option value="message">Pesan</option>
          <option value="all">Semua</option>
        </Select>
        <input
          type="text"
          value={releaseInput}
          onChange={(e) => {
            setReleaseInput(e.target.value);
            reset();
          }}
          placeholder="Release (mis. 1.4.0+12)"
          className="w-44 px-3 py-1.5 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-brand-500"
        />
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50"
        >
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {isLoading && <LoadingBlock />}
      {isError && !data ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {errMsg(error)}
        </div>
      ) : null}
      {!isLoading && data && (
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 text-sm text-neutral-500">
            {data.pagination.totalGroups.toLocaleString('id-ID')} jenis error unik ·{' '}
            {PERIODS.find((p) => p.value === days)?.label.toLowerCase()} (waktu diterima server)
          </div>
          {data.groups.length === 0 && (
            <div className="p-8 text-center text-neutral-400">Tidak ada laporan di periode ini. Aplikasi sehat 🎉</div>
          )}
          {data.groups.map((g) => (
            <button
              key={g.fingerprint}
              type="button"
              onClick={() => setSelectedFp(g.fingerprint)}
              className="w-full text-left px-5 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {g.type === 'message' ? (
                    <span className="px-2 py-0.5 bg-sky-50 text-sky-700 text-xs font-medium rounded">message</span>
                  ) : null}
                  {g.sampleErrorName && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs font-medium rounded">{g.sampleErrorName}</span>
                  )}
                  <span className="text-xs text-neutral-400 font-mono">{g.fingerprint.slice(0, 8)}</span>
                </div>
                <div className="text-sm text-neutral-900 line-clamp-2">{g.sampleMessage}</div>
                <div className="text-xs text-neutral-500 mt-1 flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-neutral-700">{g.total.toLocaleString('id-ID')}× </span>
                  <span>{g.userCount} pengguna</span>
                  <span>{g.platforms.join(', ')}</span>
                  <span className="font-mono">{g.releases.slice(0, 3).join(', ')}{g.releases.length > 3 ? '…' : ''}</span>
                  <span>terakhir: {fmtDT(g.lastSeen)}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400 mt-2" />
            </button>
          ))}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 text-xs text-neutral-500">
              <span>
                Halaman {page} dari {totalPages}
              </span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">
                  ←
                </button>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedFp && <ErrorDetailModal fingerprint={selectedFp} onClose={() => setSelectedFp(null)} />}
    </div>
  );
}

interface ErrorEvent {
  id: string;
  timestamp: string;
  receivedAt: string;
  type: string;
  release: string;
  platform: string;
  osVersion: string | null;
  appVersion: string | null;
  userNoHp: string | null;
  message: string;
  stack: string | null;
  errorName: string | null;
  context: Record<string, unknown> | null;
  breadcrumbs: unknown[] | null;
}
interface ErrorDetail {
  fingerprint: string;
  total: number;
  shown: number;
  recent: ErrorEvent[];
  trend: { day: string; count: number }[];
  breakdown: { platform: string; release: string; count: number }[];
}

function ErrorDetailModal({ fingerprint, onClose }: { fingerprint: string; onClose: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['diagnostics', 'error-events', fingerprint],
    queryFn: async () => (await apiClient.get<{ data: ErrorDetail }>(`/admin/diagnostics/error-events/${fingerprint}`)).data.data,
  });
  const maxTrend = Math.max(1, ...(data?.trend ?? []).map((t) => t.count));
  const events = data ? (showAll ? data.recent : data.recent.slice(0, 10)) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-semibold">Detail error</h3>
            <p className="text-xs text-neutral-500 font-mono truncate">{fingerprint}</p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
        <div className="p-6 space-y-5">
          {isLoading && <LoadingBlock />}
          {isError ? <div className="text-sm text-red-600">{errMsg(error)}</div> : null}
          {data && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-neutral-200 rounded-lg p-3">
                  <div className="text-2xl font-bold text-neutral-900">{data.total.toLocaleString('id-ID')}</div>
                  <div className="text-xs text-neutral-500">total kejadian (s.d. 30 hari)</div>
                </div>
                <div className="border border-neutral-200 rounded-lg p-3">
                  <div className="text-xs text-neutral-500 mb-1">Platform & release</div>
                  <div className="text-xs text-neutral-800 space-y-0.5">
                    {data.breakdown.slice(0, 5).map((b) => (
                      <div key={`${b.platform}-${b.release}`}>
                        {b.platform} · <span className="font-mono">{b.release}</span> — {b.count}×
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {data.trend.length > 0 && (
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Tren harian (30 hari)</div>
                  <div className="flex items-end gap-1 h-16">
                    {data.trend.map((t) => (
                      <div
                        key={t.day}
                        title={`${new Date(t.day).toLocaleDateString('id-ID')}: ${t.count}×`}
                        className="flex-1 bg-red-400 rounded-t min-w-[4px]"
                        style={{ height: `${(t.count / maxTrend) * 100}%` }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs text-neutral-500 mb-1">
                  Kejadian terbaru ({events.length} dari {data.shown})
                </div>
                <div className="space-y-2">
                  {events.map((e) => (
                    <div key={e.id} className="border border-neutral-200 rounded p-3 text-sm">
                      <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5 flex-wrap">
                        <span>{fmtDT(e.receivedAt)}</span>
                        <span>•</span>
                        <span>
                          {e.platform}
                          {e.osVersion ? ` ${e.osVersion}` : ''}
                        </span>
                        <span>•</span>
                        <span className="font-mono">{e.release}</span>
                        {e.userNoHp ? (
                          <>
                            <span>•</span>
                            <span>{e.userNoHp}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="font-medium text-neutral-900 break-words">{e.message}</div>
                      {e.context && Object.keys(e.context).length > 0 ? (
                        <pre className="mt-1.5 p-2 bg-neutral-50 text-[10px] overflow-x-auto rounded">{JSON.stringify(e.context, null, 2)}</pre>
                      ) : null}
                      {e.stack && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700">Stack trace</summary>
                          <pre className="mt-1 p-2 bg-neutral-50 text-[10px] overflow-x-auto rounded">{e.stack}</pre>
                        </details>
                      )}
                      {Array.isArray(e.breadcrumbs) && e.breadcrumbs.length > 0 && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700">
                            Breadcrumbs ({e.breadcrumbs.length})
                          </summary>
                          <pre className="mt-1 p-2 bg-neutral-50 text-[10px] overflow-x-auto rounded">
                            {JSON.stringify(e.breadcrumbs, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
                {data.recent.length > 10 && !showAll ? (
                  <button onClick={() => setShowAll(true)} className="mt-2 text-xs text-brand-600 hover:underline">
                    Tampilkan semua ({data.recent.length})
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  App Config Tab
// ============================================================

interface AppConfig {
  faceMatchThreshold: number;
  lowConfidenceWarnThreshold: number;
  telemetrySamplingRate: number;
  errorReportingEnabled: boolean;
  updatedAt?: string;
}
// Face threshold tidak ditampilkan — login wajah sudah tidak dipakai di app.
const CONFIG_KEYS = ['errorReportingEnabled', 'telemetrySamplingRate'] as const;

function AppConfigTab() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['diagnostics', 'app-config'],
    queryFn: async () => (await apiClient.get<{ data: AppConfig }>('/admin/diagnostics/app-config')).data.data,
  });

  const [form, setForm] = useState<AppConfig | null>(null);
  const formData = form ?? data ?? null;

  const update = useMutation({
    mutationFn: async (patch: Partial<AppConfig>) => (await apiClient.patch('/admin/diagnostics/app-config', patch)).data.data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnostics', 'app-config'] });
      setForm(null);
    },
  });

  if (isError) return <div className="text-sm text-red-600">{errMsg(error)}</div>;
  if (isLoading || !formData) return <LoadingBlock />;

  const changed = form && data ? CONFIG_KEYS.filter((k) => form[k] !== data[k]) : [];
  const isDirty = changed.length > 0;
  const valid = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;
  const allValid = valid(formData.telemetrySamplingRate);

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        Config ini dibaca aplikasi mobile saat dibuka (cache ±1 jam), jadi perubahan tidak langsung berlaku di semua HP.
        {data?.updatedAt ? <div className="text-xs mt-1">Terakhir diubah: {fmtDT(data.updatedAt)}</div> : null}
      </div>

      <ConfigField
        label="Error reporting aktif"
        hint="Kill switch saat insiden. Kalau mati, server membuang semua laporan error dari aplikasi tanpa menyimpan."
        type="boolean"
        value={formData.errorReportingEnabled}
        onChange={(v) => setForm({ ...formData, errorReportingEnabled: v as boolean })}
      />
      <ConfigField
        label="Telemetry sampling rate"
        hint="Porsi sesi aplikasi yang mengirim telemetry (0–1). 1 = semua, 0.1 = 10%."
        type="number"
        min={0}
        max={1}
        step={0.05}
        value={formData.telemetrySamplingRate}
        onChange={(v) => setForm({ ...formData, telemetrySamplingRate: v as number })}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (!form) return;
            const patch: Partial<AppConfig> = {};
            for (const k of changed) (patch as Record<string, unknown>)[k] = form[k];
            update.mutate(patch);
          }}
          disabled={!isDirty || !allValid || update.isPending}
          className="px-4 py-2 bg-brand-500 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-brand-600 transition"
        >
          {update.isPending ? 'Menyimpan…' : 'Simpan perubahan'}
        </button>
        {isDirty && (
          <button type="button" onClick={() => setForm(null)} className="px-4 py-2 text-neutral-500 hover:text-neutral-700">
            Batal
          </button>
        )}
        {!allValid ? <span className="text-sm text-red-600">Nilai harus antara 0 dan 1.</span> : null}
        {update.isError ? <span className="text-sm text-red-600">{errMsg(update.error)}</span> : null}
        {update.isSuccess && !isDirty && <span className="text-sm text-green-600">Tersimpan ✓</span>}
      </div>
    </div>
  );
}

function ConfigField({
  label,
  hint,
  type,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  hint?: string;
  type: 'number' | 'boolean';
  value: number | boolean;
  onChange: (v: number | boolean) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <label className="block text-sm font-medium text-neutral-900">{label}</label>
          {hint && <p className="text-xs text-neutral-500 mt-1">{hint}</p>}
        </div>
        <div>
          {type === 'number' && (
            <input
              type="number"
              value={value as number}
              onChange={(e) => onChange(parseFloat(e.target.value))}
              min={min}
              max={max}
              step={step}
              className="w-24 px-3 py-1.5 text-sm border border-neutral-200 rounded text-right focus:outline-none focus:border-brand-500"
            />
          )}
          {type === 'boolean' && (
            <button
              type="button"
              onClick={() => onChange(!value)}
              className={`w-11 h-6 rounded-full transition ${value ? 'bg-brand-500' : 'bg-neutral-300'}`}
            >
              <span
                className={`block w-5 h-5 bg-white rounded-full transition transform ${
                  value ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Shared utility components
// ============================================================

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-neutral-500">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-2 py-1 border border-neutral-200 rounded focus:outline-none focus:border-brand-500"
      >
        {children}
      </select>
    </label>
  );
}

function LoadingBlock() {
  return (
    <div className="flex items-center justify-center py-12 text-neutral-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}
