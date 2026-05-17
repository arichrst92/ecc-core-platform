'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import {
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  FileText,
  Loader2,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface PreviewRow {
  rowIndex: number;
  raw: Record<string, string>;
  errors: string[];
  parsed: unknown;
  cabangId: string | null;
  cabangName: string | null;
  duplicateNoHp: boolean;
  duplicateEmail: boolean;
}

interface PreviewResponse {
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number };
}

export default function ImportJemaatPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [committed, setCommitted] = useState<{ insertedCount: number; errorCount: number; totalRows: number } | null>(null);

  const previewMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      const res = await apiClient.post<{ data: PreviewResponse }>('/admin/jemaat/import/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setPreview(data);
      setCommitted(null);
      toast.success(`Preview siap: ${data.summary.valid} valid, ${data.summary.invalid} error`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal preview'),
  });

  const commitMut = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('skipErrors', 'true');
      const res = await apiClient.post<{ data: { insertedCount: number; errorCount: number; totalRows: number } }>(
        '/admin/jemaat/import/commit',
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      setCommitted(data);
      toast.success(`${data.insertedCount} jemaat berhasil ditambah`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal commit'),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setCommitted(null);
    previewMut.mutate(f);
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function commit() {
    if (!file) return;
    commitMut.mutate(file);
  }

  return (
    <div>
      <Link
        href="/dashboard/jemaat"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar jemaat
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Import Jemaat dari CSV</h1>
          <p className="text-neutral-500 mt-1">
            Upload CSV untuk menambah banyak jemaat sekaligus. Format wajib mengikuti template.
          </p>
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_CORE_API_URL}/admin/jemaat/import/template`}
          className="flex items-center gap-2 px-4 py-2 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm font-medium"
          download
        >
          <Download className="w-4 h-4" />
          Download Template
        </a>
      </div>

      {/* Step 1: Upload */}
      {!preview && !committed && (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 mx-auto text-brand-400 mb-4" />
          <h2 className="text-lg font-semibold text-neutral-900">Upload CSV</h2>
          <p className="text-sm text-neutral-500 mt-2 mb-6 max-w-md mx-auto">
            Header CSV wajib: <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">nama_lengkap, no_hp, email, jenis_kelamin, tanggal_lahir, alamat, kode_cabang, tanggal_bergabung</code>
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={previewMut.isPending}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg"
          >
            {previewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {previewMut.isPending ? 'Mem-parse...' : 'Pilih File CSV'}
          </button>
        </div>
      )}

      {/* Step 2: Preview */}
      {preview && !committed && (
        <>
          <SummaryBar summary={preview.summary} onReset={reset} />

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-xs">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium" style={{ width: '50px' }}>#</th>
                    <th className="px-3 py-2 text-left font-medium" style={{ width: '60px' }}>Status</th>
                    <th className="px-3 py-2 text-left font-medium">Nama</th>
                    <th className="px-3 py-2 text-left font-medium">No HP</th>
                    <th className="px-3 py-2 text-left font-medium">Email</th>
                    <th className="px-3 py-2 text-left font-medium">Cabang</th>
                    <th className="px-3 py-2 text-left font-medium">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {preview.rows.map((row) => {
                    const hasError = row.errors.length > 0;
                    return (
                      <tr key={row.rowIndex} className={hasError ? 'bg-red-50/40' : ''}>
                        <td className="px-3 py-2 text-neutral-400 text-xs">{row.rowIndex}</td>
                        <td className="px-3 py-2">
                          {hasError ? (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-neutral-900">{row.raw.nama_lengkap || '-'}</td>
                        <td className="px-3 py-2 text-neutral-700">{row.raw.no_hp || '-'}</td>
                        <td className="px-3 py-2 text-neutral-700">{row.raw.email || '-'}</td>
                        <td className="px-3 py-2 text-neutral-700">
                          {row.cabangName ? (
                            <span>{row.cabangName} <span className="text-xs text-neutral-400">({row.raw.kode_cabang})</span></span>
                          ) : (
                            <span className="text-red-600 text-xs">{row.raw.kode_cabang || '?'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-red-700">
                          {row.errors.length > 0 ? row.errors.join('; ') : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={commit}
              disabled={commitMut.isPending || preview.summary.valid === 0}
              className="flex items-center gap-2 px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              {commitMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Commit {preview.summary.valid} jemaat valid
              {preview.summary.invalid > 0 && (
                <span className="text-xs opacity-80">(skip {preview.summary.invalid} error)</span>
              )}
            </button>
          </div>
        </>
      )}

      {/* Step 3: Result */}
      {committed && (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <CheckCircle2 className="w-16 h-16 mx-auto text-green-500 mb-4" />
          <h2 className="text-xl font-bold text-neutral-900">Import Selesai</h2>
          <div className="mt-4 inline-grid grid-cols-3 gap-6 text-sm">
            <Stat label="Total Row" value={committed.totalRows} />
            <Stat label="Berhasil" value={committed.insertedCount} color="text-green-600" />
            <Stat label="Di-skip" value={committed.errorCount} color="text-red-600" />
          </div>
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm font-medium"
            >
              Import lagi
            </button>
            <Link
              href="/dashboard/jemaat"
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-semibold"
            >
              Lihat Daftar Jemaat
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryBar({
  summary,
  onReset,
}: {
  summary: { total: number; valid: number; invalid: number };
  onReset: () => void;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-6 text-sm">
        <Stat label="Total Row" value={summary.total} />
        <Stat label="Valid" value={summary.valid} color="text-green-600" />
        <Stat label="Error" value={summary.invalid} color="text-red-600" />
      </div>
      <button onClick={onReset} className="text-sm text-neutral-500 hover:text-neutral-900">
        Pilih file lain
      </button>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${color ?? 'text-neutral-900'}`}>{value}</div>
      <div className="text-xs text-neutral-500 uppercase">{label}</div>
    </div>
  );
}
