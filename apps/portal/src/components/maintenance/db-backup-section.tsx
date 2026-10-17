'use client';

/**
 * Backup & Restore Database (menu Maintenance).
 * - Backup: buat backup sekarang → file bernama waktu WIB → unduh.
 * - Restore: unggah file .dump ATAU pilih backup di server. Wajib master
 *   password + ketik RESTORE. Server otomatis membuat backup pengaman
 *   sebelum restore, menyalakan maintenance mode, dan restore bersifat
 *   atomik (gagal = database tidak berubah).
 * API: /admin/maintenance/db/*
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  HardDriveUpload,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
  kind: 'manual' | 'pre-restore' | 'upload';
}
interface DbJob {
  id: string;
  kind: 'BACKUP' | 'RESTORE';
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  step: string;
  file: string | null;
  safetyBackup: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  log: string[];
}
interface Overview {
  files: BackupFile[];
  jobs: DbJob[];
  running: DbJob | null;
  tools: { pgDump: string | null; pgRestore: string | null };
  dir: string;
}

const KEY = ['maintenance', 'db'];
const fmtSize = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fmtDT = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
const errMsg = (e: unknown) =>
  (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
  (e instanceof Error ? e.message : 'Terjadi kesalahan');

const KIND_LABEL: Record<BackupFile['kind'], { label: string; cls: string }> = {
  manual: { label: 'Backup', cls: 'bg-brand-50 text-brand-700' },
  'pre-restore': { label: 'Pengaman sebelum restore', cls: 'bg-amber-50 text-amber-700' },
  upload: { label: 'Unggahan', cls: 'bg-sky-50 text-sky-700' },
};

export function DbBackupSection() {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ mode: 'upload' } | { mode: 'file'; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<{ data: Overview }>('/admin/maintenance/db')).data.data,
  });

  // Lacak job yang sedang berjalan (juga kalau halaman dibuka saat job jalan).
  const activeId = jobId ?? q.data?.running?.id ?? null;
  const jobQ = useQuery({
    queryKey: [...KEY, 'job', activeId],
    enabled: !!activeId,
    queryFn: async () => (await apiClient.get<{ data: DbJob }>(`/admin/maintenance/db/jobs/${activeId}`)).data.data,
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' ? 2000 : false),
  });
  const job = jobQ.data ?? null;
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!job) return;
    if (prevStatus.current === 'RUNNING' && job.status !== 'RUNNING') {
      void qc.invalidateQueries({ queryKey: KEY });
      if (job.status === 'SUCCESS') toast.success(job.kind === 'BACKUP' ? 'Backup selesai' : 'Restore selesai');
      else toast.error(`${job.kind === 'BACKUP' ? 'Backup' : 'Restore'} gagal`);
    }
    prevStatus.current = job.status;
  }, [job, qc]);

  const busy = job?.status === 'RUNNING';

  const backup = useMutation({
    mutationFn: async () => (await apiClient.post<{ data: DbJob }>('/admin/maintenance/db/backup')).data.data,
    onSuccess: (j) => {
      prevStatus.current = 'RUNNING';
      setJobId(j.id);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const remove = useMutation({
    mutationFn: async (name: string) => apiClient.delete(`/admin/maintenance/db/files/${encodeURIComponent(name)}`),
    onSuccess: () => {
      toast.success('Backup dihapus');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const [downloading, setDownloading] = useState<string | null>(null);
  async function download(name: string) {
    setDownloading(name);
    try {
      const res = await apiClient.get(`/admin/maintenance/db/files/${encodeURIComponent(name)}`, {
        responseType: 'blob',
        timeout: 0,
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setDownloading(null);
    }
  }

  const d = q.data;
  const toolsMissing = d && (!d.tools.pgDump || !d.tools.pgRestore);

  return (
    <div className="bg-white border border-neutral-200 rounded-xl mb-6 overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-brand-500" /> Backup & Restore Database
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Nama file otomatis berdasarkan waktu (WIB), mis. <code>ecc-db_2026-10-17_23-45-12_WIB.dump</code>. Hanya
            fulltimer.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => backup.mutate()}
            disabled={busy || backup.isPending || !!toolsMissing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {backup.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
            Backup sekarang
          </button>
          <button
            onClick={() => setRestoreTarget({ mode: 'upload' })}
            disabled={busy || !!toolsMissing}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <HardDriveUpload className="w-4 h-4" /> Restore dari file…
          </button>
        </div>
      </div>

      {q.isError ? <div className="px-5 py-3 text-sm text-red-600">{errMsg(q.error)}</div> : null}
      {toolsMissing ? (
        <div className="mx-5 mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <b>pg_dump / pg_restore belum terpasang di server.</b> Jalankan <code>sudo apt install postgresql-client</code>{' '}
            (versi sama atau lebih baru dari PostgreSQL server).
          </div>
        </div>
      ) : null}

      {job ? <JobPanel job={job} onClose={() => setJobId(null)} /> : null}

      <div className="overflow-x-auto">
        {q.isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : (d?.files ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-neutral-400">Belum ada file backup di server.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-5 py-2 font-medium">File</th>
                <th className="text-left px-5 py-2 font-medium">Jenis</th>
                <th className="text-right px-5 py-2 font-medium">Ukuran</th>
                <th className="text-left px-5 py-2 font-medium">Dibuat</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {d!.files.map((f) => (
                <tr key={f.name}>
                  <td className="px-5 py-2.5 font-mono text-xs break-all">{f.name}</td>
                  <td className="px-5 py-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${KIND_LABEL[f.kind].cls}`}>{KIND_LABEL[f.kind].label}</span>
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{fmtSize(f.size)}</td>
                  <td className="px-5 py-2.5 text-neutral-600 whitespace-nowrap">{fmtDT(f.createdAt)}</td>
                  <td className="px-5 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => download(f.name)}
                      disabled={downloading === f.name}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-neutral-100 text-neutral-700"
                    >
                      {downloading === f.name ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                      Unduh
                    </button>
                    <button
                      onClick={() => setRestoreTarget({ mode: 'file', name: f.name })}
                      disabled={busy}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-red-50 text-red-600 disabled:opacity-40"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restore
                    </button>
                    <button
                      onClick={() => setDeleting(f.name)}
                      disabled={busy}
                      className="inline-flex items-center p-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600 disabled:opacity-40"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {d ? <div className="px-5 py-2 text-[11px] text-neutral-400 border-t border-neutral-100">Lokasi di server: {d.dir}</div> : null}

      {restoreTarget ? (
        <RestoreModal
          target={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onStarted={(j) => {
            prevStatus.current = 'RUNNING';
            setJobId(j.id);
            setRestoreTarget(null);
          }}
        />
      ) : null}

      {deleting ? (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setDeleting(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 pointer-events-auto">
              <h3 className="font-semibold">Hapus file backup?</h3>
              <p className="text-xs font-mono text-neutral-600 mt-2 break-all">{deleting}</p>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setDeleting(null)} className="px-4 py-2 text-sm rounded-lg border border-neutral-300">
                  Batal
                </button>
                <button
                  onClick={() => remove.mutate(deleting)}
                  disabled={remove.isPending}
                  className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50"
                >
                  Hapus
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function JobPanel({ job, onClose }: { job: DbJob; onClose: () => void }) {
  const running = job.status === 'RUNNING';
  return (
    <div
      className={`mx-5 mt-4 mb-4 rounded-lg border p-3 text-sm ${
        running ? 'border-sky-200 bg-sky-50' : job.status === 'SUCCESS' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
      }`}
    >
      <div className="flex items-start gap-2">
        {running ? (
          <Loader2 className="w-4 h-4 animate-spin text-sky-600 mt-0.5" />
        ) : job.status === 'SUCCESS' ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
        ) : (
          <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold">
            {job.kind === 'BACKUP' ? 'Backup' : 'Restore'} · {job.step}
          </div>
          {job.file ? <div className="text-xs font-mono break-all">{job.file}</div> : null}
          {job.safetyBackup ? (
            <div className="text-xs mt-1">
              Backup pengaman: <span className="font-mono">{job.safetyBackup}</span>
            </div>
          ) : null}
          {job.error ? <div className="text-xs text-red-700 mt-1">{job.error}</div> : null}
          {job.kind === 'RESTORE' && job.status === 'SUCCESS' ? (
            <div className="text-xs mt-1">
              Database sudah dipulihkan. Pengguna mungkin perlu login ulang kalau data sesi ikut berubah.
            </div>
          ) : null}
          {job.log.length > 0 ? (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer text-neutral-600">Log ({job.log.length})</summary>
              <pre className="mt-1 max-h-48 overflow-auto bg-white/70 p-2 rounded text-[10px]">{job.log.join('\n')}</pre>
            </details>
          ) : null}
        </div>
        {!running ? (
          <button onClick={onClose} className="p-1 rounded hover:bg-white/60">
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function RestoreModal({
  target,
  onClose,
  onStarted,
}: {
  target: { mode: 'upload' } | { mode: 'file'; name: string };
  onClose: () => void;
  onStarted: (job: DbJob) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [master, setMaster] = useState('');
  const [confirm, setConfirm] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const start = useMutation({
    mutationFn: async () => {
      const headers = { 'X-Credential-Master': master };
      if (target.mode === 'upload') {
        const fd = new FormData();
        fd.append('confirm', confirm);
        fd.append('file', file!);
        return (
          await apiClient.post<{ data: DbJob }>('/admin/maintenance/db/restore/upload', fd, {
            headers: { ...headers, 'Content-Type': 'multipart/form-data' },
            timeout: 0,
            onUploadProgress: (e) => setProgress(e.total ? Math.round((e.loaded / e.total) * 100) : null),
          })
        ).data.data;
      }
      return (
        await apiClient.post<{ data: DbJob }>(`/admin/maintenance/db/restore/${encodeURIComponent(target.name)}`, { confirm }, { headers })
      ).data.data;
    },
    onSuccess: onStarted,
    onError: (e) => {
      setProgress(null);
      toast.error(errMsg(e));
    },
  });

  const ready = (target.mode === 'file' || !!file) && master.length >= 8 && confirm === 'RESTORE';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={start.isPending ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Restore database</h3>
              <p className="text-sm text-neutral-600 mt-1">
                Seluruh data saat ini akan <b>diganti</b> dengan isi backup
                {target.mode === 'file' ? (
                  <>
                    {' '}
                    <span className="font-mono text-xs break-all">{target.name}</span>
                  </>
                ) : null}
                .
              </p>
            </div>
          </div>

          <ul className="mt-4 text-xs text-neutral-600 space-y-1 list-disc pl-5">
            <li>Server otomatis membuat <b>backup pengaman</b> kondisi sekarang sebelum restore.</li>
            <li>Aplikasi masuk <b>maintenance mode</b> selama proses.</li>
            <li>Restore bersifat atomik: kalau gagal di tengah jalan, database tidak berubah.</li>
            <li>Struktur backup harus sesuai versi aplikasi saat ini (backup lama mungkin butuh migration ulang).</li>
          </ul>

          <div className="mt-4 space-y-3">
            {target.mode === 'upload' ? (
              <label className="block">
                <span className="block text-xs font-medium text-neutral-600 mb-1">File backup (.dump / .backup)</span>
                <input
                  type="file"
                  accept=".dump,.backup"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm"
                />
                {file ? <span className="text-[11px] text-neutral-500">{fmtSize(file.size)}</span> : null}
              </label>
            ) : null}
            <label className="block">
              <span className="block text-xs font-medium text-neutral-600 mb-1">Master password</span>
              <input
                type="password"
                value={master}
                onChange={(e) => setMaster(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-400"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-neutral-600 mb-1">
                Ketik <b>RESTORE</b> untuk konfirmasi
              </span>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-red-400"
              />
            </label>
          </div>

          {progress !== null && start.isPending ? (
            <div className="mt-3">
              <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">Mengunggah… {progress}%</div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} disabled={start.isPending} className="px-4 py-2 text-sm rounded-lg border border-neutral-300">
              Batal
            </button>
            <button
              onClick={() => start.mutate()}
              disabled={!ready || start.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {start.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Restore sekarang
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
