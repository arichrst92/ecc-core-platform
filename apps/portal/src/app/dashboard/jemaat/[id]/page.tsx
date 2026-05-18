'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  User as UserIcon,
  HandHeart,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

interface Jemaat {
  id: string;
  namaLengkap: string;
  email: string | null;
  noHp: string | null;
  tanggalLahir: string | null;
  jenisKelamin: 'L' | 'P' | null;
  alamat: string | null;
  tanggalBergabung: string | null;
  fotoUrl: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string };
}

interface PelayananAssignment {
  id: string;
  isActive: boolean;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  catatan: string | null;
  pelayanan: { id: string; nama: string };
  pelayananRole: { id: string; nama: string; level: number };
}

interface Pelayanan {
  id: string;
  nama: string;
  roles: { id: string; nama: string; level: number }[];
}

export default function JemaatDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const jemaatId = params.id;

  const [assignOpen, setAssignOpen] = useState(false);
  const [deleting, setDeleting] = useState<PelayananAssignment | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  // Jemaat detail
  const jemaatQ = useQuery({
    queryKey: ['jemaat', 'detail', jemaatId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Jemaat }>(`/admin/jemaat/${jemaatId}`);
      return res.data.data;
    },
  });

  // Pelayanan assignments for this jemaat
  const assignmentsQ = useQuery({
    queryKey: ['jemaat-pelayanan', jemaatId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: PelayananAssignment[] }>(
        `/admin/pelayanan/assign/jemaat/${jemaatId}`,
      );
      return res.data.data;
    },
  });

  // All pelayanan + roles (untuk dropdown form assign)
  const pelayananQ = useQuery({
    queryKey: ['pelayanan', 'with-roles'],
    enabled: assignOpen,
    queryFn: async () => {
      const res = await apiClient.get<{ data: Pelayanan[] }>('/admin/pelayanan', {
        params: { limit: 100 },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/pelayanan/assign/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jemaat-pelayanan', jemaatId] });
      toast.success('Penugasan dihapus');
      setDeleting(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const endMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.patch(`/admin/pelayanan/assign/${id}`, {
        isActive: false,
        tanggalSelesai: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jemaat-pelayanan', jemaatId] });
      toast.success('Penugasan diakhiri');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  if (jemaatQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  if (!jemaatQ.data) {
    return (
      <div className="text-center py-20 text-neutral-500">
        Jemaat tidak ditemukan.
        <Link href="/dashboard/jemaat" className="block mt-2 text-brand-600 hover:underline">
          ← Kembali ke daftar
        </Link>
      </div>
    );
  }

  const j = jemaatQ.data;
  const assignments = assignmentsQ.data ?? [];
  const activeAssignments = assignments.filter((a) => a.isActive);
  const pastAssignments = assignments.filter((a) => !a.isActive);

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/jemaat"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3"
      >
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar jemaat
      </Link>

      {/* Profile header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6 flex items-start gap-5">
        {j.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${apiBase}${j.fotoUrl}`}
            alt={j.namaLengkap}
            className="w-24 h-24 rounded-full object-cover border-2 border-neutral-200"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
            <UserIcon className="w-10 h-10" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-neutral-900">{j.namaLengkap}</h1>
          <div className="text-sm text-neutral-500 mt-1">
            {j.cabang?.nama && <span>{j.cabang.nama}</span>}
            {j.jenisKelamin && <span> · {j.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</span>}
            {!j.isActive && (
              <span className="ml-2 inline-block px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-500">
                Nonaktif
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {j.noHp && (
              <Info icon={Phone} label="No HP">
                {j.noHp}
              </Info>
            )}
            {j.email && (
              <Info icon={Mail} label="Email">
                {j.email}
              </Info>
            )}
            {j.tanggalLahir && (
              <Info icon={Calendar} label="Tgl Lahir">
                {new Date(j.tanggalLahir).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Info>
            )}
            {j.tanggalBergabung && (
              <Info icon={Calendar} label="Bergabung">
                {new Date(j.tanggalBergabung).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
              </Info>
            )}
            {j.alamat && (
              <Info icon={MapPin} label="Alamat" full>
                {j.alamat}
              </Info>
            )}
          </div>
        </div>
        <button
          onClick={() => router.push(`/dashboard/jemaat?edit=${j.id}`)}
          className="px-3 py-1.5 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm"
        >
          Edit Profile
        </button>
      </div>

      {/* Pelayanan section */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <HandHeart className="w-4 h-4" />
              Pelayanan
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Tim ministry yang sedang/pernah dilayani oleh jemaat ini.
            </p>
          </div>
          <button
            onClick={() => setAssignOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Tambah Penugasan
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Active assignments */}
          <div>
            <div className="text-xs uppercase text-neutral-500 mb-2 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-600" /> Aktif
            </div>
            {activeAssignments.length === 0 ? (
              <p className="text-sm text-neutral-400 italic">Belum ada penugasan aktif.</p>
            ) : (
              <div className="space-y-2">
                {activeAssignments.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    a={a}
                    onEnd={() => endMut.mutate(a.id)}
                    onDelete={() => setDeleting(a)}
                    isActive
                  />
                ))}
              </div>
            )}
          </div>

          {/* Past assignments */}
          {pastAssignments.length > 0 && (
            <div>
              <div className="text-xs uppercase text-neutral-500 mb-2 font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3" /> Riwayat
              </div>
              <div className="space-y-2">
                {pastAssignments.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    a={a}
                    onDelete={() => setDeleting(a)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Assign modal */}
      {assignOpen && (
        <AssignPelayananModal
          jemaatId={jemaatId}
          pelayananList={pelayananQ.data ?? []}
          loading={pelayananQ.isLoading}
          onClose={() => setAssignOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['jemaat-pelayanan', jemaatId] });
            setAssignOpen(false);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus penugasan ini?"
        itemName={deleting ? `${deleting.pelayanan.nama}:${deleting.pelayananRole.nama}` : undefined}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </div>
  );
}

// ============== Sub-components ==============

function Info({
  icon: Icon,
  label,
  children,
  full,
}: {
  icon: typeof UserIcon;
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="text-[10px] uppercase text-neutral-400 font-semibold">{label}</div>
      <div className="flex items-center gap-1.5 text-neutral-700">
        <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        {children}
      </div>
    </div>
  );
}

function AssignmentRow({
  a,
  isActive,
  onEnd,
  onDelete,
}: {
  a: PelayananAssignment;
  isActive?: boolean;
  onEnd?: () => void;
  onDelete: () => void;
}) {
  const levelColor =
    a.pelayananRole.level >= 10
      ? 'bg-brand-100 text-brand-800'
      : a.pelayananRole.level >= 5
        ? 'bg-amber-100 text-amber-800'
        : a.pelayananRole.level < 0
          ? 'bg-neutral-100 text-neutral-500'
          : 'bg-blue-50 text-blue-700';
  return (
    <div className="flex items-center justify-between gap-3 p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-neutral-900">{a.pelayanan.nama}</span>
          <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${levelColor}`}>
            {a.pelayananRole.nama}
          </span>
        </div>
        <div className="text-xs text-neutral-500 mt-0.5">
          {new Date(a.tanggalMulai).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
          {a.tanggalSelesai && (
            <> – {new Date(a.tanggalSelesai).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</>
          )}
          {a.catatan && <span className="italic"> · {a.catatan}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isActive && onEnd && (
          <button
            onClick={onEnd}
            className="px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded"
            title="Akhiri (set tgl selesai = hari ini)"
          >
            Akhiri
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

function AssignPelayananModal({
  jemaatId,
  pelayananList,
  loading,
  onClose,
  onSuccess,
}: {
  jemaatId: string;
  pelayananList: Pelayanan[];
  loading: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [pelayananId, setPelayananId] = useState('');
  const [pelayananRoleId, setPelayananRoleId] = useState('');
  const [catatan, setCatatan] = useState('');

  const selected = pelayananList.find((p) => p.id === pelayananId);
  const availableRoles = selected?.roles ?? [];

  const assignMut = useMutation({
    mutationFn: async () =>
      apiClient.post('/admin/pelayanan/assign', {
        jemaatId,
        pelayananId,
        pelayananRoleId,
        catatan: catatan || undefined,
      }),
    onSuccess: () => {
      toast.success('Penugasan ditambah');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Tambah Penugasan Pelayanan</h2>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Pelayanan</span>
              <select
                value={pelayananId}
                onChange={(e) => {
                  setPelayananId(e.target.value);
                  setPelayananRoleId('');
                }}
                disabled={loading}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
              >
                <option value="">{loading ? 'Memuat...' : '— pilih pelayanan —'}</option>
                {pelayananList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Role</span>
              <select
                value={pelayananRoleId}
                onChange={(e) => setPelayananRoleId(e.target.value)}
                disabled={!pelayananId}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
              >
                <option value="">— pilih role —</option>
                {availableRoles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nama} (L{r.level})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Catatan (opsional)</span>
              <input
                type="text"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Mis. mulai serve Q1 2026"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={assignMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => assignMut.mutate()}
              disabled={!pelayananId || !pelayananRoleId || assignMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {assignMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Tambah
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
