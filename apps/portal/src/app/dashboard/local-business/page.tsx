'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Store,
  Loader2,
  Search,
  MapPin,
  Globe,
  MessageCircle,
  FileText,
  Trash2,
  X,
  User as UserIcon,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { useDebounce } from '@/lib/use-debounce';

type TipeBisnis = 'B2C' | 'B2B' | 'B2B2C';

interface JemaatLite {
  id: string;
  namaLengkap: string;
  fotoUrl: string | null;
  noHp: string | null;
  cabang: { id: string; nama: string };
}

interface SocialLink {
  platform: string;
  url: string;
}

interface BusinessItem {
  id: string;
  ownerJemaatId: string;
  nama: string;
  deskripsi: string | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  industri: string | null;
  tipeBisnis: TipeBisnis;
  isOnline: boolean;
  lokasi: string | null;
  websiteUrl: string | null;
  whatsappUrl: string | null;
  companyProfileUrl: string | null;
  socialLinks: SocialLink[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  owner: JemaatLite;
}

interface CabangLite {
  id: string;
  nama: string;
}

const TIPE_LABEL: Record<TipeBisnis, string> = {
  B2C: 'B2C',
  B2B: 'B2B',
  B2B2C: 'B2B2C',
};

const TIPE_COLOR: Record<TipeBisnis, string> = {
  B2C: 'bg-blue-100 text-blue-700',
  B2B: 'bg-purple-100 text-purple-700',
  B2B2C: 'bg-amber-100 text-amber-800',
};

export default function LocalBusinessPage() {
  const qc = useQueryClient();
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterCabangId, setFilterCabangId] = useState('');
  const [filterTipe, setFilterTipe] = useState<TipeBisnis | ''>('');
  const [filterIndustri, setFilterIndustri] = useState('');
  const [filterAktif, setFilterAktif] = useState<'true' | 'false' | ''>('');
  const [detailItem, setDetailItem] = useState<BusinessItem | null>(null);
  const [deleting, setDeleting] = useState<BusinessItem | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const debouncedIndustri = useDebounce(filterIndustri, 300);

  const listQ = useQuery({
    queryKey: [
      'local-business',
      { page, debouncedSearch, filterCabangId, filterTipe, debouncedIndustri, filterAktif },
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page,
        limit: 25,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterCabangId) params.cabangId = filterCabangId;
      if (filterTipe) params.tipeBisnis = filterTipe;
      if (debouncedIndustri) params.industri = debouncedIndustri;
      if (filterAktif) params.isActive = filterAktif;
      const res = await apiClient.get<{
        data: BusinessItem[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      }>('/admin/local-business', { params });
      return res.data;
    },
  });

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CabangLite[] }>('/admin/cabang', {
        params: { limit: 200 },
      });
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/local-business/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['local-business'] });
      toast.success('Bisnis dihapus (moderasi)');
      setDeleting(null);
      setDetailItem(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal hapus'),
  });

  const items = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  function resetFilter() {
    setSearch('');
    setFilterCabangId('');
    setFilterTipe('');
    setFilterIndustri('');
    setFilterAktif('');
    setPage(1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Store className="w-6 h-6" />
            Local Market
          </h1>
          <p className="text-neutral-500 mt-1">
            Direktori bisnis jemaat (UMKM). Owner CRUD lewat mobile app —
            portal admin hanya menampilkan list + delete moderasi.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            Cari nama / deskripsi / industri / owner
          </label>
          <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="flex-1 py-1.5 outline-none text-sm"
              placeholder="..."
            />
          </div>
        </div>
        <div className="w-44">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Cabang owner</label>
          <select
            value={filterCabangId}
            onChange={(e) => {
              setFilterCabangId(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white text-sm"
          >
            <option value="">Semua cabang</option>
            {(cabangQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Tipe</label>
          <select
            value={filterTipe}
            onChange={(e) => {
              setFilterTipe(e.target.value as TipeBisnis | '');
              setPage(1);
            }}
            className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white text-sm"
          >
            <option value="">Semua tipe</option>
            <option value="B2C">B2C</option>
            <option value="B2B">B2B</option>
            <option value="B2B2C">B2B2C</option>
          </select>
        </div>
        <div className="w-44">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Industri</label>
          <input
            type="text"
            value={filterIndustri}
            onChange={(e) => {
              setFilterIndustri(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            placeholder="F&B, IT, ..."
          />
        </div>
        <div className="w-32">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Status</label>
          <select
            value={filterAktif}
            onChange={(e) => {
              setFilterAktif(e.target.value as '' | 'true' | 'false');
              setPage(1);
            }}
            className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white text-sm"
          >
            <option value="">Semua</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </div>
        {(search || filterCabangId || filterTipe || filterIndustri || filterAktif) && (
          <button
            onClick={resetFilter}
            className="text-xs text-neutral-500 hover:text-neutral-900 underline"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Grid */}
      {listQ.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl text-center py-16 text-sm text-neutral-400 italic">
          Belum ada bisnis jemaat yang terdaftar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((b) => (
            <BusinessCard
              key={b.id}
              business={b}
              apiBase={apiBase}
              onOpen={() => setDetailItem(b)}
              onDelete={() => setDeleting(b)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-neutral-500">
          <div>
            Halaman {meta.page} dari {meta.totalPages} · {meta.total} total
          </div>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50 hover:bg-neutral-50 bg-white"
            >
              ←
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50 hover:bg-neutral-50 bg-white"
            >
              →
            </button>
          </div>
        </div>
      )}

      {detailItem && (
        <DetailModal
          business={detailItem}
          apiBase={apiBase}
          onClose={() => setDetailItem(null)}
          onDelete={() => setDeleting(detailItem)}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus bisnis (moderasi)?"
        itemName={deleting ? `${deleting.nama} (owner: ${deleting.owner.namaLengkap})` : undefined}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </div>
  );
}

function BusinessCard({
  business: b,
  apiBase,
  onOpen,
  onDelete,
}: {
  business: BusinessItem;
  apiBase: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition ${
        b.isActive ? 'border-neutral-200' : 'border-neutral-200 opacity-60'
      }`}
      onClick={onOpen}
    >
      <div className="relative">
        {b.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${apiBase}${b.heroImageUrl}`}
            alt={b.nama}
            className="w-full h-32 object-cover bg-neutral-100"
          />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center">
            <Store className="w-8 h-8 text-brand-400" />
          </div>
        )}
        {/* Logo overlay di sudut kiri-bawah hero — square dengan border putih. */}
        {b.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${apiBase}${b.logoUrl}`}
            alt={`${b.nama} logo`}
            className="absolute -bottom-4 left-3 w-12 h-12 rounded-lg object-cover bg-white border-2 border-white shadow-sm"
          />
        )}
      </div>
      <div className={`p-4 flex-1 flex flex-col gap-2 ${b.logoUrl ? 'pt-6' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-neutral-900 truncate flex-1">{b.nama}</h3>
          <span
            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${TIPE_COLOR[b.tipeBisnis]}`}
          >
            {TIPE_LABEL[b.tipeBisnis]}
          </span>
        </div>
        {b.industri && (
          <div className="text-xs text-neutral-500 -mt-1">{b.industri}</div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
          {b.isOnline ? (
            <>
              <Globe className="w-3 h-3" />
              Online{b.lokasi ? ` · ${b.lokasi}` : ''}
            </>
          ) : (
            <>
              <MapPin className="w-3 h-3" />
              {b.lokasi ?? '—'}
            </>
          )}
        </div>
        <div className="mt-auto pt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
          <Link
            href={`/dashboard/jemaat/${b.owner.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 min-w-0 hover:text-brand-600"
          >
            {b.owner.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${apiBase}${b.owner.fotoUrl}`}
                alt={b.owner.namaLengkap}
                className="w-5 h-5 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center shrink-0">
                <UserIcon className="w-3 h-3 text-neutral-500" />
              </div>
            )}
            <span className="text-xs text-neutral-600 truncate">{b.owner.namaLengkap}</span>
          </Link>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 hover:bg-red-50 rounded text-neutral-400 hover:text-red-600 shrink-0"
            title="Hapus (moderasi)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {!b.isActive && (
          <div className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
            Nonaktif (hidden dari Local Market mobile)
          </div>
        )}
      </div>
    </div>
  );
}

function DetailModal({
  business: b,
  apiBase,
  onClose,
  onDelete,
}: {
  business: BusinessItem;
  apiBase: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl pointer-events-auto max-h-[90vh] flex flex-col">
          {b.heroImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${apiBase}${b.heroImageUrl}`}
              alt={b.nama}
              className="w-full h-44 object-cover rounded-t-2xl"
            />
          )}
          <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-100 gap-3">
            {b.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${apiBase}${b.logoUrl}`}
                alt={`${b.nama} logo`}
                className={`w-14 h-14 rounded-lg object-cover bg-white shrink-0 ${b.heroImageUrl ? '-mt-12 border-2 border-white shadow-sm' : 'border border-neutral-200'}`}
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-neutral-900">{b.nama}</h2>
                <span
                  className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${TIPE_COLOR[b.tipeBisnis]}`}
                >
                  {TIPE_LABEL[b.tipeBisnis]}
                </span>
                {!b.isActive && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                    Nonaktif
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1 flex-wrap">
                {b.industri && <span>{b.industri}</span>}
                {b.isOnline ? (
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    Online{b.lokasi ? ` · ${b.lokasi}` : ''}
                  </span>
                ) : (
                  b.lokasi && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {b.lokasi}
                    </span>
                  )
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg ml-3 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-4">
            {/* Owner */}
            <Link
              href={`/dashboard/jemaat/${b.owner.id}`}
              className="flex items-center gap-3 hover:bg-neutral-50 rounded-lg p-2 -m-2"
            >
              {b.owner.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${apiBase}${b.owner.fotoUrl}`}
                  alt={b.owner.namaLengkap}
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
                  <UserIcon className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="font-medium text-neutral-900">{b.owner.namaLengkap}</div>
                <div className="text-xs text-neutral-500">{b.owner.cabang.nama}</div>
              </div>
            </Link>

            {b.deskripsi && (
              <div className="text-sm text-neutral-700 whitespace-pre-wrap bg-neutral-50 p-3 rounded-lg">
                {b.deskripsi}
              </div>
            )}

            {/* Links */}
            <div className="space-y-1.5">
              {b.websiteUrl && (
                <LinkRow icon={Globe} label="Website" url={b.websiteUrl} />
              )}
              {b.whatsappUrl && (
                <LinkRow icon={MessageCircle} label="WhatsApp" url={b.whatsappUrl} />
              )}
              {b.companyProfileUrl && (
                <LinkRow
                  icon={FileText}
                  label="Company Profile (PDF)"
                  url={`${apiBase}${b.companyProfileUrl}`}
                />
              )}
              {(b.socialLinks ?? []).map((s, i) => (
                <LinkRow key={i} icon={ExternalLink} label={s.platform} url={s.url} />
              ))}
            </div>
          </div>

          <div className="flex justify-between gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
              Hapus (moderasi)
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function LinkRow({
  icon: Icon,
  label,
  url,
}: {
  icon: typeof Globe;
  label: string;
  url: string;
}) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 text-sm text-brand-600 hover:underline truncate"
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium shrink-0">{label}:</span>
      <span className="truncate">{url}</span>
    </a>
  );
}
