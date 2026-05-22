'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Gauge,
  Cpu,
  MemoryStick,
  Server,
  Database,
  HardDrive,
  Activity,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Bell,
  Settings,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface ServerHealth {
  asOf: string;
  tookMs: number;
  os: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
    uptimeSec: number;
  };
  cpu: {
    model: string;
    cores: number;
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    usedPercent: number;
  };
  process: {
    pid: number;
    uptimeSec: number;
    memoryRssBytes: number;
    memoryHeapTotalBytes: number;
    memoryHeapUsedBytes: number;
    memoryExternalBytes: number;
  };
  storage: {
    uploadsDir: string;
    uploadsSizeBytes: number;
    uploadsError: string | null;
  };
  database: {
    connectionCount: number | null;
    queryLatencyMs: number | null;
    version: string | null;
  };
  entities: {
    jemaatAktif: number;
    ibadahAktif: number;
    cabangAktif: number;
    eventPublished: number;
    activeSessions: number;
  };
  notifications: {
    last7Days: Record<string, Record<string, number>>;
  };
  env: {
    nodeEnv: string;
    auditLogRetentionDays: number;
    reminderHourStart: number;
    reminderHourEnd: number;
    fonnteConfigured: boolean;
    livenessSecretSet: boolean;
  };
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${sec % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function fmtNumber(n: number): string {
  return n.toLocaleString('id-ID');
}

export default function ServerHealthPage() {
  const [autoRefresh, setAutoRefresh] = useState(true);

  const healthQ = useQuery<ServerHealth>({
    queryKey: ['server-health'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ServerHealth }>('/admin/server-health');
      return res.data.data;
    },
    refetchInterval: autoRefresh ? 5_000 : false,
  });

  const d = healthQ.data;

  // ===== Derived alerts =====
  const alerts: Array<{ severity: 'high' | 'med' | 'low'; msg: string }> = [];
  if (d) {
    if (d.memory.usedPercent > 90)
      alerts.push({ severity: 'high', msg: `Memory usage ${d.memory.usedPercent.toFixed(0)}% — restart core-api atau scale VPS` });
    else if (d.memory.usedPercent > 75)
      alerts.push({ severity: 'med', msg: `Memory usage tinggi: ${d.memory.usedPercent.toFixed(0)}%` });

    const loadPerCore = d.cpu.loadAvg1m / Math.max(1, d.cpu.cores);
    if (loadPerCore > 1.5)
      alerts.push({ severity: 'high', msg: `CPU load 1m ${d.cpu.loadAvg1m.toFixed(2)} / ${d.cpu.cores} cores (overload)` });
    else if (loadPerCore > 0.8)
      alerts.push({ severity: 'med', msg: `CPU load 1m ${d.cpu.loadAvg1m.toFixed(2)} approaching capacity` });

    if (d.database.queryLatencyMs !== null && d.database.queryLatencyMs > 500)
      alerts.push({ severity: 'med', msg: `DB query latency ${d.database.queryLatencyMs}ms (>500ms)` });

    if (d.storage.uploadsSizeBytes > 10 * 1024 * 1024 * 1024)
      alerts.push({ severity: 'med', msg: `Uploads >10GB — pertimbangkan archive lama` });

    if (!d.env.fonnteConfigured)
      alerts.push({ severity: 'med', msg: 'FONNTE_TOKEN belum di-set → WA reminder + OTP tidak akan terkirim' });
    if (!d.env.livenessSecretSet)
      alerts.push({ severity: 'low', msg: 'LIVENESS_NONCE_SECRET belum di-set (fallback ke JWT_SECRET, OK tapi rekomendasi pakai secret terpisah)' });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Gauge className="w-6 h-6" />
            Server Health
          </h1>
          <p className="text-neutral-500 mt-1">
            Diagnostic + monitoring untuk tim ops post-production. Auto-refresh tiap 5 detik.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-neutral-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-3.5 h-3.5 accent-brand-500"
            />
            Auto-refresh 5s
          </label>
          <button
            onClick={() => healthQ.refetch()}
            disabled={healthQ.isFetching}
            className="flex items-center gap-2 px-3 py-1.5 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${healthQ.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {healthQ.isLoading && !d ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : !d ? (
        <div className="text-center py-20 text-sm text-red-600">
          Gagal load data server health.
        </div>
      ) : (
        <>
          {/* Alerts row */}
          {alerts.length > 0 && (
            <div className="mb-4 space-y-1.5">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
                    a.severity === 'high'
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : a.severity === 'med'
                        ? 'border-amber-200 bg-amber-50 text-amber-800'
                        : 'border-blue-200 bg-blue-50 text-blue-800'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{a.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {/* CPU */}
            <Card title="CPU" icon={Cpu}>
              <Row label="Model" value={d.cpu.model} small />
              <Row label="Cores" value={String(d.cpu.cores)} />
              <Row label="Load 1m" value={d.cpu.loadAvg1m.toFixed(2)} accent={loadColor(d.cpu.loadAvg1m, d.cpu.cores)} />
              <Row label="Load 5m" value={d.cpu.loadAvg5m.toFixed(2)} />
              <Row label="Load 15m" value={d.cpu.loadAvg15m.toFixed(2)} />
            </Card>

            {/* Memory (system) */}
            <Card title="Memory (system)" icon={MemoryStick}>
              <Row label="Total" value={fmtBytes(d.memory.totalBytes)} />
              <Row label="Used" value={fmtBytes(d.memory.usedBytes)} accent={memColor(d.memory.usedPercent)} />
              <Row label="Free" value={fmtBytes(d.memory.freeBytes)} />
              <ProgressBar percent={d.memory.usedPercent} />
            </Card>

            {/* Process */}
            <Card title="Process (core-api)" icon={Server}>
              <Row label="PID" value={String(d.process.pid)} />
              <Row label="Uptime" value={fmtDuration(d.process.uptimeSec)} />
              <Row label="RSS" value={fmtBytes(d.process.memoryRssBytes)} />
              <Row label="Heap used" value={fmtBytes(d.process.memoryHeapUsedBytes)} />
              <Row
                label="Heap %"
                value={`${((d.process.memoryHeapUsedBytes / Math.max(1, d.process.memoryHeapTotalBytes)) * 100).toFixed(0)}%`}
              />
            </Card>

            {/* OS */}
            <Card title="OS" icon={Server}>
              <Row label="Platform" value={`${d.os.platform} ${d.os.arch}`} />
              <Row label="Release" value={d.os.release} small />
              <Row label="Hostname" value={d.os.hostname} small />
              <Row label="Node" value={d.os.nodeVersion} />
              <Row label="System uptime" value={fmtDuration(d.os.uptimeSec)} />
            </Card>

            {/* Database */}
            <Card title="Database" icon={Database}>
              <Row
                label="Status"
                value={d.database.queryLatencyMs !== null ? 'Connected' : 'Error'}
                accent={d.database.queryLatencyMs !== null ? 'text-green-600' : 'text-red-600'}
              />
              <Row label="Query latency" value={d.database.queryLatencyMs !== null ? `${d.database.queryLatencyMs}ms` : '-'} />
              <Row label="Connections" value={d.database.connectionCount?.toString() ?? '-'} />
              {d.database.version && (
                <Row label="Version" value={d.database.version.split(' ').slice(0, 2).join(' ')} small />
              )}
            </Card>

            {/* Storage */}
            <Card title="Storage (uploads)" icon={HardDrive}>
              <Row label="Path" value={d.storage.uploadsDir} small />
              <Row label="Size" value={fmtBytes(d.storage.uploadsSizeBytes)} />
              {d.storage.uploadsError && (
                <div className="text-xs text-red-600 mt-1">Error: {d.storage.uploadsError}</div>
              )}
            </Card>

            {/* Entities */}
            <Card title="Entity counts" icon={Activity}>
              <Row label="Jemaat aktif" value={fmtNumber(d.entities.jemaatAktif)} />
              <Row label="Ibadah aktif" value={fmtNumber(d.entities.ibadahAktif)} />
              <Row label="Cabang aktif" value={fmtNumber(d.entities.cabangAktif)} />
              <Row label="Event published" value={fmtNumber(d.entities.eventPublished)} />
              <Row label="Active sessions" value={fmtNumber(d.entities.activeSessions)} />
            </Card>

            {/* Notifications */}
            <Card title="WA reminders (last 7d)" icon={Bell}>
              {(['IBADAH_REMINDER', 'EVENT_REMINDER'] as const).map((t) => {
                const s = d.notifications.last7Days[t] ?? { SENT: 0, FAILED: 0, PENDING: 0 };
                return (
                  <div key={t} className="text-xs space-y-0.5">
                    <div className="font-semibold text-neutral-700">{t.replace('_REMINDER', '')}</div>
                    <div className="flex gap-2 text-neutral-500">
                      <span className="text-green-600">✓ {s.SENT ?? 0}</span>
                      <span className="text-red-600">✗ {s.FAILED ?? 0}</span>
                      <span className="text-amber-600">⏳ {s.PENDING ?? 0}</span>
                    </div>
                  </div>
                );
              })}
            </Card>

            {/* Env */}
            <Card title="Env config" icon={Settings}>
              <Row label="NODE_ENV" value={d.env.nodeEnv} />
              <Row
                label="Fonnte"
                value={d.env.fonnteConfigured ? 'Configured' : 'Missing'}
                accent={d.env.fonnteConfigured ? 'text-green-600' : 'text-red-600'}
              />
              <Row
                label="Liveness secret"
                value={d.env.livenessSecretSet ? 'Set' : 'Fallback JWT_SECRET'}
                accent={d.env.livenessSecretSet ? 'text-green-600' : 'text-amber-600'}
              />
              <Row label="Audit retention" value={`${d.env.auditLogRetentionDays} hari`} />
              <Row label="Reminder window" value={`${d.env.reminderHourStart}:00–${d.env.reminderHourEnd}:00`} />
            </Card>
          </div>

          {/* Last update */}
          <div className="text-xs text-neutral-500 text-right mb-6">
            Updated: {new Date(d.asOf).toLocaleString('id-ID')} · query {d.tookMs}ms
          </div>

          {/* Troubleshooting */}
          <TroubleshootingSection />
        </>
      )}
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Cpu;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-neutral-100">
        <Icon className="w-4 h-4 text-brand-500" />
        <div className="text-sm font-semibold text-neutral-900">{title}</div>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  small,
}: {
  label: string;
  value: string;
  accent?: string;
  small?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs gap-2">
      <span className="text-neutral-500">{label}</span>
      <span
        className={`${accent ?? 'text-neutral-900'} ${small ? 'text-[11px] font-mono' : 'font-medium'} truncate max-w-[60%] text-right`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const color = percent > 90 ? 'bg-red-500' : percent > 75 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="mt-2 w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

function loadColor(load1m: number, cores: number): string {
  const per = load1m / Math.max(1, cores);
  if (per > 1.5) return 'text-red-600';
  if (per > 0.8) return 'text-amber-600';
  return 'text-green-600';
}

function memColor(percent: number): string {
  if (percent > 90) return 'text-red-600';
  if (percent > 75) return 'text-amber-600';
  return 'text-neutral-900';
}

// ===========================================================================
// Troubleshooting section — common cases + remediation tips
// ===========================================================================
interface Case {
  symptom: string;
  causes: string[];
  remediation: string[];
}

const TROUBLESHOOTING: { group: string; cases: Case[] }[] = [
  {
    group: '🔥 Performance',
    cases: [
      {
        symptom: 'CPU load 1m > cores × 1.5 (sustained)',
        causes: [
          'Sharp image resize (hero/logo upload) terlalu sering bersamaan',
          'Face recognition matching banyak request paralel',
          'Cron job (cleanup-audit-log) sedang scan ratusan ribu row',
        ],
        remediation: [
          'pm2 monit untuk identifikasi proses spike',
          'pm2 logs ecc-core-api --lines 200 untuk cek request burst',
          'Scale vertical VPS (tambah core), atau pisah core-api ke server sendiri',
          'Tambah index DB untuk query yang lambat (lihat Slow Queries di bawah)',
        ],
      },
      {
        symptom: 'Memory usage > 90%',
        causes: [
          'Sharp leak saat upload banyak — heap tidak release',
          'Prisma client buffer query result besar (mis. export jemaat tanpa pagination)',
          'TensorFlow / face-api models tidak ke-unload',
        ],
        remediation: [
          'pm2 restart ecc-core-api (zero-downtime: pm2 reload)',
          'PM2 sudah set max_memory_restart 500MB → harusnya auto-restart',
          'Audit query findMany tanpa pagination → tambah take/skip',
          'Kalau berulang, profile via Chrome DevTools (node --inspect)',
        ],
      },
      {
        symptom: 'DB query latency > 500ms (sustained)',
        causes: [
          'Index missing untuk filter yang sering dipakai',
          'Connection pool exhausted (banyak request long-running)',
          'Database server overloaded',
        ],
        remediation: [
          'Enable Prisma query log: env DEBUG="prisma:query" untuk identifikasi query lambat',
          'Tambah index via migration baru (Prisma schema @@index([field, field]))',
          'Cek pg_stat_activity di Database stats card — kalau >100 connections, raise pool size atau pg max_connections',
          'VACUUM ANALYZE table yang grow cepat (jemaat, reservasi, audit_log)',
        ],
      },
    ],
  },
  {
    group: '💾 Storage',
    cases: [
      {
        symptom: 'Uploads size > 10GB',
        causes: [
          'Banyak foto profile + hero bisnis + company profile PDF',
          'Foto event bukti transfer akumulatif',
          'Tidak ada cleanup untuk event/business yang sudah lama deleted',
        ],
        remediation: [
          'Archive bulan-bulan lama ke cold storage: tar + transfer ke S3/backup VPS, lalu rm local',
          'Cek subdir size: du -sh /var/www/ecc-core-platform/uploads/*',
          'Untuk event lama (>1 tahun, isPublished=false): bisa hapus folder content/event/bukti/<id>.webp',
          'Pre-emptive: setup logrotate-like cron untuk uploads (out of scope MVP)',
        ],
      },
      {
        symptom: 'Disk full — write fail saat upload',
        causes: ['VPS disk penuh', 'Postgres data dir penuh'],
        remediation: [
          'df -h untuk identifikasi mount mana full',
          'Cek log Postgres /var/log/postgresql/ — kalau >1GB, rotate dan compress',
          'Cek PM2 log: ~/.pm2/logs/ — pm2 flush untuk clear',
          'Cleanup audit_log via maintenance endpoint atau tunggu cron daily',
        ],
      },
    ],
  },
  {
    group: '📨 WhatsApp / Notifications',
    cases: [
      {
        symptom: 'WA reminder tidak ke-kirim (FAILED tinggi)',
        causes: [
          'FONNTE_TOKEN expired / device disconnected di Fonnte dashboard',
          'Saldo Fonnte habis',
          'Rate limit Fonnte (kalau burst tinggi)',
          'No HP target invalid format',
        ],
        remediation: [
          'Cek dashboard Fonnte: login → cek device status + saldo',
          'Re-scan QR di Fonnte device kalau disconnected',
          'Lihat error_reason di /dashboard/maintenance → Notification Logs',
          'Manual retry: POST /admin/maintenance/dispatch-ibadah-reminder atau via portal Maintenance',
        ],
      },
      {
        symptom: 'OTP tidak diterima user saat login',
        causes: ['Fonnte issue (sama dgn di atas)', 'No HP user belum di-update format E.164'],
        remediation: [
          'Cek log: pm2 logs ecc-core-api | grep OTP',
          'Manual fallback: admin reset password / generate OTP via audit log',
          'User update noHp via portal admin Jemaat',
        ],
      },
    ],
  },
  {
    group: '🔐 Auth & Sessions',
    cases: [
      {
        symptom: 'User tiba-tiba ter-logout (force logout)',
        causes: [
          'Refresh token reuse detected (security event) → semua sesi di-revoke',
          'User self-deactivate via DELETE /admin/me',
          'JWT_SECRET di-rotate (rotation invalidate semua token)',
        ],
        remediation: [
          'Cek audit_log filter resource=auth action=LOGOUT',
          'Cek refresh_token table: SELECT * WHERE user_id=<x> ORDER BY created_at DESC',
          'User login ulang dengan OTP/face',
        ],
      },
      {
        symptom: 'Refresh token table swelling (>100k rows)',
        causes: ['Scheduled cleanup tidak jalan', 'User base besar + multi-device'],
        remediation: [
          'Cek log: pm2 logs ecc-core-api | grep cleanup-refresh-token',
          'Manual trigger: POST /admin/maintenance/refresh-token-cleanup',
          'Cek interval: default 6 jam — sesuaikan di lib/scheduled-jobs.ts kalau perlu',
        ],
      },
      {
        symptom: 'Face login fail terus dengan FACE_NO_MATCH',
        causes: [
          'Lighting kondisi berbeda saat enroll vs login',
          'Wajah user berubah (kacamata, jenggot, makeup)',
          'Model version mismatch',
        ],
        remediation: [
          'User reset face enrollment via PUT /auth/me/face-profile',
          'Cek confidence di response — kalau >0.4 tapi <0.5, mungkin threshold terlalu strict',
          'Sesuaikan FACE_MATCH_THRESHOLD di .env (default 0.5, lower = lenient)',
        ],
      },
    ],
  },
  {
    group: '🗄️ Database',
    cases: [
      {
        symptom: 'Connection count > 100',
        causes: [
          'Connection leak (kemungkinan Prisma not closing)',
          'Burst traffic',
          'Long-running queries memblock connection',
        ],
        remediation: [
          'Restart core-api (pm2 reload) untuk close all connections',
          'Cek slow query: SELECT * FROM pg_stat_activity WHERE state=\'active\' ORDER BY query_start',
          'Kill query stuck: SELECT pg_cancel_backend(<pid>)',
        ],
      },
      {
        symptom: 'Migration deploy fail',
        causes: ['Schema conflict', 'Data inconsistency dengan migration baru', 'Lock dari long-running query'],
        remediation: [
          'Rollback DB ke backup terakhir (PITR atau pg_dump)',
          'Manual SQL fix kalau minor (mis. ALTER COLUMN)',
          'Jangan force apply — re-create migration dengan handle data legacy',
        ],
      },
    ],
  },
  {
    group: '⚙️ Deployment',
    cases: [
      {
        symptom: 'GitHub Actions deploy fail',
        causes: [
          'pnpm-lock.yaml conflict (mismatch dgn package.json)',
          'Build error TypeScript baru',
          'VPS SSH key expired / rotated',
        ],
        remediation: [
          'Lihat full log di GitHub Actions tab',
          'Rerun job kalau transient (network/Fonnte issue)',
          'Manual deploy: ssh deploy@vps && cd /var/www/ecc-core-platform && ./scripts/deploy.sh',
        ],
      },
      {
        symptom: 'Service tidak start setelah deploy',
        causes: ['Env var missing', 'Port konflik', 'Build artifact corrupt'],
        remediation: [
          'pm2 logs ecc-core-api --lines 100 → cek error stack',
          'pm2 status — kalau errored, pm2 restart ecc-core-api',
          'Clean build: rm -rf apps/*/dist apps/*/.next && pnpm -r build',
        ],
      },
    ],
  },
];

function TroubleshootingSection() {
  const [openGroup, setOpenGroup] = useState<string | null>(TROUBLESHOOTING[0]?.group ?? null);

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-500" />
        <div className="text-sm font-semibold text-neutral-900">Common Cases & Remediation</div>
        <div className="text-xs text-neutral-500 ml-2">untuk tim ops post-production</div>
      </div>
      <div className="divide-y divide-neutral-100">
        {TROUBLESHOOTING.map((g) => {
          const open = openGroup === g.group;
          return (
            <div key={g.group}>
              <button
                onClick={() => setOpenGroup(open ? null : g.group)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-neutral-50 text-left"
              >
                <div className="flex items-center gap-2">
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-neutral-400" />
                  )}
                  <span className="font-medium text-sm text-neutral-900">{g.group}</span>
                  <span className="text-[11px] text-neutral-500">({g.cases.length} cases)</span>
                </div>
              </button>
              {open && (
                <div className="px-4 pb-4 space-y-3">
                  {g.cases.map((c, idx) => (
                    <div
                      key={idx}
                      className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/30"
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <XCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                        <div className="text-sm font-semibold text-neutral-900">{c.symptom}</div>
                      </div>
                      <div className="ml-5 space-y-2 text-xs">
                        <div>
                          <div className="font-medium text-neutral-600 mb-0.5">Kemungkinan penyebab:</div>
                          <ul className="list-disc ml-4 space-y-0.5 text-neutral-700">
                            {c.causes.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="font-medium text-green-700 mb-0.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Cara handle:
                          </div>
                          <ul className="list-disc ml-4 space-y-0.5 text-neutral-700">
                            {c.remediation.map((x, i) => (
                              <li key={i}>
                                <code className="text-[11px] bg-white px-1 rounded">{x}</code>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
