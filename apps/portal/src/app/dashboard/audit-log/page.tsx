'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Loader2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';

type ActionKey = 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT' | 'ENROLL_FACE' | 'RESET_FACE' | 'UPLOAD_PHOTO';

interface AuditEntry {
  id: string;
  action: ActionKey;
  resource: string;
  resourceId: string | null;
  resourceLabel: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  userDisplay: { namaLengkap: string; noHp: string | null; fotoUrl: string | null } | null;
}

interface Filters {
  action?: ActionKey;
  resource?: string;
  from?: string;
  to?: string;
  search?: string;
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Filters>({});
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<AuditEntry | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const list = useQuery({
    queryKey: ['audit-log', page, filters, debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (filters.action) params.action = filters.action;
      if (filters.resource) params.resource = filters.resource;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await apiClient.get('/admin/audit-log', { params });
      return res.data as { data: AuditEntry[]; meta: { page: number; limit: number; total: number; totalPages: number } };
    },
    placeholderData: (prev) => prev,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Activity className="w-6 h-6" />
            Audit Log
          </h1>
          <p className="text-neutral-500 mt-1">
            Catatan semua operasi penting — siapa, kapan, apa.
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Cari</label>
          <input
            type="text"
            placeholder="Nama user / label resource..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <FilterSelect
          label="Action"
          value={filters.action ?? ''}
          onChange={(v) => {
            setFilters((f) => ({ ...f, action: (v || undefined) as ActionKey | undefined }));
            setPage(1);
          }}
          options={[
            { value: 'CREATE', label: 'Create' },
            { value: 'UPDATE', label: 'Update' },
            { value: 'DELETE', label: 'Delete' },
            { value: 'LOGIN', label: 'Login' },
            { value: 'LOGOUT', label: 'Logout' },
            { value: 'ENROLL_FACE', label: 'Enroll Face' },
            { value: 'RESET_FACE', label: 'Reset Face' },
            { value: 'UPLOAD_PHOTO', label: 'Upload Photo' },
          ]}
        />
        <FilterSelect
          label="Resource"
          value={filters.resource ?? ''}
          onChange={(v) => {
            setFilters((f) => ({ ...f, resource: v || undefined }));
            setPage(1);
          }}
          options={[
            { value: 'sinode', label: 'Sinode' },
            { value: 'cabang_gereja', label: 'Cabang' },
            { value: 'jemaat', label: 'Jemaat' },
            { value: 'role', label: 'Role' },
            { value: 'sub_role', label: 'Sub Role' },
            { value: 'sub_role_status', label: 'Sub Role Status' },
            { value: 'jemaat_role', label: 'Jemaat Role' },
            { value: 'ibadah', label: 'Ibadah' },
            { value: 'kategori_ibadah', label: 'Kategori Ibadah' },
            { value: 'tipe_relasi_keluarga', label: 'Tipe Relasi' },
            { value: 'jemaat_relasi', label: 'Jemaat Relasi' },
            { value: 'auth', label: 'Auth' },
            { value: 'user', label: 'User' },
          ]}
        />
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Dari</label>
          <input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Sampai</label>
          <input
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {Object.values(filters).some(Boolean) && (
          <button
            onClick={() => {
              setFilters({});
              setSearch('');
              setPage(1);
            }}
            className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1.5"
          >
            <X className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left font-medium" style={{ width: '170px' }}>Waktu</th>
                <th className="px-4 py-3 text-left font-medium" style={{ width: '200px' }}>User</th>
                <th className="px-4 py-3 text-left font-medium" style={{ width: '120px' }}>Action</th>
                <th className="px-4 py-3 text-left font-medium" style={{ width: '160px' }}>Resource</th>
                <th className="px-4 py-3 text-left font-medium">Target</th>
                <th className="px-4 py-3 text-right font-medium" style={{ width: '60px' }}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {list.isLoading && !list.data ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                    <Loader2 className="w-5 h-5 mx-auto animate-spin" />
                  </td>
                </tr>
              ) : list.data?.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                    <Filter className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    Tidak ada log yang cocok dengan filter
                  </td>
                </tr>
              ) : (
                list.data?.data.map((entry) => (
                  <tr key={entry.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-neutral-500 whitespace-nowrap text-xs">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <UserCell user={entry.userDisplay} />
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      <code className="text-xs">{entry.resource}</code>
                    </td>
                    <td className="px-4 py-3 text-neutral-900">
                      {entry.resourceLabel ?? <span className="text-neutral-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setDetail(entry)}
                        className="p-1.5 rounded hover:bg-brand-50 text-neutral-600 hover:text-brand-600"
                        title="Lihat detail"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {list.data && list.data.meta.totalPages > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 text-sm">
            <div className="text-neutral-500">
              <strong>{list.data.meta.total}</strong> entries · halaman {list.data.meta.page} dari{' '}
              {list.data.meta.totalPages}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= list.data.meta.totalPages}
                className="p-1.5 rounded hover:bg-neutral-100 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <DetailDrawer entry={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

// ============== Sub-components ==============

function UserCell({ user }: { user: AuditEntry['userDisplay'] }) {
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
  if (!user) return <span className="text-neutral-400 text-xs italic">system / anonymous</span>;
  return (
    <div className="flex items-center gap-2">
      {user.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}${user.fotoUrl}`}
          alt={user.namaLengkap}
          className="w-6 h-6 rounded-full object-cover"
        />
      ) : (
        <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
          <UserIcon className="w-3 h-3" />
        </div>
      )}
      <span className="truncate text-sm">{user.namaLengkap}</span>
    </div>
  );
}

const ACTION_STYLE: Record<ActionKey, { bg: string; text: string; label: string }> = {
  CREATE: { bg: 'bg-green-50', text: 'text-green-700', label: 'Create' },
  UPDATE: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Update' },
  DELETE: { bg: 'bg-red-50', text: 'text-red-700', label: 'Delete' },
  LOGIN: { bg: 'bg-brand-50', text: 'text-brand-700', label: 'Login' },
  LOGOUT: { bg: 'bg-neutral-100', text: 'text-neutral-700', label: 'Logout' },
  ENROLL_FACE: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Enroll Face' },
  RESET_FACE: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Reset Face' },
  UPLOAD_PHOTO: { bg: 'bg-indigo-50', text: 'text-indigo-700', label: 'Upload Photo' },
};

function ActionBadge({ action }: { action: ActionKey }) {
  const s = ACTION_STYLE[action] ?? { bg: 'bg-neutral-100', text: 'text-neutral-700', label: action };
  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white"
      >
        <option value="">Semua</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function DetailDrawer({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  if (!entry) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-neutral-900">Detail Audit Entry</h2>
            <p className="text-xs text-neutral-500">{formatDateTime(entry.createdAt)}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-neutral-100 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <Field label="Action"><ActionBadge action={entry.action} /></Field>
          <Field label="Resource">
            <code className="text-sm">{entry.resource}</code>
            {entry.resourceId && (
              <span className="ml-2 text-xs text-neutral-400 font-mono">{entry.resourceId}</span>
            )}
          </Field>
          {entry.resourceLabel && <Field label="Target"><span>{entry.resourceLabel}</span></Field>}
          <Field label="User">
            <UserCell user={entry.userDisplay} />
          </Field>
          {entry.ipAddress && <Field label="IP / UA"><div className="text-xs text-neutral-500"><code>{entry.ipAddress}</code> · <span className="break-all">{entry.userAgent}</span></div></Field>}
          {entry.metadata != null && Object.keys(entry.metadata as object).length > 0 && (
            <Field label="Metadata">
              <JsonView value={entry.metadata} />
            </Field>
          )}
          {entry.before != null && (
            <Field label="Before">
              <JsonView value={entry.before} />
            </Field>
          )}
          {entry.after != null && (
            <Field label="After">
              <JsonView value={entry.after} />
            </Field>
          )}
        </div>
      </aside>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase text-neutral-500 mb-1.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="bg-neutral-900 text-neutral-100 rounded-lg p-3 text-xs overflow-x-auto max-h-80 font-mono">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
