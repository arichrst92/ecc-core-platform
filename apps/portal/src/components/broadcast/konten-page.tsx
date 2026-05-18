'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Upload,
  Image as ImageIcon,
  X,
  Filter,
  Newspaper,
  BookOpen,
  Calendar,
  Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { useDebounce } from '@/lib/use-debounce';
import { dateLocal } from '@/lib/resources/render-helpers';

export type KontenTipe = 'news' | 'renungan';

interface KontenItem {
  id: string;
  judul: string;
  slug: string;
  ringkasan: string | null;
  konten: string;
  heroImageUrl: string | null;
  sinodeId: string | null;
  cabangId: string | null;
  tanggal: string | null;
  ayatAlkitab: string | null;
  tags: string[];
  isPublished: boolean;
  publishedAt: string | null;
  viewCount: number;
  createdAt: string;
  sinode: { id: string; nama: string } | null;
  cabang: { id: string; nama: string } | null;
  author: { jemaat: { namaLengkap: string; fotoUrl: string | null } | null } | null;
}

interface Sinode {
  id: string;
  nama: string;
}

interface CabangGereja {
  id: string;
  sinodeId: string;
  nama: string;
}

interface KontenPageProps {
  tipe: KontenTipe;
  title: string;
  icon: typeof Newspaper;
  description: string;
}

export function KontenPage({ tipe, title, icon: Icon, description }: KontenPageProps) {
  const qc = useQueryClient();
  const endpoint = `/admin/${tipe}`;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterPublished, setFilterPublished] = useState<'all' | 'published' | 'draft'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<KontenItem | null>(null);
  const [deleting, setDeleting] = useState<KontenItem | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const listQ = useQuery({
    queryKey: [tipe, page, debouncedSearch, filterPublished],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterPublished === 'published') params.isPublished = 'true';
      if (filterPublished === 'draft') params.isPublished = 'false';
      const res = await apiClient.get<{
        data: KontenItem[];
        meta: { page: number; totalPages: number; total: number };
      }>(endpoint, { params });
      return res.data;
    },
    placeholderData: (p) => p,
  });

  const publishMut = useMutation({
    mutationFn: async ({ id, publish }: { id: string; publish: boolean }) =>
      apiClient.patch(`${endpoint}/${id}`, { isPublished: publish }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [tipe] });
      toast.success('Status update');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`${endpoint}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [tipe] });
      toast.success('Dihapus');
      setDeleting(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const items = listQ.data?.data ?? [];
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Icon className="w-6 h-6" />
            {title}
          </h1>
          <p className="text-neutral-500 mt-1">{description}</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Tambah {tipe === 'news' ? 'News' : 'Renungan'}
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Cari judul..."
          className="flex-1 min-w-[240px] px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="inline-flex border border-neutral-300 rounded-lg overflow-hidden text-sm">
          {(['all', 'published', 'draft'] as const).map((v, i) => (
            <button
              key={v}
              onClick={() => {
                setFilterPublished(v);
                setPage(1);
              }}
              className={`px-3 py-1.5 font-medium ${
                filterPublished === v ? 'bg-brand-500 text-white' : 'text-neutral-600 hover:bg-neutral-50'
              } ${i > 0 ? 'border-l border-neutral-300' : ''}`}
            >
              {v === 'all' ? 'Semua' : v === 'published' ? 'Published' : 'Draft'}
            </button>
          ))}
        </div>
      </div>

      {listQ.isLoading ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center text-neutral-400">
          <Filter className="w-6 h-6 mx-auto mb-2 opacity-40" />
          Belum ada {tipe === 'news' ? 'news' : 'renungan'}.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((item) => (
            <KontenCard
              key={item.id}
              item={item}
              apiBase={apiBase}
              onEdit={() => setEditing(item)}
              onDelete={() => setDeleting(item)}
              onTogglePublish={() =>
                publishMut.mutate({ id: item.id, publish: !item.isPublished })
              }
            />
          ))}
        </div>
      )}

      {listQ.data && listQ.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-sm text-neutral-600 px-2">
            {listQ.data.meta.page} / {listQ.data.meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= listQ.data.meta.totalPages}
            className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg hover:bg-neutral-50 disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {(createOpen || editing) && (
        <KontenFormModal
          tipe={tipe}
          existing={editing}
          onClose={() => {
            setCreateOpen(false);
            setEditing(null);
          }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: [tipe] });
            setCreateOpen(false);
            setEditing(null);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title={`Hapus ${tipe === 'news' ? 'news' : 'renungan'}?`}
        itemName={deleting?.judul}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </div>
  );
}

// ============== Card ==============

function KontenCard({
  item,
  apiBase,
  onEdit,
  onDelete,
  onTogglePublish,
}: {
  item: KontenItem;
  apiBase: string;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
      {item.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}${item.heroImageUrl}`}
          alt={item.judul}
          className="w-full h-40 object-cover bg-neutral-100"
        />
      ) : (
        <div className="w-full h-40 bg-neutral-100 flex items-center justify-center text-neutral-300">
          <ImageIcon className="w-8 h-8" />
        </div>
      )}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-neutral-900 flex-1">{item.judul}</h3>
          <span
            className={`shrink-0 inline-block px-2 py-0.5 text-[10px] rounded-full font-medium ${
              item.isPublished ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {item.isPublished ? 'Published' : 'Draft'}
          </span>
        </div>
        {item.ringkasan && (
          <p className="text-sm text-neutral-600 mt-1 line-clamp-2">{item.ringkasan}</p>
        )}
        <div className="text-xs text-neutral-500 mt-2 flex items-center gap-2 flex-wrap">
          {item.tanggal && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {dateLocal(item.tanggal)}
            </span>
          )}
          {item.ayatAlkitab && <span>· {item.ayatAlkitab}</span>}
          {item.sinode && <span>· {item.sinode.nama}</span>}
          {item.cabang && <span>· {item.cabang.nama}</span>}
          {!item.sinode && !item.cabang && <span>· Global</span>}
        </div>
        {item.tags.length > 0 && (
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            <Tag className="w-3 h-3 text-neutral-400" />
            {item.tags.map((t) => (
              <span key={t} className="px-1.5 py-0.5 text-[10px] bg-brand-50 text-brand-700 rounded">
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto pt-3 flex items-center justify-between border-t border-neutral-100 mt-3">
          <div className="text-xs text-neutral-500">
            {item.author?.jemaat?.namaLengkap ?? 'Unknown'} ·{' '}
            <span className="font-mono">/{item.slug}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onTogglePublish}
              className={`p-1.5 rounded hover:bg-neutral-100 text-neutral-600 ${
                item.isPublished ? 'hover:text-amber-600' : 'hover:text-green-600'
              }`}
              title={item.isPublished ? 'Unpublish (jadi draft)' : 'Publish'}
            >
              {item.isPublished ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 hover:bg-brand-50 rounded text-neutral-600 hover:text-brand-600"
              title="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 hover:bg-red-50 rounded text-neutral-600 hover:text-red-600"
              title="Hapus"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============== Form Modal ==============

function KontenFormModal({
  tipe,
  existing,
  onClose,
  onSuccess,
}: {
  tipe: KontenTipe;
  existing: KontenItem | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!existing;
  const endpoint = `/admin/${tipe}`;
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [judul, setJudul] = useState(existing?.judul ?? '');
  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [ringkasan, setRingkasan] = useState(existing?.ringkasan ?? '');
  const [konten, setKonten] = useState(existing?.konten ?? '');
  const [sinodeId, setSinodeId] = useState(existing?.sinodeId ?? '');
  const [cabangId, setCabangId] = useState(existing?.cabangId ?? '');
  const [tanggal, setTanggal] = useState(
    existing?.tanggal ? new Date(existing.tanggal).toISOString().slice(0, 10) : '',
  );
  const [ayatAlkitab, setAyatAlkitab] = useState(existing?.ayatAlkitab ?? '');
  const [tagsInput, setTagsInput] = useState(existing?.tags.join(', ') ?? '');
  const [isPublished, setIsPublished] = useState(existing?.isPublished ?? false);
  const [heroPreview, setHeroPreview] = useState<string | null>(existing?.heroImageUrl ?? null);

  const sinodeQ = useQuery({
    queryKey: ['sinode', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Sinode[] }>('/admin/sinode', {
        params: { limit: 100 },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options', sinodeId],
    enabled: !!sinodeId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: CabangGereja[] }>('/admin/cabang', {
        params: { sinodeId, limit: 200 },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        judul,
        slug: slug || undefined,
        ringkasan: ringkasan || undefined,
        konten,
        sinodeId: sinodeId || undefined,
        cabangId: cabangId || undefined,
        tanggal: tanggal || undefined,
        ayatAlkitab: ayatAlkitab || undefined,
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        isPublished,
      };
      if (isEdit && existing) {
        const res = await apiClient.patch<{ data: KontenItem }>(`${endpoint}/${existing.id}`, payload);
        return res.data.data;
      }
      const res = await apiClient.post<{ data: KontenItem }>(endpoint, payload);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Tersimpan' : 'Dibuat');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const uploadHeroMut = useMutation({
    mutationFn: async (file: File) => {
      if (!existing) throw new Error('Save dulu sebelum upload hero image');
      const fd = new FormData();
      fd.append('foto', file);
      const res = await apiClient.post(`${endpoint}/${existing.id}/hero`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setHeroPreview(data.heroImageUrl);
      toast.success('Hero image ter-upload');
      qc.invalidateQueries({ queryKey: [tipe] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal upload'),
  });

  function handleHeroSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    uploadHeroMut.mutate(f);
    e.target.value = '';
  }

  const cabangFiltered = cabangQ.data ?? [];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900">
              {isEdit ? 'Edit' : 'Tambah'} {tipe === 'news' ? 'News' : 'Renungan'}
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-4">
            {/* Hero image */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Hero Image</label>
              {heroPreview ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroPreview.startsWith('http') ? heroPreview : `${apiBase}${heroPreview}`}
                    alt="Hero"
                    className="w-full h-48 object-cover rounded-lg bg-neutral-100"
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploadHeroMut.isPending}
                    className="absolute bottom-2 right-2 px-2 py-1 bg-white/90 hover:bg-white text-xs font-medium rounded shadow disabled:opacity-50"
                  >
                    {uploadHeroMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ganti'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!existing) {
                      toast.error('Simpan dulu, lalu upload hero image');
                      return;
                    }
                    fileRef.current?.click();
                  }}
                  disabled={uploadHeroMut.isPending}
                  className="w-full h-32 border-2 border-dashed border-neutral-300 hover:border-brand-400 rounded-lg flex flex-col items-center justify-center text-neutral-500 hover:text-brand-600 transition disabled:opacity-50"
                >
                  {uploadHeroMut.isPending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 mb-1" />
                      <span className="text-sm">
                        {existing ? 'Klik untuk upload' : 'Simpan dulu, lalu upload'}
                      </span>
                    </>
                  )}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleHeroSelect}
                className="hidden"
              />
            </div>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Judul <span className="text-red-500">*</span>
              </span>
              <input
                type="text"
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Slug (URL)</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Kosong = auto-generate dari judul"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Ringkasan</span>
              <textarea
                value={ringkasan}
                onChange={(e) => setRingkasan(e.target.value)}
                rows={2}
                placeholder="Preview pendek (max 500 char)"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Konten <span className="text-red-500">*</span>
                <span className="text-xs text-neutral-500 ml-1 font-normal">(Markdown)</span>
              </span>
              <textarea
                value={konten}
                onChange={(e) => setKonten(e.target.value)}
                rows={10}
                placeholder="# Heading&#10;&#10;Paragraph body dengan **bold** dan *italic*..."
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 font-mono text-sm"
              />
            </label>

            {tipe === 'renungan' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700">Tanggal Renungan</span>
                  <input
                    type="date"
                    value={tanggal}
                    onChange={(e) => setTanggal(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-neutral-700">Ayat Alkitab</span>
                  <input
                    type="text"
                    value={ayatAlkitab}
                    onChange={(e) => setAyatAlkitab(e.target.value)}
                    placeholder="Yohanes 3:16"
                    className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Sinode (target)</span>
                <select
                  value={sinodeId}
                  onChange={(e) => {
                    setSinodeId(e.target.value);
                    setCabangId('');
                  }}
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  <option value="">Global (semua sinode)</option>
                  {sinodeQ.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nama}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Cabang (opsional)</span>
                <select
                  value={cabangId}
                  onChange={(e) => setCabangId(e.target.value)}
                  disabled={!sinodeId}
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
                >
                  <option value="">Semua cabang di sinode</option>
                  {cabangFiltered.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nama}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Tags (pisahkan dengan koma)</span>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="iman, harapan, kasih"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="w-4 h-4 accent-brand-500"
              />
              <span>
                Publish sekarang{' '}
                <span className="text-xs text-neutral-500">(uncheck untuk simpan sebagai draft)</span>
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={saveMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={!judul.trim() || !konten.trim() || saveMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Simpan' : 'Buat'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
