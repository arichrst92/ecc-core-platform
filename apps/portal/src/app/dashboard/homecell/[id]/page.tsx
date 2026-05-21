'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Home as HomeIcon,
  Plus,
  Trash2,
  UserMinus,
  UserCheck,
  Users,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

interface Homecell {
  id: string;
  nama: string;
  deskripsi: string | null;
  isActive: boolean;
  area: {
    id: string;
    nama: string;
    cabang?: { id: string; nama: string; kode: string };
  };
  picJemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null } | null;
  members: {
    id: string;
    homecellId: string;
    jemaatId: string;
    isActive: boolean;
    tanggalBergabung: string;
    tanggalKeluar: string | null;
    catatan: string | null;
    jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  }[];
}

export default function HomecellDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const homecellId = params.id;

  const [addOpen, setAddOpen] = useState(false);
  const [deletingMember, setDeletingMember] =
    useState<Homecell['members'][number] | null>(null);

  const detailQ = useQuery({
    queryKey: ['homecell', 'detail', homecellId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Homecell }>(`/admin/homecell/${homecellId}`);
      return res.data.data;
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/admin/homecell/${homecellId}/members/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homecell', 'detail', homecellId] });
      toast.success('Status member diperbarui');
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal update member'),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/admin/homecell/${homecellId}/members/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homecell', 'detail', homecellId] });
      toast.success('Member dihapus');
      setDeletingMember(null);
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal hapus member'),
  });

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat homecell...
      </div>
    );
  }
  if (!detailQ.data) {
    return (
      <div className="p-6 text-center text-neutral-500">Homecell tidak ditemukan.</div>
    );
  }

  const h = detailQ.data;
  const activeMembers = h.members.filter((m) => m.isActive);
  const exMembers = h.members.filter((m) => !m.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <HomeIcon className="w-6 h-6 text-brand-500" /> {h.nama}
          </h1>
          <div className="text-sm text-neutral-500 mt-0.5">
            <Link
              href={`/dashboard/homecell-area?cabangId=${h.area.cabang?.id ?? ''}`}
              className="hover:underline"
            >
              {h.area.cabang?.nama}
            </Link>{' '}
            ·{' '}
            <Link
              href={`/dashboard/homecell?areaId=${h.area.id}`}
              className="hover:underline"
            >
              Area: {h.area.nama}
            </Link>
          </div>
        </div>
        {!h.isActive && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-500">
            Nonaktif
          </span>
        )}
      </div>

      {/* Info card — hanya PIC. Jadwal & alamat tidak ditampilkan karena
          pertemuan homecell dibahas per minggu via kesepakatan grup. */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="text-xs text-neutral-500 mb-2">PIC (Homecell Leader)</div>
        {h.picJemaat ? (
          <Link
            href={`/dashboard/jemaat/${h.picJemaat.id}`}
            className="flex items-center gap-3 hover:bg-neutral-50 -mx-2 px-2 py-1.5 rounded-lg transition"
          >
            <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-semibold">
              {h.picJemaat.namaLengkap.charAt(0)}
            </div>
            <div>
              <div className="font-medium text-neutral-900">{h.picJemaat.namaLengkap}</div>
              <div className="text-xs text-neutral-500">{h.picJemaat.noHp ?? '-'}</div>
            </div>
          </Link>
        ) : (
          <div className="text-sm text-neutral-400 italic">Belum ada PIC</div>
        )}
      </div>

      {h.deskripsi && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs text-neutral-500 mb-1">Deskripsi</div>
          <p className="text-sm text-neutral-700 whitespace-pre-line">{h.deskripsi}</p>
        </div>
      )}

      {/* Members section */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-neutral-100">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4" /> Anggota Homecell
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {activeMembers.length} aktif
              {exMembers.length > 0 ? ` · ${exMembers.length} alumni` : ''}
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600"
          >
            <Plus className="w-4 h-4" /> Tambah Member
          </button>
        </div>

        {h.members.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            Belum ada anggota di homecell ini.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Nama</th>
                <th className="text-left px-5 py-2 font-medium">No HP</th>
                <th className="text-left px-5 py-2 font-medium">Bergabung</th>
                <th className="text-left px-5 py-2 font-medium">Keluar</th>
                <th className="text-left px-5 py-2 font-medium">Status</th>
                <th className="text-right px-5 py-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {h.members.map((m) => (
                <tr key={m.id} className={m.isActive ? '' : 'opacity-60'}>
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/jemaat/${m.jemaat.id}`}
                      className="text-neutral-900 hover:text-brand-600 hover:underline font-medium"
                    >
                      {m.jemaat.namaLengkap}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-neutral-600">{m.jemaat.noHp ?? '-'}</td>
                  <td className="px-5 py-3 text-neutral-600">
                    {new Date(m.tanggalBergabung).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-5 py-3 text-neutral-600">
                    {m.tanggalKeluar
                      ? new Date(m.tanggalKeluar).toLocaleDateString('id-ID')
                      : '-'}
                  </td>
                  <td className="px-5 py-3">
                    {m.isActive ? (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                        Aktif
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-500">
                        Keluar
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() =>
                          toggleMut.mutate({ id: m.id, isActive: !m.isActive })
                        }
                        className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500"
                        title={m.isActive ? 'Mark sebagai keluar' : 'Aktifkan kembali'}
                      >
                        {m.isActive ? (
                          <UserMinus className="w-4 h-4" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => setDeletingMember(m)}
                        className="p-1.5 rounded hover:bg-red-50 text-red-600"
                        title="Hapus permanen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && (
        <AddMemberModal
          homecellId={homecellId}
          cabangId={h.area.cabang?.id}
          existingJemaatIds={new Set(h.members.map((m) => m.jemaatId))}
          onClose={() => setAddOpen(false)}
        />
      )}

      <ConfirmDelete
        open={!!deletingMember}
        title="Hapus anggota homecell?"
        itemName={deletingMember?.jemaat.namaLengkap}
        onConfirm={() => deletingMember && removeMut.mutate(deletingMember.id)}
        onClose={() => setDeletingMember(null)}
        loading={removeMut.isPending}
      />
    </div>
  );
}

// ============================================================
//  Add Member Modal
// ============================================================

function AddMemberModal({
  homecellId,
  cabangId,
  existingJemaatIds,
  onClose,
}: {
  homecellId: string;
  cabangId?: string;
  existingJemaatIds: Set<string>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tanggalBergabung, setTanggalBergabung] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [catatan, setCatatan] = useState('');

  // Fetch jemaat — limited by cabang (kalau ada) untuk skala manageable
  const jemaatQ = useQuery({
    queryKey: ['jemaat', 'pick', cabangId, search],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { id: string; namaLengkap: string; noHp: string | null }[] }>(
        '/admin/jemaat',
        { params: { cabangId, search: search || undefined, limit: 50 } },
      );
      return res.data.data;
    },
  });

  const available = useMemo(
    () => (jemaatQ.data ?? []).filter((j) => !existingJemaatIds.has(j.id)),
    [jemaatQ.data, existingJemaatIds],
  );

  const addMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Pilih jemaat dulu');
      return apiClient.post(`/admin/homecell/${homecellId}/members`, {
        jemaatId: selectedId,
        tanggalBergabung,
        catatan: catatan || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homecell', 'detail', homecellId] });
      toast.success('Member ditambahkan');
      onClose();
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? e.message ?? 'Gagal menambah member'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-5 border-b border-neutral-100">
          <h3 className="font-semibold text-neutral-900">Tambah Anggota Homecell</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Cari Jemaat {cabangId ? '(dari cabang ini)' : ''}
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik nama / no HP..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
            <div className="mt-2 max-h-48 overflow-y-auto border border-neutral-100 rounded-lg divide-y divide-neutral-50">
              {jemaatQ.isLoading ? (
                <div className="p-3 text-sm text-neutral-500">Memuat...</div>
              ) : available.length === 0 ? (
                <div className="p-3 text-sm text-neutral-400">
                  Tidak ada jemaat yang cocok / semuanya sudah jadi member.
                </div>
              ) : (
                available.map((j) => (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setSelectedId(j.id)}
                    className={`w-full text-left px-3 py-2 text-sm flex justify-between items-center hover:bg-neutral-50 ${
                      selectedId === j.id ? 'bg-brand-50 text-brand-800' : 'text-neutral-700'
                    }`}
                  >
                    <span className="font-medium">{j.namaLengkap}</span>
                    <span className="text-xs text-neutral-500">{j.noHp ?? '-'}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Tanggal Bergabung
            </label>
            <input
              type="date"
              value={tanggalBergabung}
              onChange={(e) => setTanggalBergabung(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Catatan (opsional)
            </label>
            <textarea
              rows={2}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
          </div>
        </div>

        <div className="p-5 border-t border-neutral-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
          >
            Batal
          </button>
          <button
            onClick={() => addMut.mutate()}
            disabled={!selectedId || addMut.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {addMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
            ) : null}
            Tambah
          </button>
        </div>
      </div>
    </div>
  );
}
