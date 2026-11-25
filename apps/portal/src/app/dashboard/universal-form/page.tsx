'use client';

/**
 * Broadcast → Universal Form — daftar form isian (2026-12).
 * Form disematkan di News / Event / Announcement dan diisi jemaat di app.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ClipboardList, Copy, EyeOff, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { UF_FORM_STATUS_LABEL } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { STATUS_BADGE, errMsg, fmtWib } from '@/components/universal-form/types';

type Row = {
  id: string;
  judul: string;
  status: string;
  anonim: boolean;
  bukaAt: string | null;
  tutupAt: string | null;
  updatedAt: string;
  responseCount: number;
  embedCount: number;
  fieldCount: number;
};

const FILTERS = [
  { key: '', label: 'Semua' },
  { key: 'DRAFT', label: 'Draf' },
  { key: 'OPEN', label: 'Dibuka' },
  { key: 'CLOSED', label: 'Ditutup' },
  { key: 'ARCHIVED', label: 'Arsip' },
];

export default function UniversalFormListPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const list = useQuery({
    queryKey: ['uf-list', status, dq],
    queryFn: async () => (await apiClient.get<{ data: Row[] }>('/admin/universal-form', { params: { status: status || undefined, q: dq || undefined } })).data.data,
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'duplicate' | 'delete' }) =>
      action === 'delete' ? apiClient.delete(`/admin/universal-form/${id}`) : apiClient.post<{ data: { id: string } }>(`/admin/universal-form/${id}/duplicate`),
    onSuccess: (res, v) => {
      qc.invalidateQueries({ queryKey: ['uf-list'] });
      if (v.action === 'duplicate') {
        toast.success('Salinan dibuat sebagai Draf');
        const id = (res as { data?: { data?: { id?: string } } })?.data?.data?.id;
        if (id) router.push(`/dashboard/universal-form/${id}`);
      } else {
        toast.success('Form dihapus');
        setDeleting(null);
      }
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const rows = list.data ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-brand-500" /> Universal Form
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">Formulir isian yang disematkan di News, Event, dan Announcement — diisi jemaat di Els App.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <label className="flex flex-1 sm:flex-none items-center gap-2 px-3 h-9 border border-neutral-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-brand-500">
            <Search className="w-4 h-4 text-neutral-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul" className="text-sm outline-none w-full sm:w-40 min-w-0" />
          </label>
          <Link href="/dashboard/universal-form/new" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> Buat form
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${status === f.key ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {list.isLoading ? (
          <div className="py-14 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-sm text-neutral-500">
            Belum ada form.{' '}
            <Link href="/dashboard/universal-form/new" className="text-brand-600 font-semibold hover:underline">
              Buat yang pertama
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Judul</th>
                  <th className="text-left font-medium px-4 py-2 w-28">Status</th>
                  <th className="text-right font-medium px-4 py-2 w-24">Respons</th>
                  <th className="text-right font-medium px-4 py-2 w-28">Disematkan</th>
                  <th className="text-left font-medium px-4 py-2 w-44">Tutup</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/universal-form/${r.id}`} className="font-semibold text-neutral-900 hover:text-brand-600 hover:underline">
                        {r.judul}
                      </Link>
                      <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2">
                        {r.fieldCount} pertanyaan
                        {r.anonim ? (
                          <span className="inline-flex items-center gap-1 text-violet-700">
                            <EyeOff className="w-3 h-3" /> Anonim
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[r.status] ?? ''}`}>
                        {UF_FORM_STATUS_LABEL[r.status as keyof typeof UF_FORM_STATUS_LABEL] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/universal-form/${r.id}?tab=hasil`} className="font-semibold text-brand-700 hover:underline">
                        {r.responseCount.toLocaleString('id-ID')}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600">{r.embedCount} konten</td>
                    <td className="px-4 py-3 text-xs text-neutral-600">{r.tutupAt ? fmtWib(r.tutupAt) : 'Tanpa batas'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button title="Duplikat" onClick={() => act.mutate({ id: r.id, action: 'duplicate' })} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          title={r.responseCount ? 'Sudah ada respons — arsipkan saja' : 'Hapus'}
                          disabled={r.responseCount > 0}
                          onClick={() => setDeleting(r)}
                          className="p-1.5 rounded hover:bg-red-50 text-neutral-500 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDelete
        open={!!deleting}
        loading={act.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus form ini?"
        itemName={deleting?.judul}
        onConfirm={() => deleting && act.mutate({ id: deleting.id, action: 'delete' })}
      />
    </div>
  );
}
