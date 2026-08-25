'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Globe,
  HandHeart,
  Loader2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  User as UserIcon,
  Users,
  CalendarX,
  CalendarDays,
  RotateCcw,
  ScanLine,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { CheckinModal } from '@/components/checkin-modal';

interface Ibadah {
  id: string;
  nama: string;
  tipeJadwal: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  tanggalMulai: string;
  hari: string | null;
  jamMulai: string;
  jamSelesai: string;
  lokasi: string | null;
  isOnline: boolean;
  linkOnline: string | null;
  deskripsi: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string };
  kategoriIbadah?: { id: string; nama: string };
}

interface PelayananLite {
  id: string;
  nama: string;
  deskripsi: string | null;
}

interface IbadahPelayananLink {
  id: string;
  pelayanan: PelayananLite;
}

interface PetugasItem {
  id: string;
  catatan: string | null;
  // NULL = default (semua minggu); isi = override khusus tanggal itu.
  tanggalIbadah: string | null;
  // Apakah petugas ini berwenang scan QR kode jemaat untuk check-in.
  canScanAttendance: boolean;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  pelayananRole: { id: string; nama: string; level: number };
}

interface CancelledOccurrence {
  id: string;
  tanggalIbadah: string;
  status: 'CANCELLED';
  catatan: string | null;
  createdAt: string;
}

function formatTanggalLong(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const HARI_LABEL: Record<string, string> = {
  MINGGU: 'Minggu', SENIN: 'Senin', SELASA: 'Selasa', RABU: 'Rabu',
  KAMIS: 'Kamis', JUMAT: 'Jumat', SABTU: 'Sabtu',
};
const TIPE_LABEL: Record<string, string> = {
  WEEKLY: 'Mingguan', BIWEEKLY: 'Dua Mingguan', MONTHLY: 'Bulanan',
};

export default function IbadahDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const ibadahId = params.id;
  // Saat user datang dari kalender via ?tanggal=YYYY-MM-DD, default filter
  // petugas di-set ke tanggal tersebut supaya langsung relevan.
  const tanggalFromUrl = searchParams.get('tanggal');

  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [deletingLink, setDeletingLink] = useState<IbadahPelayananLink | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTanggal, setScannerTanggal] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );

  const ibadahQ = useQuery({
    queryKey: ['ibadah', 'detail', ibadahId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Ibadah }>(`/admin/ibadah/${ibadahId}`);
      return res.data.data;
    },
  });

  const linksQ = useQuery({
    queryKey: ['ibadah-pelayanan', ibadahId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: IbadahPelayananLink[] }>(
        `/admin/pelayanan/ibadah-link/ibadah/${ibadahId}`,
      );
      return res.data.data;
    },
  });

  const pelayananQ = useQuery({
    queryKey: ['pelayanan', 'options'],
    enabled: addLinkOpen,
    queryFn: async () => {
      const res = await apiClient.get<{ data: PelayananLite[] }>('/admin/pelayanan', {
        params: { limit: 100 },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  const linkMut = useMutation({
    mutationFn: async (pelayananId: string) =>
      apiClient.post('/admin/pelayanan/ibadah-link', { ibadahId, pelayananId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ibadah-pelayanan', ibadahId] });
      toast.success('Pelayanan ditautkan');
      setAddLinkOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const deleteLinkMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/pelayanan/ibadah-link/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ibadah-pelayanan', ibadahId] });
      toast.success('Tautan & semua petugas-nya dihapus');
      setDeletingLink(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  // List occurrence yang ditiadakan (CANCELLED) untuk ibadah ini.
  const cancelledQ = useQuery({
    queryKey: ['ibadah-cancelled', ibadahId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CancelledOccurrence[] }>(
        `/admin/ibadah/${ibadahId}/occurrence/cancelled`,
      );
      return res.data.data;
    },
  });

  const restoreMut = useMutation({
    mutationFn: async (tanggal: string) =>
      apiClient.delete(`/admin/ibadah/${ibadahId}/occurrence/${tanggal}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ibadah-cancelled', ibadahId] });
      qc.invalidateQueries({ queryKey: ['ibadah-calendar'] });
      toast.success('Tanggal dibuka kembali. Reservasi yang lama tetap CANCEL.');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal restore'),
  });

  if (ibadahQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  if (!ibadahQ.data) {
    return (
      <div className="text-center py-20 text-neutral-500">
        Ibadah tidak ditemukan.
        <Link href="/dashboard/ibadah" className="block mt-2 text-brand-600 hover:underline">
          ← Kembali ke daftar
        </Link>
      </div>
    );
  }

  const i = ibadahQ.data;
  const links = linksQ.data ?? [];
  const linkedIds = new Set(links.map((l) => l.pelayanan.id));
  const availablePelayanan = (pelayananQ.data ?? []).filter((p) => !linkedIds.has(p.id));

  return (
    <div className="w-full">
      <Link
        href="/dashboard/ibadah"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar ibadah
      </Link>

      {/* Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{i.nama}</h1>
            <div className="text-sm text-neutral-500 mt-1">
              {i.cabang?.nama && <span>{i.cabang.nama}</span>}
              {i.kategoriIbadah?.nama && <span> · {i.kategoriIbadah.nama}</span>}
              {!i.isActive && (
                <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-500">
                  Nonaktif
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={scannerTanggal}
                onChange={(ev) => setScannerTanggal(ev.target.value)}
                className="text-xs px-2 py-1 border border-neutral-300 rounded outline-none focus:ring-2 focus:ring-brand-500"
                title="Tanggal check-in"
              />
              <button
                onClick={() => setScannerOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                title="Scan QR kode jemaat"
              >
                <ScanLine className="w-4 h-4" />
                Check-in
              </button>
            </div>
            <button
              onClick={() => router.push(`/dashboard/ibadah`)}
              className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm"
            >
              Edit Ibadah
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <Info icon={Calendar} label="Jadwal">
            {TIPE_LABEL[i.tipeJadwal] ?? i.tipeJadwal}
            {i.hari && ` · ${HARI_LABEL[i.hari] ?? i.hari}`}
          </Info>
          <Info icon={Clock} label="Jam">
            {i.jamMulai} – {i.jamSelesai}
          </Info>
          <Info icon={Calendar} label="Mulai">
            {new Date(i.tanggalMulai).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
          </Info>
          {i.lokasi && (
            <Info icon={MapPin} label="Lokasi" full>
              {i.lokasi}
            </Info>
          )}
          {i.isOnline && i.linkOnline && (
            <Info icon={Globe} label="Streaming" full>
              <a href={i.linkOnline} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline truncate">
                {i.linkOnline}
              </a>
            </Info>
          )}
        </div>
        {i.deskripsi && (
          <p className="mt-4 text-sm text-neutral-600 border-t border-neutral-100 pt-3">{i.deskripsi}</p>
        )}
      </div>

      {/* Pelayanan section */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <HandHeart className="w-4 h-4" />
              Pelayanan yang Melayani
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Tim ministry + petugas spesifik yang serve di ibadah ini.
            </p>
          </div>
          <button
            onClick={() => setAddLinkOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Tambah Pelayanan
          </button>
        </div>

        <div className="p-6">
          {links.length === 0 ? (
            <p className="text-sm text-neutral-400 italic text-center py-6">
              Belum ada pelayanan yang dilink ke ibadah ini.
            </p>
          ) : (
            <div className="space-y-3">
              {links.map((link) => (
                <PelayananLinkCard
                  key={link.id}
                  link={link}
                  initialFocusTanggal={tanggalFromUrl}
                  onDelete={() => setDeletingLink(link)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Tanggal Ditiadakan section */}
      <section id="cancelled" className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <CalendarX className="w-4 h-4 text-red-600" />
              Tanggal Ditiadakan
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Occurrence ibadah recurring yang di-skip pada tanggal tertentu (mis. bertepatan dengan Natal).
              Tanggal di sini tidak muncul di kalender dan reservasinya otomatis dibatalkan.
            </p>
          </div>
        </div>
        <div className="p-6">
          {cancelledQ.isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
            </div>
          ) : (cancelledQ.data ?? []).length === 0 ? (
            <p className="text-sm text-neutral-400 italic text-center py-6">
              Tidak ada tanggal yang ditiadakan. Untuk meniadakan suatu minggu, buka kalender dan klik
              <strong> Tiadakan</strong> pada tanggal ibadah.
            </p>
          ) : (
            <div className="space-y-2">
              {(cancelledQ.data ?? []).map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-3 border border-red-100 bg-red-50/40 rounded-lg"
                >
                  <CalendarX className="w-4 h-4 text-red-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-900 text-sm">
                      {formatTanggalLong(c.tanggalIbadah)}
                    </div>
                    {c.catatan && (
                      <div className="text-xs text-neutral-600 mt-0.5 italic">
                        “{c.catatan}”
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() =>
                      restoreMut.mutate(c.tanggalIbadah.slice(0, 10))
                    }
                    disabled={restoreMut.isPending}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:bg-brand-50 px-2 py-1 rounded disabled:opacity-50"
                    title="Buka kembali tanggal ini"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Buka kembali
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {addLinkOpen && (
        <AddPelayananLinkModal
          available={availablePelayanan}
          loading={pelayananQ.isLoading}
          submitting={linkMut.isPending}
          onClose={() => setAddLinkOpen(false)}
          onAdd={(pelayananId) => linkMut.mutate(pelayananId)}
        />
      )}

      <ConfirmDelete
        open={!!deletingLink}
        loading={deleteLinkMut.isPending}
        onClose={() => setDeletingLink(null)}
        title="Hapus tautan pelayanan?"
        itemName={
          deletingLink ? `${deletingLink.pelayanan.nama} (semua petugas-nya juga akan dihapus)` : undefined
        }
        onConfirm={() => deletingLink && deleteLinkMut.mutate(deletingLink.id)}
      />

      {/* Scanner check-in kehadiran */}
      {scannerOpen && (
        <CheckinModal
          title="Check-in Kehadiran Ibadah"
          subtitle={`${i.nama} · ${new Date(scannerTanggal).toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}`}
          endpoint={`/admin/ibadah/${i.id}/checkin`}
          extraBody={{ tanggalIbadah: scannerTanggal }}
          forceTrigger={(msg) => msg.toLowerCase().includes('ditiadakan')}
          forceLabel="Tetap check-in (occurrence ditiadakan)"
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  );
}

// ============== Pelayanan Link Card (expandable dengan petugas) ==============

function PelayananLinkCard({
  link,
  initialFocusTanggal,
  onDelete,
}: {
  link: IbadahPelayananLink;
  initialFocusTanggal: string | null;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addPetugasOpen, setAddPetugasOpen] = useState(false);
  // tanggalIbadah yang sedang dipilih di modal Add (null = default)
  const [addModalDefaultTanggal, setAddModalDefaultTanggal] = useState<string | null>(
    initialFocusTanggal,
  );
  const [deletingPetugas, setDeletingPetugas] = useState<PetugasItem | null>(null);
  const qc = useQueryClient();
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  const petugasQ = useQuery({
    queryKey: ['petugas', link.id],
    enabled: expanded,
    queryFn: async () => {
      const res = await apiClient.get<{ data: PetugasItem[] }>(
        `/admin/pelayanan/ibadah-link/${link.id}/petugas`,
      );
      return res.data.data;
    },
  });

  const deletePetugasMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/pelayanan/petugas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['petugas', link.id] });
      toast.success('Petugas dihapus');
      setDeletingPetugas(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const toggleScanMut = useMutation({
    mutationFn: async ({
      id,
      canScanAttendance,
    }: {
      id: string;
      canScanAttendance: boolean;
    }) =>
      apiClient.patch(`/admin/pelayanan/petugas/${id}`, { canScanAttendance }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['petugas', link.id] });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const petugas = petugasQ.data ?? [];

  // Pisahkan default vs override per tanggal
  const defaultPetugas = petugas.filter((p) => p.tanggalIbadah === null);
  const overridesByDate = new Map<string, PetugasItem[]>();
  for (const p of petugas) {
    if (!p.tanggalIbadah) continue;
    const iso = p.tanggalIbadah.slice(0, 10);
    const arr = overridesByDate.get(iso) ?? [];
    arr.push(p);
    overridesByDate.set(iso, arr);
  }
  const overrideDates = Array.from(overridesByDate.keys()).sort();

  return (
    <div id="petugas" className="border border-neutral-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-3 bg-neutral-50">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-white/50 rounded-md px-1 py-0.5"
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-neutral-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-neutral-400" />
          )}
          <HandHeart className="w-4 h-4 text-brand-500 shrink-0" />
          <span className="font-medium text-neutral-900 truncate">{link.pelayanan.nama}</span>
          {defaultPetugas.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <Users className="w-3 h-3" />
              {defaultPetugas.length} default
            </span>
          )}
          {overrideDates.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-700">
              <CalendarDays className="w-3 h-3" />
              {overrideDates.length} override
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setExpanded(true);
              setAddModalDefaultTanggal(null);
              setAddPetugasOpen(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded"
          >
            <Plus className="w-3 h-3" />
            Tambah Petugas
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
            title="Unlink pelayanan (semua petugas ikut terhapus)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body: petugas list, grouped by default vs override per tanggal */}
      {expanded && (
        <div className="p-4 space-y-4">
          {petugasQ.isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
            </div>
          ) : petugas.length === 0 ? (
            <p className="text-sm text-neutral-400 italic text-center py-3">
              Belum ada petugas. Klik <strong>Tambah Petugas</strong> di atas.
            </p>
          ) : (
            <>
              {/* Default petugas — berlaku tiap minggu yang tidak punya override */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                    Petugas Default
                  </div>
                  <span className="text-[10px] text-neutral-400">
                    Berlaku tiap minggu yang tidak punya override
                  </span>
                </div>
                {defaultPetugas.length === 0 ? (
                  <p className="text-xs text-neutral-400 italic py-2">
                    Belum ada petugas default.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {defaultPetugas.map((p) => (
                      <PetugasRow
                        key={p.id}
                        p={p}
                        apiBase={apiBase}
                        onDelete={() => setDeletingPetugas(p)}
                        onToggleScan={() =>
                          toggleScanMut.mutate({
                            id: p.id,
                            canScanAttendance: !p.canScanAttendance,
                          })
                        }
                        togglePending={toggleScanMut.isPending}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Override per tanggal */}
              {overrideDates.map((iso) => {
                const items = overridesByDate.get(iso) ?? [];
                return (
                  <div key={iso} className="border-t border-neutral-100 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-xs uppercase tracking-wider text-amber-700 font-semibold">
                          Override · {formatTanggalLong(iso)}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setAddModalDefaultTanggal(iso);
                          setAddPetugasOpen(true);
                        }}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        + Tambah override
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {items.map((p) => (
                        <PetugasRow
                          key={p.id}
                          p={p}
                          apiBase={apiBase}
                          onDelete={() => setDeletingPetugas(p)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {addPetugasOpen && (
        <AddPetugasModal
          ibadahPelayananId={link.id}
          pelayanan={link.pelayanan}
          // Jangan kirim filter "sudah ada" karena petugas yang sama BOLEH muncul
          // di tanggal default + tanggal override yang berbeda. Filter dilakukan
          // di dalam modal berdasarkan kombinasi (jemaat, tanggal).
          existingPetugas={petugas}
          defaultTanggal={addModalDefaultTanggal}
          onClose={() => setAddPetugasOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['petugas', link.id] });
            setAddPetugasOpen(false);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deletingPetugas}
        loading={deletePetugasMut.isPending}
        onClose={() => setDeletingPetugas(null)}
        title="Hapus petugas ini?"
        itemName={
          deletingPetugas
            ? `${deletingPetugas.jemaat.namaLengkap}${
                deletingPetugas.tanggalIbadah
                  ? ` — override ${formatTanggalLong(deletingPetugas.tanggalIbadah)}`
                  : ' — default'
              }`
            : undefined
        }
        onConfirm={() => deletingPetugas && deletePetugasMut.mutate(deletingPetugas.id)}
      />
    </div>
  );
}

function PetugasRow({
  p,
  apiBase,
  onDelete,
  onToggleScan,
  togglePending,
}: {
  p: PetugasItem;
  apiBase: string;
  onDelete: () => void;
  onToggleScan?: () => void;
  togglePending?: boolean;
}) {
  const lvl = p.pelayananRole.level;
  const roleColor =
    lvl >= 10
      ? 'bg-brand-100 text-brand-800'
      : lvl >= 5
        ? 'bg-amber-100 text-amber-800'
        : lvl < 0
          ? 'bg-neutral-100 text-neutral-500'
          : 'bg-blue-50 text-blue-700';
  return (
    <div
      className={`flex items-center gap-2.5 p-2.5 border rounded-md ${
        p.canScanAttendance
          ? 'border-green-200 bg-green-50/30'
          : 'border-neutral-100 hover:bg-neutral-50'
      }`}
    >
      {p.jemaat.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}${p.jemaat.fotoUrl}`}
          alt={p.jemaat.namaLengkap}
          className="w-8 h-8 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
          <UserIcon className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link
            href={`/dashboard/jemaat/${p.jemaat.id}`}
            className="font-medium text-neutral-900 hover:text-brand-600 hover:underline text-sm truncate"
          >
            {p.jemaat.namaLengkap}
          </Link>
          {p.canScanAttendance && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase bg-green-600 text-white px-1.5 py-0.5 rounded">
              <ShieldCheck className="w-3 h-3" />
              Scanner
            </span>
          )}
        </div>
        <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded ${roleColor}`}>
          {p.pelayananRole.nama}
        </span>
        {p.catatan && <span className="text-xs text-neutral-500 italic block mt-0.5">{p.catatan}</span>}
      </div>
      {onToggleScan && (
        <button
          onClick={onToggleScan}
          disabled={togglePending}
          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded disabled:opacity-50 shrink-0 ${
            p.canScanAttendance
              ? 'text-green-700 bg-green-100 hover:bg-green-200'
              : 'text-neutral-600 hover:bg-neutral-100 border border-neutral-300'
          }`}
          title={
            p.canScanAttendance ? 'Cabut wewenang scan' : 'Beri wewenang scan check-in'
          }
        >
          <ShieldCheck className="w-3 h-3" />
          {p.canScanAttendance ? 'Bisa Scan' : 'Beri akses'}
        </button>
      )}
      <button
        onClick={onDelete}
        className="p-1 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600 shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============== Add Petugas Modal ==============

// ===== Member pelayanan (dari JemaatPelayanan junction) =====
interface PelayananMember {
  id: string;                  // jemaatPelayanan.id
  isActive: boolean;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  pelayananRole: { id: string; nama: string; level: number };
}

interface PelayananDetail {
  id: string;
  nama: string;
  roles: { id: string; nama: string; level: number }[];
  jemaatPelayanan: PelayananMember[];
}

/**
 * Add Petugas Modal — berbasis member pelayanan tsb.
 *
 * Flow:
 *   1. Load detail pelayanan → ambil active members + roles
 *   2. Filter member yang sudah jadi petugas di ibadah-pelayanan ini (existingJemaatIds)
 *   3. Tampilkan list dengan checkbox + dropdown role (default = role mereka di pelayanan)
 *   4. Submit batch: loop POST /admin/pelayanan/petugas per ceklis
 *
 * Kalau jemaat yang mau diassign belum jadi member pelayanan, harus tambah dulu
 * via halaman detail jemaat → section Pelayanan. Ini enforce konsistensi
 * "petugas ibadah-pelayanan harus dari member pelayanan tsb".
 */
function AddPetugasModal({
  ibadahPelayananId,
  pelayanan,
  existingPetugas,
  defaultTanggal,
  onClose,
  onSuccess,
}: {
  ibadahPelayananId: string;
  pelayanan: PelayananLite;
  existingPetugas: PetugasItem[];
  defaultTanggal: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  // Mode: 'default' (NULL, tiap minggu) atau 'date' (override khusus tanggal)
  const [mode, setMode] = useState<'default' | 'date'>(defaultTanggal ? 'date' : 'default');
  const [tanggal, setTanggal] = useState<string>(defaultTanggal ?? '');
  // Map jemaatId → { selected, roleId }
  // Map jemaatId → { roleId, canScan }. canScan default false.
  const [selected, setSelected] = useState<
    Record<string, { roleId: string; canScan: boolean }>
  >({});

  const pelayananQ = useQuery({
    queryKey: ['pelayanan', 'detail', pelayanan.id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PelayananDetail }>(
        `/admin/pelayanan/${pelayanan.id}`,
      );
      return res.data.data;
    },
  });

  const roles = pelayananQ.data?.roles ?? [];
  const allMembers = pelayananQ.data?.jemaatPelayanan ?? [];
  // Jemaat yang sudah punya row petugas pada kombinasi (link, tanggal) saat ini.
  // Logika:
  //   - Kalau mode 'default': hide jemaat yang sudah punya row tanggalIbadah=NULL
  //   - Kalau mode 'date'   : hide jemaat yang sudah punya row tanggalIbadah=tanggal
  const targetIso = mode === 'date' ? tanggal : null;
  const existingForTarget = new Set(
    existingPetugas
      .filter((p) => {
        const pIso = p.tanggalIbadah ? p.tanggalIbadah.slice(0, 10) : null;
        return pIso === targetIso;
      })
      .map((p) => p.jemaat.id),
  );
  // Hide non-active members + yang sudah jadi petugas pada (link, tanggal-target)
  const candidates = allMembers.filter(
    (m) => m.isActive && !existingForTarget.has(m.jemaat.id),
  );
  // Search filter
  const filtered = search.trim()
    ? candidates.filter((m) =>
        m.jemaat.namaLengkap.toLowerCase().includes(search.toLowerCase()),
      )
    : candidates;

  const selectedIds = Object.keys(selected);

  function toggleJemaat(member: PelayananMember) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[member.jemaat.id]) {
        delete next[member.jemaat.id];
      } else {
        // Default role = role mereka di pelayanan (dari JemaatPelayanan)
        next[member.jemaat.id] = { roleId: member.pelayananRole.id, canScan: false };
      }
      return next;
    });
  }

  function changeRole(jemaatId: string, roleId: string) {
    setSelected((prev) => ({
      ...prev,
      [jemaatId]: { ...prev[jemaatId]!, roleId },
    }));
  }

  function toggleCanScan(jemaatId: string) {
    setSelected((prev) => ({
      ...prev,
      [jemaatId]: { ...prev[jemaatId]!, canScan: !prev[jemaatId]!.canScan },
    }));
  }

  const batchMut = useMutation({
    mutationFn: async () => {
      const payloadTanggal = mode === 'date' ? tanggal : undefined;
      const results = await Promise.allSettled(
        selectedIds.map((jemaatId) =>
          apiClient.post('/admin/pelayanan/petugas', {
            ibadahPelayananId,
            jemaatId,
            pelayananRoleId: selected[jemaatId]!.roleId,
            tanggalIbadah: payloadTanggal,
            canScanAttendance: selected[jemaatId]!.canScan,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = results.length - failed;
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      const label = mode === 'date' ? `untuk ${tanggal}` : 'sebagai default';
      if (failed === 0) toast.success(`${succeeded} petugas ditambah ${label}`);
      else toast.error(`${succeeded} sukses, ${failed} gagal`);
      qc.invalidateQueries({ queryKey: ['petugas'] });
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Tambah Petugas</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Centang member <strong>{pelayanan.nama}</strong> yang akan bertugas di ibadah ini.
              Tidak ada di list? Tambah dulu sebagai member pelayanan dari halaman jemaat.
            </p>
          </div>

          {/* Mode toggle: default vs khusus tanggal */}
          <div className="px-6 pt-4">
            <div className="text-xs font-medium text-neutral-700 mb-1.5">
              Petugas berlaku untuk:
            </div>
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                onClick={() => setMode('default')}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition text-left ${
                  mode === 'default'
                    ? 'border-brand-500 bg-brand-50 text-brand-900'
                    : 'border-neutral-200 hover:bg-neutral-50 text-neutral-700'
                }`}
              >
                <div className="font-medium">Default (tiap minggu)</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  Otomatis dipakai di setiap occurrence
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode('date')}
                className={`flex-1 px-3 py-2 text-sm rounded-lg border transition text-left ${
                  mode === 'date'
                    ? 'border-brand-500 bg-brand-50 text-brand-900'
                    : 'border-neutral-200 hover:bg-neutral-50 text-neutral-700'
                }`}
              >
                <div className="font-medium">Khusus tanggal</div>
                <div className="text-[11px] text-neutral-500 mt-0.5">
                  Override hanya untuk satu tanggal
                </div>
              </button>
            </div>
            {mode === 'date' && (
              <div className="mt-2 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-amber-600 shrink-0" />
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                />
              </div>
            )}
            {mode === 'date' && (
              <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                Override snapshot: jika tanggal ini sudah punya petugas override,
                set petugas tanggal itu = override saja (tidak ditambahkan ke default).
              </p>
            )}
          </div>

          {/* Search */}
          <div className="px-6 pt-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter nama..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
            {selectedIds.length > 0 && (
              <div className="mt-2 text-xs text-brand-600 font-medium">
                {selectedIds.length} dipilih ·{' '}
                {selectedIds.filter((id) => selected[id]!.canScan).length} jadi scanner
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {pelayananQ.isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-neutral-400">
                {candidates.length === 0
                  ? `Tidak ada member ${pelayanan.nama} yang tersedia untuk di-assign.`
                  : 'Tidak ada hasil yang cocok dengan filter.'}
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((m) => {
                  const isSelected = !!selected[m.jemaat.id];
                  const currentRoleId = selected[m.jemaat.id]?.roleId ?? m.pelayananRole.id;
                  return (
                    <div
                      key={m.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition cursor-pointer ${
                        isSelected
                          ? 'border-brand-300 bg-brand-50/50'
                          : 'border-neutral-100 hover:bg-neutral-50'
                      }`}
                      onClick={() => toggleJemaat(m)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleJemaat(m)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 accent-brand-500 shrink-0"
                      />
                      {m.jemaat.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${apiBase}${m.jemaat.fotoUrl}`}
                          alt={m.jemaat.namaLengkap}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0 text-xs font-semibold">
                          {m.jemaat.namaLengkap.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-neutral-900 truncate">
                          {m.jemaat.namaLengkap}
                        </div>
                        <div className="text-xs text-neutral-500">
                          Default: {m.pelayananRole.nama}
                        </div>
                      </div>
                      {isSelected && (
                        <>
                          <select
                            value={currentRoleId}
                            onChange={(e) => changeRole(m.jemaat.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs px-2 py-1 border border-neutral-300 rounded outline-none focus:ring-1 focus:ring-brand-500 bg-white shrink-0"
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.nama}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCanScan(m.jemaat.id);
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded shrink-0 ${
                              selected[m.jemaat.id]?.canScan
                                ? 'text-green-700 bg-green-100'
                                : 'text-neutral-500 border border-neutral-300'
                            }`}
                            title={
                              selected[m.jemaat.id]?.canScan ? 'Bisa scan' : 'Tidak bisa scan'
                            }
                          >
                            <ShieldCheck className="w-3 h-3" />
                            {selected[m.jemaat.id]?.canScan ? 'Scan' : 'No-scan'}
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={batchMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => batchMut.mutate()}
              disabled={
                selectedIds.length === 0 ||
                batchMut.isPending ||
                (mode === 'date' && !tanggal)
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {batchMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Tambah {selectedIds.length > 0 && `(${selectedIds.length})`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============== Other helpers ==============

function Info({
  icon: Icon,
  label,
  children,
  full,
}: {
  icon: typeof Calendar;
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'md:col-span-3' : ''}>
      <div className="text-[10px] uppercase text-neutral-400 font-semibold">{label}</div>
      <div className="flex items-center gap-1.5 text-neutral-700 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <span className="truncate">{children}</span>
      </div>
    </div>
  );
}

function AddPelayananLinkModal({
  available,
  loading,
  submitting,
  onClose,
  onAdd,
}: {
  available: PelayananLite[];
  loading: boolean;
  submitting: boolean;
  onClose: () => void;
  onAdd: (pelayananId: string) => void;
}) {
  const [pelayananId, setPelayananId] = useState('');
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Tambah Pelayanan ke Ibadah</h2>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Pelayanan</span>
              <select
                value={pelayananId}
                onChange={(e) => setPelayananId(e.target.value)}
                disabled={loading}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
              >
                <option value="">{loading ? 'Memuat...' : '— pilih pelayanan —'}</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
              {!loading && available.length === 0 && (
                <span className="block mt-1 text-xs text-neutral-500">
                  Semua pelayanan sudah ter-link ke ibadah ini.
                </span>
              )}
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => onAdd(pelayananId)}
              disabled={!pelayananId || submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Tautkan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
