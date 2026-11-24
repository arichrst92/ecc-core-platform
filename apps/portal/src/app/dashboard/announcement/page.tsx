'use client';

/**
 * Broadcast → Announcement — daftar pengumuman + status & laporan per kanal.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { BellRing, Copy, Loader2, Mail, MessageCircle, Plus, Search, Smartphone, Trash2, XCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { AnnouncementStatusBadge, type AnnouncementItem } from '@/components/announcement/types';

const FILTERS = [
  { key: '', label: 'Semua' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'SCHEDULED', label: 'Terjadwal' },
  { key: 'SENT', label: 'Terkirim' },
];

function audienceLabel(a: AnnouncementItem) {
  if (a.audienceMode === 'ALL') return 'Semua pemakai Els App';
  const parts = [
    a.cabangIds.length ? `${a.cabangIds.length} cabang` : null,
    a.areaIds.length ? `${a.areaIds.length} area` : null,
    a.homecellIds.length ? `${a.homecellIds.length} homecell` : null,
    a.jemaatIds.length ? `${a.jemaatIds.length} jemaat` : null,
  ].filter(Boolean);
  return `${parts.join(', ') || 'Belum ada saringan'}${parts.length > 1 ? (a.combine === 'AND' ? ' · semua cocok' : ' · salah satu') : ''}`;
}

export default function AnnouncementListPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [deleting, setDeleting] = useState<AnnouncementItem | null>(null);

  const list = useQuery({
    queryKey: ['announcements', status, dq],
    queryFn: async () =>
      (await apiClient.get<{ data: AnnouncementItem[] }>('/admin/announcement', { params: { status: status || undefined, q: dq || undefined, limit: 100 } }))
        .data.data,
    refetchInterval: (query) => ((query.state.data ?? []).some((a) => a.status === 'SENDING' || a.status === 'SCHEDULED') ? 15_000 : false),
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'duplicate' | 'cancel' | 'delete' }) => {
      if (action === 'delete') return apiClient.delete(`/admin/announcement/${id}`);
      return apiClient.post<{ data: AnnouncementItem }>(`/admin/announcement/${id}/${action}`);
    },
    onSuccess: (res, v) => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      if (v.action === 'duplicate') {
        toast.success('Salinan dibuat sebagai draft');
        const id = (res as { data?: { data?: AnnouncementItem } })?.data?.data?.id;
        if (id) router.push(`/dashboard/announcement/${id}`);
      } else if (v.action === 'cancel') toast.success('Jadwal dibatalkan — kembali jadi draft');
      else {
        toast.success('Announcement dihapus');
        setDeleting(null);
      }
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const rows = list.data ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <BellRing className="w-6 h-6 text-brand-500" /> Announcement
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">Pengumuman ke jemaat lewat app (popup + notifikasi), WhatsApp, dan email.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <label className="flex flex-1 sm:flex-none items-center gap-2 px-3 h-9 border border-neutral-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-brand-500">
            <Search className="w-4 h-4 text-neutral-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul" className="text-sm outline-none w-full sm:w-40 min-w-0" />
          </label>
          <Link
            href="/dashboard/announcement/new"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Announcement baru
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
            Belum ada announcement.{' '}
            <Link href="/dashboard/announcement/new" className="text-brand-600 font-semibold hover:underline">
              Buat yang pertama
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left font-medium px-4 py-2">Judul & penerima</th>
                <th className="text-left font-medium px-4 py-2 w-40">Status</th>
                <th className="text-left font-medium px-4 py-2 w-64">Laporan</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((a) => {
                const ch = new Set(a.channels);
                return (
                  <tr key={a.id} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/announcement/${a.id}`} className="font-semibold text-neutral-900 hover:text-brand-600 hover:underline">
                        {a.judul}
                      </Link>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {a.recipientCount ? `${a.recipientCount.toLocaleString('id-ID')} penerima · ` : ''}
                        {audienceLabel(a)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <AnnouncementStatusBadge a={a} />
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600 space-y-0.5">
                      {a.status === 'DRAFT' || a.status === 'SCHEDULED' ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <>
                          {ch.has('IN_APP') ? (
                            <div className="flex items-center gap-1.5">
                              <Smartphone className="w-3.5 h-3.5" /> {a.stats.inApp} · dibaca {a.stats.read}
                            </div>
                          ) : null}
                          {ch.has('WHATSAPP') ? (
                            <div className="flex items-center gap-1.5">
                              <MessageCircle className="w-3.5 h-3.5" /> {a.stats.wa.sent} terkirim
                              {a.stats.wa.pending ? ` · ${a.stats.wa.pending} antre` : ''}
                              {a.stats.wa.failed ? <span className="text-red-600"> · {a.stats.wa.failed} gagal</span> : null}
                            </div>
                          ) : null}
                          {ch.has('EMAIL') ? (
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5" /> {a.stats.email.sent} terkirim
                              {a.stats.email.pending ? ` · ${a.stats.email.pending} antre` : ''}
                              {a.stats.email.failed ? <span className="text-red-600"> · {a.stats.email.failed} gagal</span> : null}
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          title="Duplikat"
                          onClick={() => act.mutate({ id: a.id, action: 'duplicate' })}
                          className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {a.status === 'SCHEDULED' ? (
                          <button
                            title="Batalkan jadwal"
                            onClick={() => act.mutate({ id: a.id, action: 'cancel' })}
                            className="p-1.5 rounded hover:bg-amber-50 text-amber-600"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        ) : null}
                        {a.status !== 'SENDING' ? (
                          <button title="Hapus" onClick={() => setDeleting(a)} className="p-1.5 rounded hover:bg-red-50 text-neutral-500 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <ConfirmDelete
        open={!!deleting}
        loading={act.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus announcement ini?"
        itemName={deleting?.judul}
        onConfirm={() => deleting && act.mutate({ id: deleting.id, action: 'delete' })}
      />
    </div>
  );
}
