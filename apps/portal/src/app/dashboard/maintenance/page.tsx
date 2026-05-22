'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wrench,
  Loader2,
  RefreshCw,
  Trash2,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

type NotifType = 'IBADAH_REMINDER' | 'EVENT_REMINDER';
type NotifStatus = 'PENDING' | 'SENT' | 'FAILED';

interface RefreshTokenStats {
  total: number;
  expired: number;
  revoked: number;
  active: number;
  asOf: string;
}
interface AuditLogStats {
  total: number;
  eligibleForCleanup: number;
  last7Days: number;
  retentionDays: number;
  cutoffDate: string;
  asOf: string;
}
interface NotificationStats {
  byTypeLast7Days: Record<string, Record<NotifStatus, number>>;
  window: { from: string; to: string };
}
interface NotificationLogRow {
  id: string;
  jemaatId: string | null;
  noHp: string;
  type: NotifType;
  dedupKey: string;
  status: NotifStatus;
  messageId: string | null;
  errorReason: string | null;
  attemptCount: number;
  sentAt: string | null;
  createdAt: string;
  jemaat: { id: string; namaLengkap: string; noHp: string | null } | null;
}

const STATUS_COLOR: Record<NotifStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  SENT: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-700',
};
const STATUS_ICON: Record<NotifStatus, typeof Clock> = {
  PENDING: Clock,
  SENT: CheckCircle2,
  FAILED: XCircle,
};

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<NotifType | ''>('');
  const [filterStatus, setFilterStatus] = useState<NotifStatus | ''>('');

  const tokenStatsQ = useQuery({
    queryKey: ['maintenance', 'refresh-token-stats'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RefreshTokenStats }>(
        '/admin/maintenance/refresh-token-stats',
      );
      return res.data.data;
    },
  });

  const auditStatsQ = useQuery({
    queryKey: ['maintenance', 'audit-log-stats'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: AuditLogStats }>(
        '/admin/maintenance/audit-log-stats',
      );
      return res.data.data;
    },
  });

  const notifStatsQ = useQuery({
    queryKey: ['maintenance', 'notification-stats'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: NotificationStats }>(
        '/admin/maintenance/notification-stats',
      );
      return res.data.data;
    },
  });

  const logsQ = useQuery({
    queryKey: ['maintenance', 'notification-logs', filterType, filterStatus],
    queryFn: async () => {
      const params: Record<string, string | number> = { limit: 100 };
      if (filterType) params.type = filterType;
      if (filterStatus) params.status = filterStatus;
      const res = await apiClient.get<{ data: NotificationLogRow[] }>(
        '/admin/maintenance/notification-logs',
        { params },
      );
      return res.data.data;
    },
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['maintenance'] });
  };

  const tokenCleanupMut = useMutation({
    mutationFn: async () => apiClient.post('/admin/maintenance/refresh-token-cleanup'),
    onSuccess: (r: any) => {
      toast.success(`Deleted ${r.data.data.deleted} expired tokens (${r.data.data.tookMs}ms)`);
      refreshAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const auditCleanupMut = useMutation({
    mutationFn: async () => apiClient.post('/admin/maintenance/audit-log-cleanup'),
    onSuccess: (r: any) => {
      toast.success(`Deleted ${r.data.data.deleted} old audit logs (${r.data.data.tookMs}ms)`);
      refreshAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const ibadahMut = useMutation({
    mutationFn: async () => apiClient.post('/admin/maintenance/dispatch-ibadah-reminder'),
    onSuccess: (r: any) => {
      const d = r.data.data;
      toast.success(`Ibadah: sent ${d.sent}, failed ${d.failed}, skipped ${d.skipped}`);
      refreshAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const eventMut = useMutation({
    mutationFn: async () => apiClient.post('/admin/maintenance/dispatch-event-reminder'),
    onSuccess: (r: any) => {
      const d = r.data.data;
      toast.success(`Event: sent ${d.sent}, failed ${d.failed}, skipped ${d.skipped}`);
      refreshAll();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Wrench className="w-6 h-6" />
            Maintenance
          </h1>
          <p className="text-neutral-500 mt-1">
            Diagnostic + manual trigger untuk background jobs (cleanup token, audit
            log retention, WA reminder dispatch).
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="flex items-center gap-2 px-3 py-1.5 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Cards: stats + actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* Refresh token */}
        <StatsCard
          title="Refresh Tokens"
          loading={tokenStatsQ.isLoading}
          subtitle="Auto-cleanup every 6 hours"
        >
          {tokenStatsQ.data && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Total" value={tokenStatsQ.data.total} />
              <Stat label="Active" value={tokenStatsQ.data.active} accent="text-green-600" />
              <Stat label="Expired" value={tokenStatsQ.data.expired} accent="text-amber-600" />
              <Stat label="Revoked" value={tokenStatsQ.data.revoked} accent="text-neutral-500" />
            </div>
          )}
          <ActionButton
            label="Cleanup expired"
            icon={Trash2}
            pending={tokenCleanupMut.isPending}
            onClick={() => tokenCleanupMut.mutate()}
          />
        </StatsCard>

        {/* Audit log */}
        <StatsCard
          title="Audit Log Retention"
          loading={auditStatsQ.isLoading}
          subtitle={`Retention: ${auditStatsQ.data?.retentionDays ?? 365} hari (auto-cleanup daily)`}
        >
          {auditStatsQ.data && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat label="Total" value={auditStatsQ.data.total} />
              <Stat label="Last 7 days" value={auditStatsQ.data.last7Days} accent="text-green-600" />
              <Stat
                label="Eligible cleanup"
                value={auditStatsQ.data.eligibleForCleanup}
                accent="text-amber-600"
              />
            </div>
          )}
          <ActionButton
            label="Cleanup now"
            icon={Trash2}
            pending={auditCleanupMut.isPending}
            onClick={() => auditCleanupMut.mutate()}
          />
        </StatsCard>

        {/* Notifications */}
        <StatsCard
          title="WA Reminders (last 7 days)"
          loading={notifStatsQ.isLoading}
          subtitle="Auto-dispatch every hour, send window 07-10 WIB"
        >
          {notifStatsQ.data && (
            <div className="space-y-1.5 text-xs">
              {(['IBADAH_REMINDER', 'EVENT_REMINDER'] as const).map((t) => {
                const stats = notifStatsQ.data!.byTypeLast7Days[t] ?? {
                  SENT: 0,
                  FAILED: 0,
                  PENDING: 0,
                };
                return (
                  <div key={t} className="flex items-center justify-between">
                    <span className="text-neutral-600 font-medium">
                      {t.replace('_REMINDER', '')}
                    </span>
                    <span className="flex gap-2">
                      <span className="text-green-600">✓{stats.SENT ?? 0}</span>
                      <span className="text-red-600">✗{stats.FAILED ?? 0}</span>
                      <span className="text-amber-600">⏳{stats.PENDING ?? 0}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => ibadahMut.mutate()}
              disabled={ibadahMut.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs border border-brand-300 hover:bg-brand-50 text-brand-700 rounded-lg disabled:opacity-50"
            >
              {ibadahMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Ibadah
            </button>
            <button
              onClick={() => eventMut.mutate()}
              disabled={eventMut.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs border border-brand-300 hover:bg-brand-50 text-brand-700 rounded-lg disabled:opacity-50"
            >
              {eventMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Event
            </button>
          </div>
        </StatsCard>
      </div>

      {/* Recent notification logs */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
          <div className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" />
            Recent Notification Logs (max 100)
          </div>
          <div className="flex items-center gap-2 text-xs">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as NotifType | '')}
              className="px-2 py-1 border border-neutral-300 rounded text-xs"
            >
              <option value="">Semua tipe</option>
              <option value="IBADAH_REMINDER">Ibadah</option>
              <option value="EVENT_REMINDER">Event</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as NotifStatus | '')}
              className="px-2 py-1 border border-neutral-300 rounded text-xs"
            >
              <option value="">Semua status</option>
              <option value="SENT">Sent</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>
        </div>
        {logsQ.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : (logsQ.data ?? []).length === 0 ? (
          <div className="text-center py-12 text-sm text-neutral-400 italic">
            Belum ada notification logs.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-neutral-50 text-neutral-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Recipient</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Attempts</th>
                <th className="px-3 py-2 text-left">Error / Message ID</th>
              </tr>
            </thead>
            <tbody>
              {(logsQ.data ?? []).map((r) => {
                const Icon = STATUS_ICON[r.status];
                return (
                  <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">
                      {new Date(r.createdAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2 text-neutral-700">
                      {r.type.replace('_REMINDER', '')}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-neutral-900">
                        {r.jemaat?.namaLengkap ?? '(unknown)'}
                      </div>
                      <div className="text-[10px] text-neutral-500">{r.noHp}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_COLOR[r.status]}`}
                      >
                        <Icon className="w-2.5 h-2.5" />
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{r.attemptCount}</td>
                    <td className="px-3 py-2 text-neutral-500 max-w-xs truncate">
                      {r.errorReason ?? r.messageId ?? '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatsCard({
  title,
  subtitle,
  loading,
  children,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <div className="text-sm font-semibold text-neutral-900">{title}</div>
        {subtitle && <div className="text-[11px] text-neutral-500 mt-0.5">{subtitle}</div>}
      </div>
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div>
      <div className="text-[10px] text-neutral-500 uppercase">{label}</div>
      <div className={`text-lg font-bold ${accent ?? 'text-neutral-900'}`}>{value}</div>
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  pending,
  onClick,
}: {
  label: string;
  icon: typeof Trash2;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs border border-neutral-300 hover:bg-neutral-50 rounded-lg disabled:opacity-50"
    >
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
      {label}
    </button>
  );
}
