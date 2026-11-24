'use client';

/**
 * Permintaan Volunteer — approval permintaan bergabung ke ministry.
 * Per backend-request-ministry-join-approval.md (2026-10-12).
 *
 * Tampilan gabungan semua ministry yang bisa dikelola (Fulltimer: semua,
 * leader: ministry yang dipimpin) + filter per ministry via chip / ?pelayananId=.
 */
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Check,
  Inbox,
  Loader2,
  MessageSquareQuote,
  Phone,
  RotateCcw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { PelayananIcon } from '@/components/pelayanan/pelayanan-icon';
import { apiClient } from '@/lib/api-client';
import { usePersistentState } from '@/lib/use-persistent-state';

type Umur = 'all' | '3' | '7' | '14';
type Urut = 'oldest' | 'newest' | 'name';
const DAY = 86_400_000;
const filterCls = 'px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

interface Role {
  id: string;
  nama: string;
  level: number;
}

interface Ministry {
  id: string;
  nama: string;
  roles: Role[];
  pendingRequestCount: number;
}

interface JoinRequest {
  id: string;
  createdAt: string;
  motivasi: string | null;
  /** false = hanya boleh melihat (Role Access baca saja / di luar otoritas approval). */
  canProcess?: boolean;
  pelayanan: { id: string; nama: string; ikon?: string | null; warna?: string | null };
  requestedRole: Role | null;
  jemaat: {
    id: string;
    namaLengkap: string;
    kode: string | null;
    fotoUrl: string | null;
    noHp: string | null;
    cabang: { id: string; nama: string } | null;
  };
}

interface ListData {
  canManageAny: boolean;
  ministries: Ministry[];
  requests: JoinRequest[];
}

const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

function errMsg(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e.response?.data?.error?.message ?? e.message ?? 'Terjadi kesalahan';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${Math.max(m, 1)} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

export default function JoinRequestsPage() {
  return (
    <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-neutral-400" />}>
      <JoinRequestsContent />
    </Suspense>
  );
}

function JoinRequestsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const selected = params.get('pelayananId') ?? '';
  const [rejecting, setRejecting] = useState<JoinRequest | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Filter disimpan per tab → tetap terisi saat kembali dari detail jemaat.
  const [search, setSearch] = usePersistentState('joinreq:search', '');
  const [cabangId, setCabangId] = usePersistentState('joinreq:cabang', '');
  const [peran, setPeran] = usePersistentState('joinreq:peran', '');
  const [umur, setUmur] = usePersistentState<Umur>('joinreq:umur', 'all');
  const [urut, setUrut] = usePersistentState<Urut>('joinreq:urut', 'oldest');

  const q = useQuery({
    queryKey: ['ministry-join-requests', 'all'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ListData }>('/admin/ministry/join-requests');
      return res.data.data;
    },
  });

  const ministries = q.data?.ministries ?? [];
  const allRequests = useMemo(() => q.data?.requests ?? [], [q.data]);

  // Opsi filter diambil dari permintaan yang ada (hanya cabang/peran yang relevan).
  const cabangOpts = useMemo(() => {
    const m = new Map<string, { nama: string; n: number }>();
    for (const r of allRequests) {
      const k = r.jemaat.cabang?.id ?? 'none';
      const cur = m.get(k) ?? { nama: r.jemaat.cabang?.nama ?? 'Tanpa cabang', n: 0 };
      cur.n++;
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => a[1].nama.localeCompare(b[1].nama, 'id'));
  }, [allRequests]);
  const peranOpts = useMemo(
    () => [...new Set(allRequests.map((r) => r.requestedRole?.nama ?? '—'))].sort((a, b) => a.localeCompare(b, 'id')),
    [allRequests],
  );

  // Semua filter KECUALI pelayanan → dipakai untuk angka di chip pelayanan.
  const baseFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    const minAge = umur === 'all' ? 0 : Number(umur) * DAY;
    const now = Date.now();
    const list = allRequests.filter((r) => {
      if (cabangId && (r.jemaat.cabang?.id ?? 'none') !== cabangId) return false;
      if (peran && (r.requestedRole?.nama ?? '—') !== peran) return false;
      if (minAge && now - new Date(r.createdAt).getTime() < minAge) return false;
      if (term) {
        const hit =
          r.jemaat.namaLengkap.toLowerCase().includes(term) ||
          (r.jemaat.kode ?? '').toLowerCase().includes(term) ||
          (digits.length >= 4 && (r.jemaat.noHp ?? '').replace(/\D/g, '').includes(digits));
        if (!hit) return false;
      }
      return true;
    });
    return list.sort((a, b) =>
      urut === 'name'
        ? a.jemaat.namaLengkap.localeCompare(b.jemaat.namaLengkap, 'id')
        : (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * (urut === 'oldest' ? 1 : -1),
    );
  }, [allRequests, search, cabangId, peran, umur, urut]);
  const requests = selected ? baseFiltered.filter((r) => r.pelayanan.id === selected) : baseFiltered;
  const countByMinistry = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of baseFiltered) m.set(r.pelayanan.id, (m.get(r.pelayanan.id) ?? 0) + 1);
    return m;
  }, [baseFiltered]);
  const activeFilters = [search.trim(), cabangId, peran, umur !== 'all' ? umur : ''].filter(Boolean).length;
  const resetFilters = () => {
    setSearch('');
    setCabangId('');
    setPeran('');
    setUmur('all');
  };
  const overdue = allRequests.filter((r) => Date.now() - new Date(r.createdAt).getTime() >= 7 * DAY).length;
  const rolesByMinistry = new Map(ministries.map((m) => [m.id, m.roles]));

  function selectMinistry(id: string) {
    router.replace(id ? `/dashboard/pelayanan/join-requests?pelayananId=${id}` : '/dashboard/pelayanan/join-requests');
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ministry-join-requests'] });
    // Anggota & statistik pelayanan ikut berubah setelah disetujui.
    qc.invalidateQueries({ queryKey: ['pelayanan'] });
  };

  const approve = useMutation({
    mutationFn: async (v: { req: JoinRequest; roleId: string }) => {
      await apiClient.post(
        `/admin/ministry/${v.req.pelayanan.id}/join-requests/${v.req.id}/approve`,
        { roleId: v.roleId },
      );
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.req.jemaat.namaLengkap} bergabung ke ${v.req.pelayanan.nama}`);
      invalidate();
    },
    onError: (err) => {
      toast.error(errMsg(err));
      invalidate();
    },
  });

  const reject = useMutation({
    mutationFn: async (v: { req: JoinRequest; reason: string }) => {
      await apiClient.post(
        `/admin/ministry/${v.req.pelayanan.id}/join-requests/${v.req.id}/reject`,
        v.reason ? { reason: v.reason } : {},
      );
    },
    onSuccess: (_d, v) => {
      toast.success(`Permintaan ${v.req.jemaat.namaLengkap} ditolak`);
      setRejecting(null);
      invalidate();
    },
    onError: (err) => {
      toast.error(errMsg(err));
      invalidate();
    },
  });

  const totalPending = baseFiltered.length;
  const countOf = (m: Ministry) => (activeFilters ? countByMinistry.get(m.id) ?? 0 : m.pendingRequestCount);
  const selectedMinistry = ministries.find((m) => m.id === selected);
  // Chip: yang punya permintaan dulu; yang kosong disembunyikan kecuali "tampilkan semua".
  const chipMinistries = [...ministries]
    .filter((m) => showAll || countOf(m) > 0 || m.id === selected)
    .sort((a, b) => countOf(b) - countOf(a) || a.nama.localeCompare(b.nama, 'id'));
  const hiddenCount = ministries.length - chipMinistries.length;

  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-neutral-500 mb-3">
        <Link href="/dashboard/pelayanan" className="inline-flex items-center gap-1 hover:text-neutral-700">
          <ArrowLeft className="w-3.5 h-3.5" /> Pelayanan
        </Link>
        {selectedMinistry ? (
          <>
            <span>/</span>
            <Link href={`/dashboard/pelayanan/${selectedMinistry.id}`} className="hover:text-neutral-700">
              {selectedMinistry.nama}
            </Link>
          </>
        ) : null}
        <span>/ Permintaan Volunteer</span>
      </div>

      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 flex items-center gap-2 break-words">
            <UserPlus className="w-6 h-6 shrink-0" />
            Permintaan Volunteer{selectedMinistry ? ` · ${selectedMinistry.nama}` : ''}
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">
            Jemaat yang mengajukan bergabung ke pelayanan. Pilih peran lalu <b>Setujui</b>, atau <b>Tolak</b> dengan alasan (opsional).
            Pemohon mendapat notifikasi.
          </p>
        </div>
        {selectedMinistry ? (
          <Link
            href={`/dashboard/pelayanan/${selectedMinistry.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Kelola pelayanan ini
          </Link>
        ) : null}
      </div>

      {q.isLoading && (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      )}

      {q.isError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {errMsg(q.error)}
        </div>
      )}

      {q.data && !q.data.canManageAny && (
        <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center text-sm text-neutral-500">
          Anda belum menjadi koordinator (otoritas approval) pelayanan mana pun, jadi tidak ada permintaan yang bisa dikelola.
        </div>
      )}

      {q.data?.canManageAny && (
        <>
          {/* Filter pemohon */}
          <div className="bg-white border border-neutral-200 rounded-lg p-3 mb-3 flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-0 basis-56">
              <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Cari pemohon</span>
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-2 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nama, kode jemaat, atau no HP…"
                  className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
            <div>
              <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Cabang pemohon</span>
              <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={filterCls}>
                <option value="">Semua cabang</option>
                {cabangOpts.map(([id, c]) => (
                  <option key={id} value={id}>
                    {c.nama} ({c.n})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Peran diminta</span>
              <select value={peran} onChange={(e) => setPeran(e.target.value)} className={filterCls}>
                <option value="">Semua peran</option>
                {peranOpts.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Lama menunggu</span>
              <select value={umur} onChange={(e) => setUmur(e.target.value as Umur)} className={filterCls}>
                <option value="all">Semua</option>
                <option value="3">≥ 3 hari</option>
                <option value="7">≥ 7 hari</option>
                <option value="14">≥ 14 hari</option>
              </select>
            </div>
            <div>
              <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Urutkan</span>
              <select value={urut} onChange={(e) => setUrut(e.target.value as Urut)} className={filterCls}>
                <option value="oldest">Terlama dulu</option>
                <option value="newest">Terbaru dulu</option>
                <option value="name">Nama A–Z</option>
              </select>
            </div>
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-sm text-neutral-600 hover:bg-neutral-100"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset ({activeFilters})
              </button>
            )}
          </div>
          {overdue > 0 && umur === 'all' && (
            <button
              type="button"
              onClick={() => setUmur('7')}
              className="mb-3 w-full text-left text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 hover:bg-amber-100"
            >
              {overdue} permintaan sudah menunggu ≥ 7 hari — klik untuk menampilkannya.
            </button>
          )}

          {/* Filter chip per ministry */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            <Chip active={!selected} onClick={() => selectMinistry('')} label="Semua" count={totalPending} />
            {chipMinistries.map((m) => (
              <Chip
                key={m.id}
                active={selected === m.id}
                onClick={() => selectMinistry(m.id)}
                label={m.nama}
                count={countOf(m)}
              />
            ))}
            {hiddenCount > 0 || showAll ? (
              <button
                type="button"
                onClick={() => setShowAll((x) => !x)}
                className="shrink-0 px-3 py-1.5 rounded-full text-sm text-neutral-500 hover:text-neutral-800"
              >
                {showAll ? 'Sembunyikan yang kosong' : `+${hiddenCount} pelayanan tanpa permintaan`}
              </button>
            ) : null}
          </div>

          {requests.length === 0 ? (
            <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-12 text-center">
              <Inbox className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-500">
                {activeFilters > 0 && allRequests.length > 0
                  ? 'Tidak ada permintaan yang cocok dengan filter.'
                  : 'Tidak ada permintaan yang menunggu.'}
              </p>
              {activeFilters > 0 && allRequests.length > 0 && (
                <button type="button" onClick={resetFilters} className="mt-2 text-sm text-brand-600 hover:underline">
                  Reset filter
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r) => (
                <RequestCard
                  key={r.id}
                  req={r}
                  roles={rolesByMinistry.get(r.pelayanan.id) ?? []}
                  showMinistry={!selected}
                  busy={
                    (approve.isPending && approve.variables?.req.id === r.id) ||
                    (reject.isPending && reject.variables?.req.id === r.id)
                  }
                  onApprove={(roleId) => approve.mutate({ req: r, roleId })}
                  onReject={() => setRejecting(r)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {rejecting && (
        <RejectDialog
          req={rejecting}
          loading={reject.isPending}
          onClose={() => setRejecting(null)}
          onSubmit={(reason) => reject.mutate({ req: rejecting, reason })}
        />
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition ${
        active
          ? 'bg-brand-500 border-brand-500 text-white'
          : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'
      }`}
    >
      {label}
      <span
        className={`min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold inline-flex items-center justify-center ${
          active ? 'bg-white/25 text-white' : count > 0 ? 'bg-brand-100 text-brand-700' : 'bg-neutral-100 text-neutral-400'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function RequestCard({
  req,
  roles,
  showMinistry,
  busy,
  onApprove,
  onReject,
}: {
  req: JoinRequest;
  roles: Role[];
  showMinistry: boolean;
  busy: boolean;
  onApprove: (roleId: string) => void;
  onReject: () => void;
}) {
  const defaultRole = req.requestedRole?.id ?? roles[roles.length - 1]?.id ?? '';
  const [roleId, setRoleId] = useState(defaultRole);
  const foto = req.jemaat.fotoUrl
    ? /^https?:/.test(req.jemaat.fotoUrl)
      ? req.jemaat.fotoUrl
      : `${API_BASE}${req.jemaat.fotoUrl}`
    : null;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4">
      <div className="flex flex-col md:flex-row md:items-start gap-4">
        {/* Pemohon */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-11 h-11 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center shrink-0">
              {req.jemaat.namaLengkap.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/dashboard/jemaat/${req.jemaat.id}`}
                className="font-semibold text-neutral-900 hover:text-brand-600"
              >
                {req.jemaat.namaLengkap}
              </Link>
              {req.jemaat.kode && (
                <span className="text-[11px] font-mono text-neutral-400">#{req.jemaat.kode}</span>
              )}
            </div>
            <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
              {req.jemaat.cabang && <span>{req.jemaat.cabang.nama}</span>}
              {req.jemaat.noHp && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {req.jemaat.noHp}
                </span>
              )}
              <span className={Date.now() - new Date(req.createdAt).getTime() >= 7 * DAY ? 'text-amber-700 font-medium' : ''}>
                · {timeAgo(req.createdAt)}
              </span>
            </div>
            <div className="text-xs mt-2 flex items-center gap-2 flex-wrap">
              {showMinistry && (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                  <PelayananIcon ikon={req.pelayanan.ikon} warna={req.pelayanan.warna} size={16} />
                  {req.pelayanan.nama}
                </span>
              )}
              <span className="text-neutral-600">
                Minta peran: <strong>{req.requestedRole?.nama ?? '-'}</strong>
              </span>
            </div>
            {req.motivasi && (
              <p className="mt-2 text-sm text-neutral-700 bg-neutral-50 rounded-lg px-3 py-2 flex gap-2">
                <MessageSquareQuote className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                <span className="whitespace-pre-wrap break-words min-w-0">{req.motivasi}</span>
              </p>
            )}
          </div>
        </div>

        {/* Aksi */}
        {req.canProcess === false ? (
          <div className="md:w-60 shrink-0 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            Hanya lihat — memproses permintaan butuh akses <b>tulis</b> menu Permintaan Volunteer (Role Access) atau otoritas approval pelayanan ini.
          </div>
        ) : (
        <div className="flex flex-col gap-2 md:w-60 shrink-0">
          <label className="text-[11px] font-medium text-neutral-500">Tetapkan peran</label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            disabled={busy}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nama}
                {r.id === req.requestedRole?.id ? ' (diminta)' : ''}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !roleId}
              onClick={() => onApprove(roleId)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Setujui
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onReject}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              Tolak
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function RejectDialog({
  req,
  loading,
  onClose,
  onSubmit,
}: {
  req: JoinRequest;
  loading: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-neutral-900">Tolak permintaan</h2>
        <p className="text-sm text-neutral-500 mt-1">
          {req.jemaat.namaLengkap} → {req.pelayanan.nama}. Pemohon akan menerima notifikasi.
        </p>
        <label className="block mt-4">
          <span className="text-xs font-medium text-neutral-600">Alasan (opsional, maks 300)</span>
          <textarea
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            placeholder="Mis. kuota tim sedang penuh, silakan ajukan lagi bulan depan"
          />
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-neutral-100 text-neutral-700 text-sm font-medium"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onSubmit(reason.trim())}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Tolak
          </button>
        </div>
      </div>
    </div>
  );
}
