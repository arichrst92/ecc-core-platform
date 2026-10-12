'use client';

/**
 * Permintaan Volunteer — approval permintaan bergabung ke ministry.
 * Per backend-request-ministry-join-approval.md (2026-10-12).
 *
 * Tampilan gabungan semua ministry yang bisa dikelola (Fulltimer: semua,
 * leader: ministry yang dipimpin) + filter per ministry via chip / ?pelayananId=.
 */
import { Suspense, useState } from 'react';
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
  UserPlus,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

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
  pelayanan: { id: string; nama: string };
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

  const q = useQuery({
    queryKey: ['ministry-join-requests', 'all'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ListData }>('/admin/ministry/join-requests');
      return res.data.data;
    },
  });

  const ministries = q.data?.ministries ?? [];
  const allRequests = q.data?.requests ?? [];
  const requests = selected ? allRequests.filter((r) => r.pelayanan.id === selected) : allRequests;
  const rolesByMinistry = new Map(ministries.map((m) => [m.id, m.roles]));

  function selectMinistry(id: string) {
    router.replace(id ? `/dashboard/pelayanan/join-requests?pelayananId=${id}` : '/dashboard/pelayanan/join-requests');
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ministry-join-requests'] });
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

  const totalPending = allRequests.length;

  return (
    <div>
      <Link
        href="/dashboard/pelayanan"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Master Pelayanan
      </Link>

      <div className="mb-5">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <UserPlus className="w-6 h-6" />
          Permintaan Volunteer
        </h1>
        <p className="text-neutral-500 mt-1 text-sm">
          Jemaat yang mengajukan bergabung ke ministry. Setujui dengan memilih peran, atau tolak.
        </p>
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
          Anda bukan leader ministry mana pun, jadi tidak ada permintaan yang bisa dikelola.
        </div>
      )}

      {q.data?.canManageAny && (
        <>
          {/* Filter chip per ministry */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            <Chip active={!selected} onClick={() => selectMinistry('')} label="Semua" count={totalPending} />
            {ministries.map((m) => (
              <Chip
                key={m.id}
                active={selected === m.id}
                onClick={() => selectMinistry(m.id)}
                label={m.nama}
                count={m.pendingRequestCount}
              />
            ))}
          </div>

          {requests.length === 0 ? (
            <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-12 text-center">
              <Inbox className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-500">Tidak ada permintaan yang menunggu.</p>
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
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
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
              <span>· {timeAgo(req.createdAt)}</span>
            </div>
            <div className="text-xs mt-2 flex items-center gap-2 flex-wrap">
              {showMinistry && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
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
                <span className="whitespace-pre-wrap">{req.motivasi}</span>
              </p>
            )}
          </div>
        </div>

        {/* Aksi */}
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
