'use client';

/**
 * Section Donations di event detail — admin view.
 *
 * Tampil untuk semua event berbayar (NOMINAL_TETAP + NOMINAL_BEBAS).
 * Untuk NOMINAL_BEBAS biasanya banyak donation per jemaat (fundraising
 * cicilan), untuk NOMINAL_TETAP biasanya 1 donation per peserta.
 *
 * Fitur:
 * - Fundraising progress card (totalAmountConfirmed dari aggregate BAYAR)
 * - Filter status (semua / menunggu / bayar / batal)
 * - List donation rows: jemaat info, nominal, status badge, paidAt, approver
 * - Actions per row: approve (kalau menunggu), upload bukti (admin), cancel
 * - Pagination
 *
 * Patch 2026-05-21l.
 */
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CircleDollarSign,
  Check,
  ExternalLink,
  Loader2,
  Upload,
  X,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

interface DonationRow {
  id: string;
  participationId: string;
  nominalBayar: string;
  buktiTransferUrl: string | null;
  status: 'MENUNGGU_VERIFIKASI' | 'BAYAR' | 'BATAL';
  catatan: string | null;
  paidAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  participation: {
    id: string;
    jemaat: {
      id: string;
      namaLengkap: string;
      noHp: string | null;
      fotoUrl: string | null;
    };
  };
  approver: {
    id: string;
    namaLengkap: string;
  } | null;
}

interface DonationsListResponse {
  data: DonationRow[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    totalAmountConfirmed: string | number;
  };
}

type StatusFilter = 'all' | 'MENUNGGU_VERIFIKASI' | 'BAYAR' | 'BATAL';

export function DonationsSection({
  eventId,
  eventTipeBayar,
  eventNominal,
}: {
  eventId: string;
  eventTipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  eventNominal: string | null;
}) {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [deletingDonation, setDeletingDonation] = useState<DonationRow | null>(null);

  const donationsQ = useQuery({
    queryKey: ['event', eventId, 'donations', filterStatus, page],
    queryFn: async () => {
      const res = await apiClient.get<DonationsListResponse>(
        `/admin/event/${eventId}/donations`,
        {
          params: {
            page,
            limit: 20,
            status: filterStatus === 'all' ? undefined : filterStatus,
          },
        },
      );
      return res.data;
    },
  });

  const approveMut = useMutation({
    mutationFn: async (donationId: string) =>
      apiClient.post(`/admin/event/${eventId}/donations/${donationId}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'donations'] });
      qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
      toast.success('Donation di-approve');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal approve'),
  });

  const cancelMut = useMutation({
    mutationFn: async (donationId: string) =>
      apiClient.delete(`/admin/event/${eventId}/donations/${donationId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'donations'] });
      qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
      toast.success('Donation dibatalkan');
      setDeletingDonation(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal cancel'),
  });

  const totalConfirmed = donationsQ.data?.meta.totalAmountConfirmed ?? 0;
  const totalConfirmedNum =
    typeof totalConfirmed === 'string' ? Number(totalConfirmed) : totalConfirmed;
  const minNominal = eventNominal ? Number(eventNominal) : 0;

  // Heuristic progress kalau NOMINAL_TETAP: per peserta yang sudah bayar.
  // Untuk NOMINAL_BEBAS: tampilkan amount apa adanya (no target).
  const isFundraising = eventTipeBayar === 'NOMINAL_BEBAS';

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <CircleDollarSign className="w-4 h-4 text-emerald-600" />
          {isFundraising ? 'Donations / Persembahan' : 'Payment History'}
        </h2>
        <FilterPills value={filterStatus} onChange={setFilterStatus} />
      </div>

      {/* Fundraising progress card */}
      <div className="mb-4 p-4 rounded-lg border border-emerald-100 bg-emerald-50/50">
        <div className="flex items-baseline gap-2">
          <span className="text-xs uppercase tracking-wider text-emerald-700 font-semibold">
            {isFundraising ? 'Total terkumpul' : 'Total pembayaran terkonfirmasi'}
          </span>
        </div>
        <div className="mt-1 text-2xl font-bold text-emerald-700">
          Rp {totalConfirmedNum.toLocaleString('id-ID')}
        </div>
        {donationsQ.data ? (
          <div className="text-xs text-emerald-700/80 mt-1">
            {donationsQ.data.meta.total} donation total
            {isFundraising ? null : minNominal > 0 ? ` · target per peserta Rp ${minNominal.toLocaleString('id-ID')}` : null}
          </div>
        ) : null}
      </div>

      {/* List */}
      {donationsQ.isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      ) : !donationsQ.data?.data || donationsQ.data.data.length === 0 ? (
        <div className="py-12 text-center text-neutral-400 text-sm">
          Belum ada donation dengan filter ini.
        </div>
      ) : (
        <div className="space-y-2">
          {donationsQ.data.data.map((d) => (
            <DonationRowItem
              key={d.id}
              donation={d}
              onApprove={() => approveMut.mutate(d.id)}
              onCancel={() => setDeletingDonation(d)}
              eventId={eventId}
              approving={approveMut.isPending}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {donationsQ.data && donationsQ.data.meta.totalPages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
          <span>
            Halaman {page} dari {donationsQ.data.meta.totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-30 hover:bg-neutral-50"
            >
              Prev
            </button>
            <button
              onClick={() =>
                setPage((p) => Math.min(donationsQ.data!.meta.totalPages, p + 1))
              }
              disabled={page >= donationsQ.data.meta.totalPages}
              className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-30 hover:bg-neutral-50"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {/* Confirm cancel */}
      <ConfirmDelete
        open={!!deletingDonation}
        title="Batalkan donation?"
        itemName={
          deletingDonation
            ? `Rp ${Number(deletingDonation.nominalBayar).toLocaleString('id-ID')} dari ${deletingDonation.participation.jemaat.namaLengkap}`
            : undefined
        }
        loading={cancelMut.isPending}
        onClose={() => setDeletingDonation(null)}
        onConfirm={() => deletingDonation && cancelMut.mutate(deletingDonation.id)}
      />
    </div>
  );
}

// =====================================================
//  Sub-components
// =====================================================

function FilterPills({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
}) {
  const opts: { v: StatusFilter; label: string }[] = [
    { v: 'all', label: 'Semua' },
    { v: 'MENUNGGU_VERIFIKASI', label: 'Menunggu' },
    { v: 'BAYAR', label: 'Bayar' },
    { v: 'BATAL', label: 'Batal' },
  ];
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Filter className="w-3 h-3 text-neutral-400" />
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2.5 py-1 text-xs font-medium rounded-full border transition ${
            value === o.v
              ? 'bg-brand-50 border-brand-200 text-brand-700'
              : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DonationRowItem({
  donation,
  eventId,
  onApprove,
  onCancel,
  approving,
}: {
  donation: DonationRow;
  eventId: string;
  onApprove: () => void;
  onCancel: () => void;
  approving: boolean;
}) {
  const buktiRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const buktiUploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('bukti', file);
      return apiClient.post(
        `/admin/event/${eventId}/donations/${donation.id}/bukti`,
        form,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'donations'] });
      toast.success('Bukti transfer ter-upload');
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal upload bukti'),
  });

  const isMenunggu = donation.status === 'MENUNGGU_VERIFIKASI';
  const isBayar = donation.status === 'BAYAR';
  const isBatal = donation.status === 'BATAL';

  return (
    <div
      className={`border rounded-lg p-3 flex items-start gap-3 ${
        isBatal ? 'bg-neutral-50 border-neutral-200 opacity-60' : 'border-neutral-200'
      }`}
    >
      {/* Avatar */}
      {donation.participation.jemaat.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}${donation.participation.jemaat.fotoUrl}`}
          alt={donation.participation.jemaat.namaLengkap}
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="font-medium text-neutral-900 text-sm">
              {donation.participation.jemaat.namaLengkap}
            </div>
            <div className="text-xs text-neutral-500">
              {donation.participation.jemaat.noHp ?? '(no HP -)'}
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-neutral-900">
              Rp {Number(donation.nominalBayar).toLocaleString('id-ID')}
            </div>
            <StatusBadge status={donation.status} />
          </div>
        </div>

        {donation.catatan ? (
          <div className="mt-1 text-xs text-neutral-600 italic">"{donation.catatan}"</div>
        ) : null}

        <div className="mt-2 flex items-center gap-3 flex-wrap text-xs">
          <span className="text-neutral-500">
            {formatTanggalSingkat(donation.createdAt)}
          </span>
          {donation.paidAt ? (
            <span className="text-emerald-700">
              · Dibayar {formatTanggalSingkat(donation.paidAt)}
            </span>
          ) : null}
          {donation.approver ? (
            <span className="text-neutral-500">
              · approved by {donation.approver.namaLengkap}
            </span>
          ) : null}
        </div>

        {donation.buktiTransferUrl ? (
          <a
            href={`${apiBase}${donation.buktiTransferUrl}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Lihat bukti transfer
          </a>
        ) : null}

        {/* Actions */}
        <div className="mt-2 flex flex-wrap gap-2">
          {!isBatal ? (
            <>
              <input
                ref={buktiRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                hidden
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  if (f) buktiUploadMut.mutate(f);
                  ev.target.value = '';
                }}
              />
              <button
                onClick={() => buktiRef.current?.click()}
                disabled={buktiUploadMut.isPending}
                className="px-2 py-1 text-xs font-medium border border-neutral-300 hover:bg-neutral-50 rounded inline-flex items-center gap-1 disabled:opacity-50"
              >
                {buktiUploadMut.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
                {donation.buktiTransferUrl ? 'Ganti bukti' : 'Upload bukti'}
              </button>
              {isMenunggu ? (
                <button
                  onClick={onApprove}
                  disabled={approving}
                  className="px-2 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Check className="w-3 h-3" /> Approve
                </button>
              ) : null}
              <button
                onClick={onCancel}
                className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded inline-flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Batal
              </button>
            </>
          ) : (
            <span className="text-xs text-neutral-400 italic">Donation dibatalkan</span>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DonationRow['status'] }) {
  const map = {
    MENUNGGU_VERIFIKASI: {
      icon: <Clock className="w-3 h-3" />,
      label: 'Menunggu',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    BAYAR: {
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: 'Bayar',
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    BATAL: {
      icon: <XCircle className="w-3 h-3" />,
      label: 'Batal',
      cls: 'bg-neutral-100 text-neutral-500 border-neutral-200',
    },
  };
  const s = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full border ${s.cls}`}
    >
      {s.icon} {s.label}
    </span>
  );
}

function formatTanggalSingkat(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
