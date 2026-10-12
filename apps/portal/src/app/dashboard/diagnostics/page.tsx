'use client';

import { useState } from 'react';
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
              Observability mobile app — runtime errors dan app config.
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
  platforms: string[];
  releases: string[];
}

function ErrorEventsTab() {
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState<'all' | 'ios' | 'android'>('all');
  const [selectedFp, setSelectedFp] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['diagnostics', 'error-events', search, platform],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: { pagination: { totalGroups: number }; groups: ErrorGroup[] };
      }>('/admin/diagnostics/error-events', {
        params: { search: search || undefined, platform },
      });
      return res.data.data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari di error message..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:border-brand-500"
          />
        </div>
        <Select label="Platform" value={platform} onChange={(v) => setPlatform(v as typeof platform)}>
          <option value="all">All</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
        </Select>
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
      {!isLoading && data && (
        <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 text-sm text-neutral-500">
            {data.pagination.totalGroups.toLocaleString()} unique errors (last 7 days)
          </div>
          {data.groups.length === 0 && (
            <div className="p-8 text-center text-neutral-400">
              Tidak ada error report. Mobile app sehat 🎉
            </div>
          )}
          {data.groups.map((g) => (
            <button
              key={g.fingerprint}
              type="button"
              onClick={() => setSelectedFp(g.fingerprint)}
              className="w-full text-left px-5 py-3 border-b border-neutral-100 hover:bg-neutral-50 transition flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {g.sampleErrorName && (
                    <span className="px-2 py-0.5 bg-red-50 text-red-700 text-xs font-medium rounded">
                      {g.sampleErrorName}
                    </span>
                  )}
                  <span className="text-xs text-neutral-400 font-mono">{g.fingerprint.slice(0, 8)}</span>
                </div>
                <div className="text-sm text-neutral-900 truncate">{g.sampleMessage}</div>
                <div className="text-xs text-neutral-500 mt-1 flex items-center gap-3">
                  <span>{g.total.toLocaleString()} events</span>
                  <span>{g.userCount} users</span>
                  <span>{g.platforms.join(', ')}</span>
                  <span>last: {new Date(g.lastSeen).toLocaleString('id-ID')}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400 mt-2" />
            </button>
          ))}
        </div>
      )}

      {selectedFp && (
        <ErrorDetailModal fingerprint={selectedFp} onClose={() => setSelectedFp(null)} />
      )}
    </div>
  );
}

function ErrorDetailModal({ fingerprint, onClose }: { fingerprint: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['diagnostics', 'error-events', fingerprint],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/diagnostics/error-events/${fingerprint}`);
      return res.data.data;
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Error Detail</h3>
            <p className="text-xs text-neutral-500 font-mono">{fingerprint}</p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
        <div className="p-6 space-y-4">
          {isLoading && <LoadingBlock />}
          {!isLoading && data && (
            <>
              <div>
                <div className="text-xs text-neutral-500 mb-1">Recent occurrences ({data.recent.length})</div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {data.recent.slice(0, 10).map((e: { id: string; timestamp: string; release: string; platform: string; message: string; stack?: string; breadcrumbs?: unknown[] }) => (
                    <div key={e.id} className="border border-neutral-200 rounded p-3 text-sm">
                      <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1.5">
                        <span>{new Date(e.timestamp).toLocaleString('id-ID')}</span>
                        <span>•</span>
                        <span>{e.platform}</span>
                        <span>•</span>
                        <span className="font-mono">{e.release}</span>
                      </div>
                      <div className="font-medium text-neutral-900">{e.message}</div>
                      {e.stack && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-700">
                            Stack trace
                          </summary>
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
  errorReportingEnabled: boolean;
}

function AppConfigTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['diagnostics', 'app-config'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AppConfig }>('/admin/diagnostics/app-config');
      return res.data.data;
    },
  });

  const [form, setForm] = useState<AppConfig | null>(null);
  const formData = form ?? data ?? null;

  const update = useMutation({
    mutationFn: async (patch: Partial<AppConfig>) => {
      const res = await apiClient.patch('/admin/diagnostics/app-config', patch);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diagnostics', 'app-config'] });
      setForm(null);
    },
  });

  if (isLoading || !formData) return <LoadingBlock />;

  const isDirty =
    form !== null &&
    data !== undefined &&
    form.errorReportingEnabled !== data.errorReportingEnabled;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        Config ini di-expose ke mobile via <code className="font-mono">GET /public/app-config</code>.
        Mobile fetch saat splash + cache 1 jam. Perubahan disini akan ke-pickup di splash berikutnya
        (tidak instant). Untuk force update segera, mobile harus invalidate cache local.
      </div>

      <ConfigField
        label="Error Reporting Enabled"
        hint="Kill switch saat incident. Kalau false, BE drop semua POST /diagnostics/error tanpa write DB."
        type="boolean"
        value={formData.errorReportingEnabled}
        onChange={(v) => setForm({ ...formData, errorReportingEnabled: v as boolean })}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => form && update.mutate({ errorReportingEnabled: form.errorReportingEnabled })}
          disabled={!isDirty || update.isPending}
          className="px-4 py-2 bg-brand-500 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-brand-600 transition"
        >
          {update.isPending ? 'Saving...' : 'Save Changes'}
        </button>
        {isDirty && (
          <button
            type="button"
            onClick={() => setForm(null)}
            className="px-4 py-2 text-neutral-500 hover:text-neutral-700"
          >
            Cancel
          </button>
        )}
        {update.isSuccess && !isDirty && (
          <span className="text-sm text-green-600">Saved ✓</span>
        )}
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
