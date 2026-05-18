'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

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
  linkStream: string | null;
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
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  pelayananRole: { id: string; nama: string; level: number };
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
  const qc = useQueryClient();
  const ibadahId = params.id;

  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [deletingLink, setDeletingLink] = useState<IbadahPelayananLink | null>(null);

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
    <div className="max-w-5xl">
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
          <button
            onClick={() => router.push(`/dashboard/ibadah`)}
            className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm"
          >
            Edit Ibadah
          </button>
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
          {i.isOnline && i.linkStream && (
            <Info icon={Globe} label="Streaming" full>
              <a href={i.linkStream} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline truncate">
                {i.linkStream}
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
                  onDelete={() => setDeletingLink(link)}
                />
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
    </div>
  );
}

// ============== Pelayanan Link Card (expandable dengan petugas) ==============

function PelayananLinkCard({ link, onDelete }: { link: IbadahPelayananLink; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const [addPetugasOpen, setAddPetugasOpen] = useState(false);
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

  const petugas = petugasQ.data ?? [];

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 p-3 bg-neutral-50">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-white/50 rounded-md px-1 py-0.5"
        >
          {expanded ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
          <HandHeart className="w-4 h-4 text-brand-500 shrink-0" />
          <span className="font-medium text-neutral-900 truncate">{link.pelayanan.nama}</span>
          {petugas.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <Users className="w-3 h-3" />
              {petugas.length}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              setExpanded(true);
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

      {/* Body: petugas list */}
      {expanded && (
        <div className="p-4">
          {petugasQ.isLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
            </div>
          ) : petugas.length === 0 ? (
            <p className="text-sm text-neutral-400 italic text-center py-3">
              Belum ada petugas. Klik <strong>Tambah Petugas</strong> di atas.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {petugas.map((p) => (
                <PetugasRow
                  key={p.id}
                  p={p}
                  apiBase={apiBase}
                  onDelete={() => setDeletingPetugas(p)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {addPetugasOpen && (
        <AddPetugasModal
          ibadahPelayananId={link.id}
          pelayanan={link.pelayanan}
          existingJemaatIds={new Set(petugas.map((p) => p.jemaat.id))}
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
        itemName={deletingPetugas?.jemaat.namaLengkap}
        onConfirm={() => deletingPetugas && deletePetugasMut.mutate(deletingPetugas.id)}
      />
    </div>
  );
}

function PetugasRow({
  p,
  apiBase,
  onDelete,
}: {
  p: PetugasItem;
  apiBase: string;
  onDelete: () => void;
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
    <div className="flex items-center gap-2.5 p-2.5 border border-neutral-100 rounded-md hover:bg-neutral-50">
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
        <Link
          href={`/dashboard/jemaat/${p.jemaat.id}`}
          className="font-medium text-neutral-900 hover:text-brand-600 hover:underline text-sm truncate block"
        >
          {p.jemaat.namaLengkap}
        </Link>
        <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded ${roleColor}`}>
          {p.pelayananRole.nama}
        </span>
        {p.catatan && <span className="text-xs text-neutral-500 italic block mt-0.5">{p.catatan}</span>}
      </div>
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
  existingJemaatIds,
  onClose,
  onSuccess,
}: {
  ibadahPelayananId: string;
  pelayanan: PelayananLite;
  existingJemaatIds: Set<string>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  // Map jemaatId → { selected, roleId }
  const [selected, setSelected] = useState<Record<string, { roleId: string }>>({});

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
  // Hide non-active members + yang sudah jadi petugas
  const candidates = allMembers.filter(
    (m) => m.isActive && !existingJemaatIds.has(m.jemaat.id),
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
        next[member.jemaat.id] = { roleId: member.pelayananRole.id };
      }
      return next;
    });
  }

  function changeRole(jemaatId: string, roleId: string) {
    setSelected((prev) => ({ ...prev, [jemaatId]: { roleId } }));
  }

  const batchMut = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(
        selectedIds.map((jemaatId) =>
          apiClient.post('/admin/pelayanan/petugas', {
            ibadahPelayananId,
            jemaatId,
            pelayananRoleId: selected[jemaatId]!.roleId,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      const succeeded = results.length - failed;
      return { succeeded, failed };
    },
    onSuccess: ({ succeeded, failed }) => {
      if (failed === 0) toast.success(`${succeeded} petugas ditambah`);
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

          {/* Search */}
          <div className="px-6 pt-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter nama..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
            />
            {selectedIds.length > 0 && (
              <div className="mt-2 text-xs text-brand-600 font-medium">
                {selectedIds.length} jemaat dipilih
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
              disabled={selectedIds.length === 0 || batchMut.isPending}
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
