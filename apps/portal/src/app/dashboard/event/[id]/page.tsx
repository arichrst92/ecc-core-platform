'use client';

import { ContentFormsTab } from '@/components/universal-form/embed';
import { ExportButtons } from '@/components/report/report-ui';
import { todayYmd } from '@/lib/dates';
import { QrCamera } from '@/components/ui/qr-camera';
import { useMenuAccess } from '@/lib/use-menu-access';
import { NeedsFillBadge } from '@/components/ui/needs-fill-badge';
import { jamZone, type CabangLabel } from '@/lib/tz-label';
import { ReviewPanel } from '@/components/reviews/review-panel';
import { WalkInGuestModal } from '@/components/tamu/walk-in-guest-modal';
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
  UserPlus,
  Camera,
  Search, Info, Receipt, HandHeart, ClipboardList, Star,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { JemaatSuggestions } from '@/components/jemaat-suggestions';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { EventMinistrySection } from '@/components/event/ministry-section';
import { DonationsSection } from '@/components/event/donations-section';
import { UploadHint } from '@/components/upload/upload-hint';
import { DuplicateEventButton } from '@/components/event/duplicate-event-button';

/** "15 menit sebelum mulai s.d. 30 menit setelah selesai" sesuai jendela event ini. */
function checkinWindowText(e: { checkinBukaMenit?: number | null; checkinTutupMenit?: number | null; checkinTutupAcuan?: string | null }) {
  const buka = e.checkinBukaMenit ?? 15;
  const tutup = e.checkinTutupMenit ?? 30;
  const acuan = e.checkinTutupAcuan === 'START' ? 'mulai' : 'selesai';
  return `${buka ? `${buka} menit sebelum mulai` : 'saat mulai'} s.d. ${tutup ? `${tutup} menit setelah ${acuan}` : `saat ${acuan}`}`;
}

interface EventDetail {
  checkinBukaMenit?: number | null;
  checkinTutupMenit?: number | null;
  checkinTutupAcuan?: string | null;
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
  cabang: { id: string; nama: string; timezone?: string } | null;
  jamMulai?: string | null;
  jamSelesai?: string | null;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  nominal: string | null;
  qrisImageUrl: string | null;
  bankNama: string | null;
  bankNomor: string | null;
  bankAtasNama: string | null;
  quotaPeserta: number | null;
  tags: string[];
  butuhKehadiran: boolean;
  allowSelfCheckin?: boolean;
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
    isTamu?: boolean;
    /** NEW_COMER | VISITOR | null (null = Visitor, sama dengan laporan event). */
    tamuKategori?: string | null;
    cabang: { id: string; nama: string } | null;
  };
  approver: { id: string; namaLengkap: string } | null;
  /** Tamu: pengundang (DIUNDANG) atau null untuk walk-in. */
  invitedBy?: { id: string; namaLengkap: string } | null;
  guestSource?: 'DIUNDANG' | 'WALK_IN' | null;
  /** 'PORTAL' = didaftarkan langsung oleh admin di Portal (ditandai walk-in). */
  addedVia?: string | null;
  checkinMethod?: string | null;
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
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [deletingPeserta, setDeletingPeserta] = useState<Peserta | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | ParticipationStatus>('all');
  // Hook HARUS sebelum early return (loading / tidak ditemukan) — React #310.
  const [pesertaSearch, setPesertaSearch] = useState('');
  // Tab bagian detail (Peserta / Pembayaran / Pelayanan / Ulasan) — supaya halaman tidak memanjang.
  const [tab, setTab] = useState<'peserta' | 'pembayaran' | 'pelayanan' | 'formulir' | 'ulasan'>('peserta');
  // Saring tamu (kotak "Tamu" di ringkasan): semua tamu / New Comer / Visitor.
  const [tamuFilter, setTamuFilter] = useState<'none' | 'all' | 'NEW_COMER' | 'VISITOR'>('none');
  // Pelayanan & volunteer (cache sama dengan EventMinistrySection) — untuk badge biru di tab.
  const pelayananQ = useQuery({
    queryKey: ['event', eventId, 'pelayanan'],
    queryFn: async () =>
      (
        await apiClient.get<{ data: { id: string; petugas: { canScanAttendance?: boolean }[] }[] }>(
          `/admin/event/${eventId}/pelayanan`,
        )
      ).data.data,
    enabled: !!eventId,
  });
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
    // Semua status sekaligus → ringkasan jumlah per status; filter status di klien.
    queryKey: ['event', eventId, 'peserta', 'all'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Peserta[] }>(`/admin/event/${eventId}/peserta`);
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

  const canVerify = useMenuAccess('event-payment', 'write');
  const approveMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.post(`/admin/event/${eventId}/peserta/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
      toast.success('Bukti transfer di-approve');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal approve'),
  });

  // Tolak bukti bayar → kembali "Daftar" + notifikasi alasan ke jemaat (unggah ulang).
  const rejectMut = useMutation({
    mutationFn: async ({ id, alasan }: { id: string; alasan: string }) =>
      apiClient.post(`/admin/event/${eventId}/peserta/${id}/reject-payment`, { alasan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
      toast.success('Bukti ditolak — jemaat diminta unggah ulang');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menolak bukti'),
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
  const pesertaAll = pesertaQ.data ?? [];
  // Ringkasan jumlah per status (dari semua peserta).
  const statusCount = pesertaAll.reduce(
    (acc, p) => ((acc[p.status] = (acc[p.status] ?? 0) + 1), acc),
    {} as Partial<Record<ParticipationStatus, number>>,
  );
  const aktifCount = pesertaAll.length - (statusCount.BATAL ?? 0);
  const tamuAktif = pesertaAll.filter((p) => p.jemaat.isTamu && p.status !== 'BATAL').length;
  const tamuHadir = pesertaAll.filter((p) => p.jemaat.isTamu && p.status === 'HADIR').length;
  // Kategori tamu: NEW_COMER, selain itu (termasuk belum ditentukan) = Visitor — sama dengan laporan event.
  const kategoriTamu = (p: Peserta): 'NEW_COMER' | 'VISITOR' => (p.jemaat.tamuKategori === 'NEW_COMER' ? 'NEW_COMER' : 'VISITOR');
  const tamuAktifList = pesertaAll.filter((p) => p.jemaat.isTamu && p.status !== 'BATAL');
  const newComerCount = tamuAktifList.filter((p) => kategoriTamu(p) === 'NEW_COMER').length;
  const visitorCount = tamuAktifList.length - newComerCount;
  const newComerHadir = tamuAktifList.filter((p) => kategoriTamu(p) === 'NEW_COMER' && p.status === 'HADIR').length;
  const visitorHadir = tamuHadir - newComerHadir;
  // Pelayanan & volunteer kosong / belum ada petugas scanner → badge biru di tab.
  const pelLinks = pelayananQ.data ?? [];
  const pelVolunteers = pelLinks.reduce((n, l) => n + l.petugas.length, 0);
  const pelScanners = pelLinks.reduce((n, l) => n + l.petugas.filter((v) => v.canScanAttendance).length, 0);
  const pelayananPerluDiisi = pelayananQ.isSuccess && (pelLinks.length === 0 || pelVolunteers === 0 || pelScanners === 0);
  const pelayananHint =
    pelLinks.length === 0
      ? 'Belum ada pelayanan yang bertugas di event ini'
      : pelVolunteers === 0
        ? 'Pelayanan sudah ditautkan tapi belum ada volunteer'
        : 'Belum ada petugas yang berwenang scan check-in';
  const pesertaNeedle = pesertaSearch.trim().toLowerCase();
  const pesertaDigits = pesertaSearch.replace(/\D/g, '');
  // Urutan: Hadir (check-in terbaru paling atas) → Lunas → Menunggu verifikasi → Daftar → Batal.
  const ORDER: Record<ParticipationStatus, number> = { HADIR: 0, BAYAR: 1, MENUNGGU_VERIFIKASI: 2, DAFTAR: 3, BATAL: 4 };
  const ts = (v: string | null) => (v ? Date.parse(v) : 0);
  const peserta = pesertaAll
    .filter((p) => filterStatus === 'all' || p.status === filterStatus)
    .filter((p) => tamuFilter === 'none' || (!!p.jemaat.isTamu && (tamuFilter === 'all' || kategoriTamu(p) === tamuFilter)))
    .filter(
      (p) =>
        !pesertaNeedle ||
        p.jemaat.namaLengkap.toLowerCase().includes(pesertaNeedle) ||
        (pesertaDigits.length >= 4 && (p.jemaat.noHp ?? '').replace(/\D/g, '').includes(pesertaDigits)),
    )
    .sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] ||
        (a.status === 'HADIR' ? ts(b.attendedAt) - ts(a.attendedAt) : ts(a.registeredAt) - ts(b.registeredAt)),
    );
  const isPaid = e.tipeBayar !== 'GRATIS';
  const audPel = (e as { audiencePelayanan?: { minLevel?: number | null; cabang?: { nama: string } | null; pelayanan: { nama: string } }[] }).audiencePelayanan ?? [];
  const targetLabel =
    (e.cabang ? `Cabang · ${e.cabang.nama}` : e.sinode ? `Sinode · ${e.sinode.nama}` : 'Global') +
    (audPel.length ? ` · Pelayanan ${audPel.map((a) => a.pelayanan.nama + (a.minLevel != null ? ` level ${a.minLevel}+` : '') + (a.cabang ? ` @ ${a.cabang.nama}` : '')).join(', ')}` : '');

  return (
    <div className="w-full">
      <Link
        href="/dashboard/event"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar event
      </Link>

      {/* ≥ 1280px: 2 kolom — kartu event (kiri, sticky) | tab (kanan). Lebih kecil → bertumpuk. */}
      <div className="xl:grid xl:grid-cols-[380px_minmax(0,1fr)] xl:gap-5 xl:items-start">
      <aside className="xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:rounded-xl">
      {/* Hero */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden mb-6 xl:mb-0">
        <div className="relative aspect-[16/9] sm:aspect-[3/1] xl:aspect-[16/9] bg-neutral-100">
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

        <div className="px-4 sm:px-6 pt-4">
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

        <div className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-xl sm:text-2xl xl:text-xl font-bold text-neutral-900 flex items-start gap-2 min-w-0 break-words">
              <Megaphone className="w-6 h-6 text-brand-500 shrink-0 mt-0.5" />
              <span className="min-w-0">{e.judul}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2">
              {/* Laporan event ini: ringkasan + daftar lengkap peserta (PDF / Excel). */}
              <ExportButtons
                endpoint={`/admin/event/${e.id}/export`}
                params={{}}
                filename={`event-${e.judul.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'event'}`}
              />
              <DuplicateEventButton eventId={e.id} judul={e.judul} variant="button" />
            </div>
          </div>
          <div className="text-sm text-neutral-500 mt-1 break-words">{targetLabel}</div>
          {e.ringkasan && <p className="mt-3 text-neutral-700 break-words">{e.ringkasan}</p>}

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-1 gap-3 text-sm">
            <InfoBlock icon={Calendar} label="Tanggal">
              {formatTanggalShort(e.tanggalMulai)}
              {e.tanggalSelesai && e.tanggalSelesai !== e.tanggalMulai && (
                <> – {formatTanggalShort(e.tanggalSelesai)}</>
              )}
              <div className="text-xs text-neutral-500 mt-0.5">{jamZone(e.jamMulai, e.jamSelesai, e.cabang?.timezone, e.cabang as CabangLabel)}</div>
            </InfoBlock>
            {e.lokasi && (
              <InfoBlock icon={MapPin} label="Lokasi">
                {e.lokasi}
              </InfoBlock>
            )}
            <InfoBlock icon={Users} label="Peserta">
              {e.pesertaCount}
              {e.quotaPeserta != null ? ` / ${e.quotaPeserta}` : ''}
              {e.quotaPeserta ? (
                <span className="block h-1.5 mt-1.5 rounded-full bg-neutral-100 overflow-hidden">
                  <span
                    className={`block h-full rounded-full ${e.pesertaCount >= e.quotaPeserta ? 'bg-red-500' : 'bg-gradient-to-r from-brand-500 to-brand-700'}`}
                    style={{ width: `${Math.min(100, Math.round((e.pesertaCount / e.quotaPeserta) * 100))}%` }}
                  />
                </span>
              ) : null}
            </InfoBlock>
            <InfoBlock icon={CircleDollarSign} label="Biaya">
              {e.tipeBayar === 'GRATIS' ? 'Gratis' : e.tipeBayar === 'NOMINAL_BEBAS' ? 'Sukarela' : `Rp ${Number(e.nominal ?? 0).toLocaleString('id-ID')}`}
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
            <p className="mt-2 text-sm text-neutral-700 whitespace-pre-line break-words [overflow-wrap:anywhere]">{e.deskripsi}</p>
          </details>
        </div>
      </div>

      </aside>

      <div className="min-w-0">
      {/* Tab bagian — Peserta · Pembayaran · Pelayanan & Volunteer · Ulasan */}
      {(() => {
        const items: { key: typeof tab; label: string; Icon: typeof Users; badge?: number; warn?: boolean; show: boolean; needsFill?: boolean }[] = [
          { key: 'peserta', label: 'Peserta', Icon: Users, badge: e.pesertaCount, show: true },
          { key: 'pembayaran', label: 'Pembayaran', Icon: Receipt, badge: statusCount.MENUNGGU_VERIFIKASI ?? 0, warn: true, show: isPaid },
          { key: 'pelayanan', label: 'Pelayanan & Volunteer', Icon: HandHeart, show: e.butuhKehadiran, needsFill: pelayananPerluDiisi },
          { key: 'formulir', label: 'Formulir', Icon: ClipboardList, show: true },
          { key: 'ulasan', label: 'Ulasan', Icon: Star, show: true },
        ];
        return (
          <div className="sticky top-0 z-20 -mx-3 sm:mx-0 px-3 sm:px-0 bg-neutral-50/95 backdrop-blur border-b border-neutral-200 mb-4 flex gap-1 overflow-x-auto" role="tablist">
            {items
              .filter((x) => x.show)
              .map((x) => (
                <button
                  key={x.key}
                  role="tab"
                  aria-selected={tab === x.key}
                  onClick={() => setTab(x.key)}
                  className={`inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${
                    tab === x.key ? 'border-brand-500 text-brand-700' : 'border-transparent text-neutral-500 hover:text-neutral-800'
                  }`}
                >
                  {/* Ikon tab dalam kotak: aktif = gradien brand, lainnya netral */}
                  <span
                    className={`w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0 ${
                      tab === x.key ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm' : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    <x.Icon className="w-3.5 h-3.5" />
                  </span>
                  {x.label}
                  {x.needsFill ? <NeedsFillBadge label="Perlu diisi" hint={pelayananHint} /> : null}
                  {x.badge ? (
                    <span
                      className={`text-[11px] font-bold px-1.5 rounded-full ${
                        x.warn ? 'bg-red-500 text-white' : tab === x.key ? 'bg-brand-100 text-brand-700' : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {x.badge}
                    </span>
                  ) : null}
                </button>
              ))}
          </div>
        );
      })()}

      {tab === 'peserta' ? (
        <>
      {/* Peserta section */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-neutral-100">
          <div className="min-w-0 flex-1 basis-64">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Peserta ({e.pesertaCount})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {e.butuhKehadiran
                ? e.allowSelfCheckin
                  ? `Event ini butuh kehadiran — scan QR jemaat, atau peserta self check-in dari aplikasi (${checkinWindowText(e)}).`
                  : 'Event ini butuh kehadiran — gunakan tombol Check-in untuk scan QR jemaat.'
                : 'Jemaat yang berpartisipasi di event ini.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {e.butuhKehadiran && (
              <button
                onClick={() => setWalkInOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg"
                title="Catat orang yang datang tanpa daftar"
              >
                <UserPlus className="w-4 h-4" />
                Tamu Walk-in
              </button>
            )}
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

        {/* Ringkasan jumlah per status — klik untuk menyaring daftar */}
        <div className="px-4 sm:px-6 py-3 border-b border-neutral-100 grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-7 xl:grid-cols-4 2xl:grid-cols-7 gap-2">
          {(
            [
              ['all', 'Terdaftar aktif', aktifCount, 'text-neutral-900', 'bg-neutral-50'],
              ...(e.butuhKehadiran ? [['HADIR', 'Hadir', statusCount.HADIR ?? 0, 'text-green-700', 'bg-green-50']] : []),
              ...(isPaid
                ? [
                    ['BAYAR', 'Lunas (belum hadir)', statusCount.BAYAR ?? 0, 'text-blue-700', 'bg-blue-50'],
                    ['MENUNGGU_VERIFIKASI', 'Menunggu verifikasi', statusCount.MENUNGGU_VERIFIKASI ?? 0, 'text-amber-700', 'bg-amber-50'],
                  ]
                : []),
              ['DAFTAR', isPaid ? 'Belum bayar' : e.butuhKehadiran ? 'Belum hadir' : 'Terdaftar', statusCount.DAFTAR ?? 0, 'text-neutral-700', 'bg-neutral-50'],
              ['BATAL', 'Batal', statusCount.BATAL ?? 0, 'text-red-700', 'bg-red-50'],
            ] as [typeof filterStatus, string, number, string, string][]
          ).map(([key, label, n, fg, bg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(filterStatus === key ? 'all' : key)}
              className={`text-left rounded-lg px-3 py-2 ${bg} ${filterStatus === key ? 'ring-2 ring-brand-400' : 'hover:ring-1 hover:ring-neutral-300'}`}
            >
              <div className={`text-lg font-bold leading-6 ${fg}`}>
                {n.toLocaleString('id-ID')}
                {key === 'HADIR' && aktifCount > 0 ? (
                  <span className="ml-1 text-xs font-semibold opacity-70">{Math.round((n / aktifCount) * 100)}%</span>
                ) : null}
              </div>
              <div className="text-[11px] text-neutral-600 leading-4">{label}</div>
            </button>
          ))}
          {/* Tamu (non-anggota) — klik untuk menampilkan tamu saja; New Comer / Visitor menyaring per kategori */}
          <div
            className={`rounded-lg bg-violet-50 overflow-hidden ${tamuFilter !== 'none' ? 'ring-2 ring-violet-400' : 'hover:ring-1 hover:ring-neutral-300'}`}
          >
            <button
              type="button"
              onClick={() => setTamuFilter((v) => (v === 'all' ? 'none' : 'all'))}
              className={`w-full text-left px-3 pt-2 pb-1 ${tamuFilter === 'all' ? 'bg-violet-100/70' : ''}`}
              title="Tamu (non-anggota) yang terdaftar & hadir — klik untuk menyaring"
            >
              <div className="text-lg font-bold leading-6 text-violet-700">
                {tamuAktif.toLocaleString('id-ID')}
                {e.butuhKehadiran ? <span className="ml-1 text-xs font-semibold opacity-70">{tamuHadir} hadir</span> : null}
              </div>
              <div className="text-[11px] text-neutral-600 leading-4">Tamu</div>
            </button>
            <div className="flex gap-1 px-2 pb-2">
              {(
                [
                  ['NEW_COMER', 'New Comers', newComerCount, newComerHadir, 'bg-emerald-100 text-emerald-800', 'ring-emerald-500'],
                  ['VISITOR', 'Visitor', visitorCount, visitorHadir, 'bg-sky-100 text-sky-800', 'ring-sky-500'],
                ] as const
              ).map(([k, label, n, h, cls, ring]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTamuFilter((v) => (v === k ? 'none' : k))}
                  className={`flex-1 min-w-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-left ${cls} ${tamuFilter === k ? `ring-2 ${ring}` : 'hover:opacity-80'}`}
                  title={`${label}${e.butuhKehadiran ? ` — ${h} hadir` : ''} · klik untuk menyaring`}
                >
                  <span className="block truncate">
                    {label} <span className="font-bold">{n.toLocaleString('id-ID')}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-2 text-xs">
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
          <select
            value={tamuFilter}
            onChange={(ev) => setTamuFilter(ev.target.value as typeof tamuFilter)}
            className="px-2 py-1 border border-neutral-300 rounded bg-white"
            aria-label="Filter tamu"
          >
            <option value="none">Semua peserta</option>
            <option value="all">Tamu ({tamuAktif})</option>
            <option value="NEW_COMER">New Comers ({newComerCount})</option>
            <option value="VISITOR">Visitor ({visitorCount})</option>
          </select>
          <div className="relative sm:ml-auto w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={pesertaSearch}
              onChange={(ev) => setPesertaSearch(ev.target.value)}
              placeholder="Cari nama / no HP peserta"
              className="w-full pl-8 pr-2 py-1 border border-neutral-300 rounded bg-white text-xs outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {pesertaNeedle ? <span className="text-neutral-500">{peserta.length} ditemukan</span> : null}
        </div>

        <div className="p-3 sm:p-6">
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
                  canVerify={canVerify}
                  onApprove={() => approveMut.mutate(p.id)}
                  onReject={() => {
                    const alasan = window.prompt('Alasan bukti ditolak (dikirim ke jemaat):', 'Bukti transfer tidak terbaca / nominal tidak sesuai');
                    if (alasan && alasan.trim().length >= 3) rejectMut.mutate({ id: p.id, alasan: alasan.trim() });
                  }}
                  onChangeStatus={(status) =>
                    updatePesertaMut.mutate({ id: p.id, body: { status } })
                  }
                  onDelete={() => setDeletingPeserta(p)}
                  eventId={eventId}
                  tz={e.cabang?.timezone}
                />
              ))}
            </div>
          )}
        </div>
      </div>

        </>
      ) : null}

      {tab === 'pembayaran' && isPaid ? (
        <>
      {/* Pembayaran section */}
      {isPaid && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-6 mb-6">
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2 mb-3">
            <CircleDollarSign className="w-4 h-4 text-amber-600" />
            Info Pembayaran
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-2 text-sm min-w-0">
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
              {/* Tanpa rekening & QRIS, jemaat tidak tahu ke mana harus membayar. */}
              {(() => {
                const fill = !e.qrisImageUrl;
                const v = (x: string | null) =>
                  x ?? (fill ? <NeedsFillBadge hint="Event berbayar tanpa rekening maupun QRIS — jemaat tidak tahu ke mana membayar. Isi lewat Edit event, atau unggah QRIS." /> : '-');
                return (
                  <>
                    <Row label="Bank">{v(e.bankNama)}</Row>
                    <Row label="No. Rekening">{v(e.bankNomor)}</Row>
                    <Row label="Atas Nama">{v(e.bankAtasNama)}</Row>
                  </>
                );
              })()}
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

        </>
      ) : null}

      {tab === 'pelayanan' ? (
        <div className="[&>section:first-child]:mt-0">
      {/* Ministry & Volunteer (hanya untuk event yang butuh kehadiran) */}
      {e.butuhKehadiran && <EventMinistrySection eventId={eventId} />}

        </div>
      ) : null}

      {tab === 'formulir' ? <ContentFormsTab sourceType="EVENT" sourceId={eventId} /> : null}

      {tab === 'ulasan' ? (
        <div className="[&>section:first-child]:mt-0">
      {/* Ulasan jemaat (rating dari tiket) */}
      <ReviewPanel kind="event" id={eventId} />

        </div>
      ) : null}

      </div>
      </div>

      {addPesertaOpen && (
        <AddPesertaModal
          eventId={eventId}
          tipeBayar={e.tipeBayar}
          nominalDefault={e.nominal}
          // Ditambahkan admin → langsung hadir bila event mencatat kehadiran & sudah hari-H.
          hadirNow={e.butuhKehadiran && e.tanggalMulai.slice(0, 10) <= todayYmd()}
          onClose={() => setAddPesertaOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
            qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
            setAddPesertaOpen(false);
          }}
        />
      )}

      {walkInOpen && (
        <WalkInGuestModal
          eventId={eventId}
          eventNama={e.judul}
          tipeBayar={e.tipeBayar}
          nominal={e.nominal}
          onClose={() => setWalkInOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['event', eventId, 'peserta'] });
            qc.invalidateQueries({ queryKey: ['event', 'detail', eventId] });
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
    <div className="flex items-start gap-2.5 min-w-0">
      <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white inline-flex items-center justify-center shrink-0 shadow-sm">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase text-neutral-400 font-semibold">{label}</div>
        <div className="text-neutral-800 font-medium mt-0.5 min-w-0 break-words">{children}</div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-3 border-b border-neutral-100 pb-1.5">
      <span className="text-neutral-500 shrink-0">{label}</span>
      <span className="text-neutral-900 font-medium text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

function PesertaRow({
  p,
  apiBase,
  isPaid,
  canVerify,
  eventId,
  onApprove,
  onReject,
  onChangeStatus,
  onDelete,
  tz,
}: {
  p: Peserta;
  apiBase: string;
  /** Zona waktu cabang event — jam check-in ditulis di zona ini. */
  tz?: string;
  isPaid: boolean;
  /** Role Access "Verifikasi Pembayaran Event" (tulis). */
  canVerify: boolean;
  eventId: string;
  onApprove: () => void;
  onReject: () => void;
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
    <div className="flex flex-wrap sm:flex-nowrap items-start gap-3 p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50">
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
            className="font-medium text-neutral-900 hover:text-brand-600 hover:underline text-sm break-words min-w-0"
          >
            {p.jemaat.namaLengkap}
          </Link>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${STATUS_COLOR[p.status]}`}
          >
            {STATUS_LABEL[p.status]}
          </span>
          {!p.jemaat.isTamu && (p.addedVia === 'PORTAL' || p.checkinMethod === 'WALK_IN') ? (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-800"
              title={p.addedVia === 'PORTAL' ? 'Didaftarkan langsung oleh admin di Portal' : 'Dicatat petugas di lokasi tanpa pendaftaran'}
            >
              Walk-in
            </span>
          ) : null}
          {p.jemaat.isTamu ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-violet-100 text-violet-700">
              {p.guestSource === 'WALK_IN'
                ? 'Tamu · walk-in'
                : p.invitedBy
                  ? `Tamu · dibawa ${p.invitedBy.namaLengkap}`
                  : 'Tamu'}
            </span>
          ) : null}
          {p.jemaat.isTamu ? (
            p.jemaat.tamuKategori === 'NEW_COMER' ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-800">New Comer</span>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-sky-100 text-sky-800">Visitor</span>
            )
          ) : null}
        </div>
        <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
          {p.jemaat.cabang && <span>{p.jemaat.cabang.nama}</span>}
          {p.jemaat.noHp && <span>· {p.jemaat.noHp}</span>}
          {p.status === 'HADIR' && p.attendedAt ? (
            <span className="font-semibold text-green-700">
              · Check-in{' '}
              {new Date(p.attendedAt).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                ...(tz ? { timeZone: tz } : {}),
              })}
            </span>
          ) : null}
          <span>· Daftar {formatTanggalShort(p.registeredAt)}</span>
          {isPaid && p.nominalBayar && (
            <span>· {formatNominal(p.nominalBayar)}</span>
          )}
        </div>
        {p.catatan && (
          <div className="text-xs text-neutral-600 italic mt-1 break-words">{p.catatan}</div>
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

      <div className="flex items-center gap-1 flex-wrap justify-end w-full sm:w-auto sm:shrink-0">
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
        {isPaid && canVerify && p.status === 'MENUNGGU_VERIFIKASI' && (
          <button
            onClick={onApprove}
            className="px-2 py-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded inline-flex items-center gap-1"
          >
            <Check className="w-3 h-3" /> Approve
          </button>
        )}
        {isPaid && canVerify && p.status === 'MENUNGGU_VERIFIKASI' && (
          <button
            onClick={onReject}
            className="px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 rounded"
            title="Tolak bukti — jemaat diminta unggah ulang"
          >
            Tolak bukti
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
  hadirNow,
  onClose,
  onSuccess,
}: {
  eventId: string;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  nominalDefault: string | null;
  /** Event mencatat kehadiran & sudah hari pelaksanaan → peserta langsung HADIR. */
  hadirNow: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState('');
  const [jemaatId, setJemaatId] = useState('');
  const [nominal, setNominal] = useState<string>(
    tipeBayar === 'NOMINAL_TETAP' ? nominalDefault ?? '' : '',
  );
  const [catatan, setCatatan] = useState('');
  const [pembayaran, setPembayaran] = useState<'TUNAI' | 'TRANSFER' | 'QRIS' | 'GRATIS'>('TUNAI');

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
        ...(hadirNow ? { hadir: true, ...(tipeBayar !== 'GRATIS' ? { pembayaran } : {}) } : {}),
      }),
    onSuccess: (r: any) => {
      toast.success(r?.data?.data?.status === 'HADIR' ? 'Peserta ditambahkan & tercatat hadir' : 'Peserta ditambahkan');
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
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100 flex-wrap gap-2">
            <h2 className="font-semibold text-neutral-900">Daftarkan Jemaat ke Event</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
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

            {hadirNow && isPaid && (
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Pembayaran diterima</span>
                <select
                  value={pembayaran}
                  onChange={(e) => setPembayaran(e.target.value as typeof pembayaran)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white"
                >
                  <option value="TUNAI">Tunai</option>
                  <option value="TRANSFER">Transfer</option>
                  <option value="QRIS">QRIS</option>
                  <option value="GRATIS">Gratis (dibebaskan)</option>
                </select>
              </label>
            )}
            <p className={`text-xs px-3 py-2 rounded-lg ${hadirNow ? 'bg-emerald-50 text-emerald-800' : 'bg-neutral-50 text-neutral-600'}`}>
              {hadirNow
                ? 'Peserta yang ditambahkan di sini langsung tercatat HADIR (metode Manual).'
                : 'Event belum dimulai / tidak mencatat kehadiran — peserta tercatat terdaftar.'}
            </p>

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
          <div className="flex justify-end gap-2 px-4 sm:px-6 py-4 border-t border-neutral-100 bg-neutral-50">
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
              {hadirNow ? 'Tambahkan & hadir' : 'Daftarkan'}
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
  // Scan QR lewat kamera laptop / HP (Portal 2026-11).
  const [camOn, setCamOn] = useState(false);
  const [history, setHistory] = useState<CheckinResult[]>([]);
  // Track kode terakhir yg butuh force untuk override
  const [pendingForce, setPendingForce] = useState<string | null>(null);
  const [forceMsg, setForceMsg] = useState('');

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
      if (isAlready) toast(msg, { icon: <Info className="w-4 h-4 text-sky-600 shrink-0" /> });
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
      // + pendaftaran sudah batal tapi orangnya datang (2026-11) → "Tetap check-in" mengaktifkan lagi.
      const needsForce =
        status === 409 &&
        ((isPaid && message.toLowerCase().includes('belum melakukan pembayaran')) ||
          message.toLowerCase().includes('sudah dibatalkan'));
      if (needsForce) {
        setPendingForce(vars.kode);
        setForceMsg(message);
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
          <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100 flex-wrap gap-2">
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

          <div className="p-4 sm:p-6 space-y-3 overflow-y-auto flex-1 min-h-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-neutral-700">Scan QR kartu / tiket jemaat</span>
              <button
                type="button"
                onClick={() => setCamOn((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                  camOn ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200' : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                <Camera className="w-3.5 h-3.5" /> {camOn ? 'Tutup kamera' : 'Scan pakai kamera'}
              </button>
            </div>
            {camOn ? (
              <QrCamera
                paused={checkinMut.isPending || !!pendingForce}
                onCode={(k) => {
                  setKode(k);
                  checkinMut.mutate({ kode: k, force: false });
                }}
              />
            ) : null}
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Atau ketik kode / nama / no HP jemaat
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
                placeholder="Kode QR / nama / no HP"
                disabled={checkinMut.isPending}
                className="mt-1 w-full px-4 py-3 border-2 border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg"
              />
            </label>

            {!pendingForce ? (
              <JemaatSuggestions
                query={kode}
                cabangId={null}
                onPick={(k) => {
                  setKode(k);
                  checkinMut.mutate({ kode: k, force: false });
                }}
              />
            ) : null}

            {pendingForce && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p>
                      Kode <strong>{pendingForce}</strong>: {forceMsg || 'belum melakukan pembayaran.'}
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
            <div className="px-4 sm:px-6 py-3 text-xs uppercase tracking-wider text-neutral-500 font-semibold sticky top-0 bg-white border-b border-neutral-100">
              Riwayat sesi ini ({history.length})
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-neutral-400 italic text-center py-6 px-4 sm:px-6">
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

          <div className="flex justify-end gap-2 px-4 sm:px-6 py-3 border-t border-neutral-100 bg-neutral-50">
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
