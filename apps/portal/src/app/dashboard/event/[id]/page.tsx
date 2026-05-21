'use client';

import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Megaphone,
  Calendar,
  MapPin,
  Loader2,
  Image as ImageIcon,
  Upload,
  Trash2,
  CircleDollarSign,
  Users,
  Plus,
  Check,
  X,
  User as UserIcon,
  QrCode,
  ExternalLink,
  ScanLine,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { EventMinistrySection } from '@/components/event/ministry-section';
import { DonationsSection } from '@/components/event/donations-section';
import { UploadHint } from '@/components/upload/upload-hint';

interface EventDetail {
  id: string;
  judul: string;
  slug: string;
  ringkasan: string | null;
  deskripsi: string;
  heroImageUrl: string | null;
  videoUrl: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  lokasi: string | null;
  sinode: { id: string; nama: string } | null;
  cabang: { id: string; nama: string } | null;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  nominal: string | null;
  qrisImageUrl: string | null;
  bankNama: string | null;
  bankNomor: string | null;
  bankAtasNama: string | null;
  quotaPeserta: number | null;
  tags: string[];
  butuhKehadiran: boolean;
  isPublished: boolean;
  pesertaCount: number;
}

type ParticipationStatus =
  | 'DAFTAR'
  | 'MENUNGGU_VERIFIKASI'
  | 'BAYAR'
  | 'HADIR'
  | 'BATAL';

interface Peserta {
  id: string;
  status: ParticipationStatus;
  nominalBayar: string | null;
  buktiTransferUrl: string | null;
  catatan: string | null;
  registeredAt: string;
  paidAt: string | null;
  attendedAt: string | null;
  cancelledAt: string | null;
  approvedAt: string | null;
  jemaat: {
    id: string;
    namaLengkap: string;
    noHp: string | null;
    fotoUrl: string | null;
    cabang: { id: string; nama: string } | null;
  };
  approver: { id: string; namaLengkap: string } | null;
}

const STATUS_LABEL: Record<ParticipationStatus, string> = {
  DAFTAR: 'Daftar',
  MENUNGGU_VERIFIKASI: 'Menunggu Verifikasi',
  BAYAR: 'Bayar',
  HADIR: 'Hadir',
  BATAL: 'Batal',
};
const STATUS_COLOR: Record<ParticipationStatus, string> = {
  DAFTAR: 'bg-neutral-100 text-neutral-700',
  MENUNGGU_VERIFIKASI: 'bg-amber-100 text-amber-700',
  BAYAR: 'bg-blue-100 text-blue-700',
  HADIR: 'bg-green-100 text-green-700',
  BATAL: 'bg-red-100 text-red-700',
};

function formatNominal(n: string | null): string {
  if (!n) return '-';
  const num = Number(n);
  if (!Number.isFinite(num)) return '-';
  return `Rp ${num.toLocaleString('id-ID')}`;
}

function formatTanggalShort(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;
  const qc = useQueryClient();
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  const [addPesertaOpen, setAddPesertaOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [deletingPeserta, setDeletingPeserta] = useState<Peserta | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | ParticipationStatus>('all');
  const heroFileRef = useRef<HTMLInputElement>(null);
  const qrisFileRef = useRef<HTMLInputElement>(null);

  const eventQ = useQuery({
    queryKey: ['event', 'detail', eventId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: EventDetail }>(`/admin/event/${eventId}`);
      return res.data.data;
    },
  });

  const pesertaQ = useQuery({
    queryKey: ['event', eventId, 'peserta', filterStatus],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Peserta[] }>(
        `/admin/event/${eventId}/peserta`,
        { params: { status: filterStatus === 'all' ? undefined : filterStatus } },
      );
      return res.data.data;
    },
  });

  // ===== Mutations =====

  const heroUploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('foto', file);
      return apiClient.post(`/admin/event/${eventId}/hero`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
      toast.success('Hero image diperbarui');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal upload'),
  });

  const heroDeleteMut = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/event/${eventId}/hero`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
      toast.success('Hero dihapus');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  const qrisUploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('foto', file);
      return apiClient.post(`/admin/event/${eventId}/qris`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
      toast.success('QRIS diperbarui');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal upload'),
  });

  const qrisDeleteMut = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/event/${eventId}/qris`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
      toast.success('QRIS dihapus');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  const updatePesertaMut = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiClient.patch(`/admin/event/${eventId}/peserta/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
      qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal update'),
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.post(`/admin/event/${eventId}/peserta/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
      toast.success('Bukti transfer di-approve');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal approve'),
  });

  const deletePesertaMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/admin/event/${eventId}/peserta/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
      qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
      toast.success('Peserta dihapus');
      setDeletingPeserta(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal hapus'),
  });

  if (eventQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  if (!eventQ.data) {
    return (
      <div className="text-center py-20 text-neutral-500">
        Event tidak ditemukan.
        <Link href="/dashboard/event" className="block mt-2 text-brand-600 hover:underline">
          ← Kembali ke daftar event
        </Link>
      </div>
    );
  }

  const e = eventQ.data;
  const peserta = pesertaQ.data ?? [];
  const isPaid = e.tipeBayar !== 'GRATIS';
  const targetLabel = e.cabang
    ? `Cabang · ${e.cabang.nama}`
    : e.sinode
      ? `Sinode · ${e.sinode.nama}`
      : 'Global';

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/event"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar event
      </Link>

      {/* Hero */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden mb-6">
        <div className="relative aspect-[3/1] bg-neutral-100">
          {e.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${apiBase}${e.heroImageUrl}`}
              alt={e.judul}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-neutral-300">
              <ImageIcon className="w-10 h-10" />
              <span className="text-xs mt-1">Belum ada hero</span>
            </div>
          )}
          <div className="absolute top-3 right-3 flex gap-2">
            <input
              ref={heroFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f) heroUploadMut.mutate(f);
                ev.target.value = '';
              }}
            />
            <button
              onClick={() => heroFileRef.current?.click()}
              className="px-2 py-1 text-xs font-medium bg-white/90 hover:bg-white text-neutral-800 rounded inline-flex items-center gap-1"
            >
              <Upload className="w-3 h-3" /> Ganti hero
            </button>
            {e.heroImageUrl && (
              <button
                onClick={() => heroDeleteMut.mutate()}
                className="px-2 py-1 text-xs font-medium bg-white/90 hover:bg-white text-red-600 rounded inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Hapus
              </button>
            )}
          </div>
          {!e.isPublished && (
            <span className="absolute top-3 left-3 text-[10px] font-semibold uppercase px-2 py-0.5 bg-neutral-700 text-white rounded">
              Draft
            </span>
          )}
        </div>

        <div className="px-6 pt-4">
          <UploadHint
            kind="hero-event"
            context={{
              judul: e.judul,
              deskripsi: e.deskripsi,
              ringkasan: e.ringkasan ?? undefined,
              tags: e.tags,
            }}
          />
        </div>

        <div className="p-6">
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-brand-500" />
            {e.judul}
          </h1>
          <div className="text-sm text-neutral-500 mt-1">{targetLabel}</div>
          {e.ringkasan && <p className="mt-3 text-neutral-700">{e.ringkasan}</p>}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <InfoBlock icon={Calendar} label="Tanggal">
              {formatTanggalShort(e.tanggalMulai)}
              {e.tanggalSelesai && e.tanggalSelesai !== e.tanggalMulai && (
                <> – {formatTanggalShort(e.tanggalSelesai)}</>
              )}
            </InfoBlock>
            {e.lokasi && (
              <InfoBlock icon={MapPin} label="Lokasi">
                {e.lokasi}
              </InfoBlock>
            )}
            <InfoBlock icon={Users} label="Peserta">
              {e.pesertaCount}
              {e.quotaPeserta != null ? ` / ${e.quotaPeserta}` : ''}
            </InfoBlock>
          </div>

          {e.videoUrl && (
            <div className="mt-3 text-sm">
              <a
                href={e.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand-600 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Video teaser
              </a>
            </div>
          )}

          {e.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {e.tags.map((t) => (
                <span
                  key={t}
                  className="inline-block px-2 py-0.5 text-[11px] bg-neutral-100 text-neutral-700 rounded"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          <details className="mt-4">
            <summary className="text-xs uppercase tracking-wider text-neutral-500 font-semibold cursor-pointer hover:text-neutral-700">
              Deskripsi lengkap
            </summary>
            <p className="mt-2 text-sm text-neutral-700 whitespace-pre-line">{e.deskripsi}</p>
          </details>
        </div>
      </div>

      {/* Pembayaran section */}
      {isPaid && (
        <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2 mb-3">
            <CircleDollarSign className="w-4 h-4 text-amber-600" />
            Info Pembayaran
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-2 text-sm">
              <Row label="Tipe">
                {e.tipeBayar === 'NOMINAL_TETAP'
                  ? 'Nominal Tetap'
                  : 'Sukarela / Bebas'}
              </Row>
              <Row label={e.tipeBayar === 'NOMINAL_BEBAS' ? 'Nominal minimum' : 'Nominal'}>
                {e.tipeBayar === 'NOMINAL_BEBAS' && !e.nominal
                  ? '(bebas)'
                  : formatNominal(e.nominal)}
              </Row>
              <Row label="Bank">{e.bankNama ?? '-'}</Row>
              <Row label="No. Rekening">{e.bankNomor ?? '-'}</Row>
              <Row label="Atas Nama">{e.bankAtasNama ?? '-'}</Row>
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 flex items-center gap-1">
                <QrCode className="w-3 h-3" /> QRIS
              </div>
              {e.qrisImageUrl ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${apiBase}${e.qrisImageUrl}`}
                    alt="QRIS"
                    className="w-48 h-48 object-contain border border-neutral-200 rounded"
                  />
                  <button
                    onClick={() => qrisDeleteMut.mutate()}
                    className="absolute top-1 right-1 p-1 bg-white/90 hover:bg-white rounded text-red-600"
                    title="Hapus QRIS"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="w-48 h-48 border border-dashed border-neutral-300 rounded flex items-center justify-center text-xs text-neutral-400">
                  Belum ada QRIS
                </div>
              )}
              <input
                ref={qrisFileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  if (f) qrisUploadMut.mutate(f);
                  ev.target.value = '';
                }}
              />
              <button
                onClick={() => qrisFileRef.current?.click()}
                className="mt-2 px-3 py-1.5 text-xs font-medium border border-neutral-300 hover:bg-neutral-50 rounded inline-flex items-center gap-1"
              >
                <Upload className="w-3 h-3" /> {e.qrisImageUrl ? 'Ganti QRIS' : 'Upload QRIS'}
              </button>
              <UploadHint kind="qris" />
            </div>
          </div>
        </div>
      )}

      {/* Donations / Payment History — untuk semua event paid */}
      {isPaid && (
        <DonationsSection
          eventId={eventId}
          eventTipeBayar={e.tipeBayar}
          eventNominal={e.nominal}
        />
      )}

      {/* Ministry & Volunteer (hanya untuk event yang butuh kehadiran) */}
      {e.butuhKehadiran && <EventMinistrySection eventId={eventId} />}

      {/* Peserta section */}
      <div className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Peserta ({e.pesertaCount})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {e.butuhKehadiran
                ? 'Event ini butuh kehadiran — gunakan tombol Check-in untuk scan QR jemaat.'
                : 'Jemaat yang berpartisipasi di event ini.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {e.butuhKehadiran && (
              <button
                onClick={() => setScannerOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg"
              >
                <ScanLine className="w-4 h-4" />
                Check-in
              </button>
            )}
            <button
              onClick={() => setAddPesertaOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
            >
              <Plus className="w-4 h-4" />
              Daftarkan Jemaat
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-neutral-100 flex items-center gap-2 text-xs">
          <span className="text-neutral-500">Filter:</span>
          <select
            value={filterStatus}
            onChange={(ev) => setFilterStatus(ev.target.value as typeof filterStatus)}
            className="px-2 py-1 border border-neutral-300 rounded bg-white"
          >
            <option value="all">Semua status</option>
            <option value="DAFTAR">Daftar</option>
            <option value="MENUNGGU_VERIFIKASI">Menunggu Verifikasi</option>
            <option value="BAYAR">Bayar</option>
            <option value="HADIR">Hadir</option>
            <option value="BATAL">Batal</option>
          </select>
        </div>

        <div className="p-6">
          {pesertaQ.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
          ) : peserta.length === 0 ? (
            <p className="text-sm text-neutral-400 italic text-center py-6">
              Belum ada peserta dengan filter ini.
            </p>
          ) : (
            <div className="space-y-2">
              {peserta.map((p) => (
                <PesertaRow
                  key={p.id}
                  p={p}
                  apiBase={apiBase}
                  isPaid={isPaid}
                  onApprove={() => approveMut.mutate(p.id)}
                  onChangeStatus={(status) =>
                    updatePesertaMut.mutate({ id: p.id, body: { status } })
                  }
                  onDelete={() => setDeletingPeserta(p)}
                  eventId={eventId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {addPesertaOpen && (
        <AddPesertaModal
          eventId={eventId}
          tipeBayar={e.tipeBayar}
          nominalDefault={e.nominal}
          onClose={() => setAddPesertaOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
            qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
            setAddPesertaOpen(false);
          }}
        />
      )}

      {scannerOpen && (
        <CheckinModal
          eventId={eventId}
          eventNama={e.judul}
          isPaid={isPaid}
          onClose={() => setScannerOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
            qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
          }}
        />
      )}

      <ConfirmDelete
        open={!!deletingPeserta}
        loading={deletePesertaMut.isPending}
        title="Hapus peserta?"
        itemName={deletingPeserta?.jemaat.namaLengkap}
        onClose={() => setDeletingPeserta(null)}
        onConfirm={() => deletingPeserta && deletePesertaMut.mutate(deletingPeserta.id)}
      />
    </div>
  );
}

// ============== Sub-components ==============

function InfoBlock({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Calendar;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-neutral-400 font-semibold">{label}</div>
      <div className="flex items-center gap-1.5 text-neutral-700 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span>{children}</span>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-100 pb-1.5">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-900 font-medium text-right">{children}</span>
    </div>
  );
}

function PesertaRow({
  p,
  apiBase,
  isPaid,
  eventId,
  onApprove,
  onChangeStatus,
  onDelete,
}: {
  p: Peserta;
  apiBase: string;
  isPaid: boolean;
  eventId: string;
  onApprove: () => void;
  onChangeStatus: (status: ParticipationStatus) => void;
  onDelete: () => void;
}) {
  const buktiRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const buktiUploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('foto', file);
      return apiClient.post(
        `/admin/event/${eventId}/peserta/${p.id}/bukti`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
      toast.success('Bukti transfer di-upload');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal upload'),
  });

  return (
    <div className="flex items-start gap-3 p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50">
      {p.jemaat.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}${p.jemaat.fotoUrl}`}
          alt={p.jemaat.namaLengkap}
          className="w-9 h-9 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
          <UserIcon className="w-4 h-4" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/dashboard/jemaat/${p.jemaat.id}`}
            className="font-medium text-neutral-900 hover:text-brand-600 hover:underline text-sm"
          >
            {p.jemaat.namaLengkap}
          </Link>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${STATUS_COLOR[p.status]}`}
          >
            {STATUS_LABEL[p.status]}
          </span>
        </div>
        <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
          {p.jemaat.cabang && <span>{p.jemaat.cabang.nama}</span>}
          {p.jemaat.noHp && <span>· {p.jemaat.noHp}</span>}
          <span>· Daftar {formatTanggalShort(p.registeredAt)}</span>
          {isPaid && p.nominalBayar && (
            <span>· {formatNominal(p.nominalBayar)}</span>
          )}
        </div>
        {p.catatan && (
          <div className="text-xs text-neutral-600 italic mt-1">{p.catatan}</div>
        )}
        {p.buktiTransferUrl && (
          <a
            href={`${apiBase}${p.buktiTransferUrl}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            <ExternalLink className="w-3 h-3" /> Lihat bukti transfer
          </a>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
        {isPaid && (
          <>
            <input
              ref={buktiRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                if (f) buktiUploadMut.mutate(f);
                ev.target.value = '';
              }}
            />
            <button
              onClick={() => buktiRef.current?.click()}
              className="px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded inline-flex items-center gap-1"
              title="Upload bukti transfer (mewakili jemaat)"
            >
              <Upload className="w-3 h-3" /> Bukti
            </button>
          </>
        )}
        {isPaid && p.status === 'MENUNGGU_VERIFIKASI' && (
          <button
            onClick={onApprove}
            className="px-2 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded inline-flex items-center gap-1"
          >
            <Check className="w-3 h-3" /> Approve
          </button>
        )}
        {p.status !== 'HADIR' && p.status !== 'BATAL' && (
          <button
            onClick={() => onChangeStatus('HADIR')}
            className="px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 rounded"
          >
            Hadir
          </button>
        )}
        {p.status !== 'BATAL' && (
          <button
            onClick={() => onChangeStatus('BATAL')}
            className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded"
          >
            Batal
          </button>
        )}
        <button
          onClick={onDelete}
          className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
          title="Hapus permanent"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ============== Add Peserta Modal ==============

interface JemaatLite {
  id: string;
  namaLengkap: string;
  noHp: string | null;
}

function AddPesertaModal({
  eventId,
  tipeBayar,
  nominalDefault,
  onClose,
  onSuccess,
}: {
  eventId: string;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  nominalDefault: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState('');
  const [jemaatId, setJemaatId] = useState('');
  const [nominal, setNominal] = useState<string>(
    tipeBayar === 'NOMINAL_TETAP' ? nominalDefault ?? '' : '',
  );
  const [catatan, setCatatan] = useState('');

  const searchQ = useQuery({
    queryKey: ['jemaat-search', search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const res = await apiClient.get<{ data: JemaatLite[] }>('/admin/jemaat', {
        params: { search, limit: 15 },
      });
      return res.data.data;
    },
  });

  const createMut = useMutation({
    mutationFn: async () =>
      apiClient.post(`/admin/event/${eventId}/peserta`, {
        jemaatId,
        nominalBayar:
          tipeBayar === 'GRATIS' ? undefined : nominal === '' ? undefined : Number(nominal),
        catatan: catatan || undefined,
      }),
    onSuccess: () => {
      toast.success('Peserta ditambahkan');
      onSuccess();
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal menambah peserta'),
  });

  const selected = (searchQ.data ?? []).find((j) => j.id === jemaatId);
  const isPaid = tipeBayar !== 'GRATIS';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Daftarkan Jemaat ke Event</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Cari Jemaat</span>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setJemaatId('');
                }}
                placeholder="Ketik nama / no HP (min 2 huruf)"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </label>
            {search.length >= 2 && (
              <div className="border border-neutral-200 rounded-lg max-h-40 overflow-y-auto">
                {searchQ.isLoading ? (
                  <div className="p-3 text-center text-sm text-neutral-400">
                    <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                  </div>
                ) : (searchQ.data ?? []).length === 0 ? (
                  <div className="p-3 text-center text-sm text-neutral-400">
                    Tidak ada jemaat ditemukan
                  </div>
                ) : (
                  (searchQ.data ?? []).map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setJemaatId(j.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 border-b border-neutral-100 last:border-0 ${
                        jemaatId === j.id ? 'bg-brand-50 text-brand-700 font-medium' : ''
                      }`}
                    >
                      <div>{j.namaLengkap}</div>
                      {j.noHp && <div className="text-xs text-neutral-500">{j.noHp}</div>}
                    </button>
                  ))
                )}
              </div>
            )}
            {selected && (
              <div className="text-xs px-3 py-2 bg-green-50 text-green-800 rounded-lg">
                ✓ Terpilih: <strong>{selected.namaLengkap}</strong>
              </div>
            )}

            {isPaid && (
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">
                  Nominal {tipeBayar === 'NOMINAL_BEBAS' && '(jemaat tentukan)'}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={nominal}
                  onChange={(e) => setNominal(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                />
              </label>
            )}

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Catatan (opsional)</span>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={2}
                placeholder="Mis. ukuran kaos L, makanan vegetarian"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={createMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={!jemaatId || createMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Daftarkan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============== Check-in Modal (scan QR / input kode jemaat) ==============

interface CheckinResult {
  ok: boolean;
  message: string;
  alreadyCheckedIn?: boolean;
  data?: {
    id: string;
    status: ParticipationStatus;
    jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  };
  needsForce?: boolean;
}

function CheckinModal({
  eventId,
  eventNama,
  isPaid,
  onClose,
  onSuccess,
}: {
  eventId: string;
  eventNama: string;
  isPaid: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const [kode, setKode] = useState('');
  const [history, setHistory] = useState<CheckinResult[]>([]);
  // Track kode terakhir yg butuh force untuk override
  const [pendingForce, setPendingForce] = useState<string | null>(null);

  // Auto-focus input — fokus kembali setelah setiap check-in supaya scanner
  // hardware bisa langsung kirim kode berikutnya tanpa klik.
  function focusInput() {
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const checkinMut = useMutation({
    mutationFn: async ({ kode, force }: { kode: string; force?: boolean }) => {
      const res = await apiClient.post<{
        data: CheckinResult['data'];
        meta?: { alreadyCheckedIn?: boolean };
      }>(`/admin/event/${eventId}/checkin`, { kode, force: force ?? false });
      return { data: res.data, kode };
    },
    onSuccess: ({ data, kode }) => {
      const isAlready = data.meta?.alreadyCheckedIn ?? false;
      const msg = isAlready
        ? `${data.data?.jemaat.namaLengkap} sudah check-in sebelumnya`
        : `${data.data?.jemaat.namaLengkap} berhasil check-in`;
      if (isAlready) toast(msg, { icon: 'ℹ️' });
      else toast.success(msg);
      setHistory((h) => [
        { ok: true, message: msg, alreadyCheckedIn: isAlready, data: data.data },
        ...h,
      ].slice(0, 20));
      setKode('');
      setPendingForce(null);
      onSuccess();
      focusInput();
    },
    onError: (err: any, vars) => {
      const status = err.response?.status;
      const errBody = err.response?.data?.error;
      const message = errBody?.message ?? 'Gagal check-in';
      // 409 dengan code CONSTRAINT atau hint force → tawarkan override
      const needsForce =
        status === 409 &&
        isPaid &&
        message.toLowerCase().includes('belum melakukan pembayaran');
      if (needsForce) {
        setPendingForce(vars.kode);
      } else {
        setKode('');
      }
      setHistory((h) => [
        { ok: false, message, needsForce },
        ...h,
      ].slice(0, 20));
      toast.error(message);
      focusInput();
    },
  });

  function submit(force?: boolean) {
    const k = (force && pendingForce ? pendingForce : kode).trim().toUpperCase();
    if (!k) return;
    checkinMut.mutate({ kode: k, force });
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <div>
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-green-600" />
                Check-in Kehadiran
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">{eventNama}</p>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Scan QR atau ketik kode jemaat
              </span>
              <span className="block text-[11px] text-neutral-500 mb-1">
                Scanner hardware otomatis ngirim Enter di akhir kode.
              </span>
              <input
                ref={inputRef}
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit(false);
                }}
                autoFocus
                placeholder="ABC23XYZ"
                disabled={checkinMut.isPending}
                className="mt-1 w-full px-4 py-3 border-2 border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-mono uppercase tracking-wider"
              />
            </label>

            {pendingForce && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p>
                      Kode <strong>{pendingForce}</strong> belum melakukan pembayaran.
                      Admin bisa override (mark HADIR walau belum BAYAR).
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => submit(true)}
                        disabled={checkinMut.isPending}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded"
                      >
                        Tetap check-in
                      </button>
                      <button
                        onClick={() => {
                          setPendingForce(null);
                          setKode('');
                          focusInput();
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 rounded"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => submit(false)}
                disabled={!kode.trim() || checkinMut.isPending || !!pendingForce}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
              >
                {checkinMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Check-in
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border-t border-neutral-100">
            <div className="px-6 py-3 text-xs uppercase tracking-wider text-neutral-500 font-semibold sticky top-0 bg-white border-b border-neutral-100">
              Riwayat sesi ini ({history.length})
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-neutral-400 italic text-center py-6 px-6">
                Belum ada scan.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-6 py-3 text-sm ${
                      h.ok
                        ? h.alreadyCheckedIn
                          ? 'bg-blue-50/30'
                          : 'bg-green-50/30'
                        : 'bg-red-50/30'
                    }`}
                  >
                    {h.ok && h.data?.jemaat ? (
                      h.data.jemaat.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${apiBase}${h.data.jemaat.fotoUrl}`}
                          alt={h.data.jemaat.namaLengkap}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                          <UserIcon className="w-4 h-4" />
                        </div>
                      )
                    ) : (
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          h.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {h.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-neutral-900 truncate">
                        {h.data?.jemaat.namaLengkap ?? 'Gagal'}
                      </div>
                      <div className={`text-xs ${h.ok ? 'text-neutral-500' : 'text-red-600'}`}>
                        {h.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-3 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Selesai
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
