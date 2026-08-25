'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
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
  Heart,
  Shield,
  Pencil,
  QrCode,
  Copy,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { FormModal } from '@/components/crud/form-modal';
import { buildJemaatResource } from '@/lib/resources/jemaat-config';

interface JemaatRoleAssignment {
  id: string;
  isActive: boolean;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  catatan: string | null;
  role: { id: string; nama: string };
  subRole: { id: string; nama: string };
  subRoleStatus: { id: string; nama: string } | null;
}

interface Jemaat {
  id: string;
  cabangId: string;
  namaLengkap: string;
  kode: string | null;
  email: string | null;
  noHp: string | null;
  tanggalLahir: string | null;
  jenisKelamin: 'L' | 'P' | null;
  alamat: string | null;
  tanggalBergabung: string | null;
  fotoUrl: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string };
  jemaatRoles?: JemaatRoleAssignment[];
}

interface RoleDetail {
  id: string;
  nama: string;
  subRoles: {
    id: string;
    nama: string;
    statuses: { id: string; nama: string }[];
  }[];
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
  const qc = useQueryClient();
  const jemaatId = params.id;

  const [assignOpen, setAssignOpen] = useState(false);
  const [deleting, setDeleting] = useState<PelayananAssignment | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState<JemaatRoleAssignment | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  // Re-use jemaat resource config untuk dapat field list + schema yang sama
  // dengan halaman list. Tidak butuh callback Relasi di sini.
  const jemaatConfig = useMemo(() => buildJemaatResource(() => {}), []);

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

  // ===== Edit profil jemaat =====
  const updateProfileMut = useMutation({
    mutationFn: async (values: Record<string, unknown>) =>
      apiClient.patch(`/admin/jemaat/${jemaatId}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jemaat', 'detail', jemaatId] });
      qc.invalidateQueries({ queryKey: ['jemaat'] }); // list cache
      toast.success('Profil jemaat diperbarui');
      setEditOpen(false);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal memperbarui profil'),
  });

  // ===== Role assignment mutations =====
  const endRoleMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.patch(`/admin/role/assign/${id}`, {
        isActive: false,
        tanggalSelesai: new Date().toISOString().slice(0, 10),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jemaat', 'detail', jemaatId] });
      toast.success('Role diakhiri');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal mengakhiri role'),
  });

  const deleteRoleMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/role/assign/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jemaat', 'detail', jemaatId] });
      toast.success('Role dihapus');
      setDeletingRole(null);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal hapus role'),
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
    <div className="w-full">
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
          onClick={() => setEditOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit Profile
        </button>
      </div>

      {/* Kartu QR jemaat — kode untuk scan check-in event */}
      {j.kode && <JemaatQrCard kode={j.kode} nama={j.namaLengkap} />}

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

      {/* Role section */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden mt-6">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Role
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Role / Sub-Role / Status — riwayat penempatan jemaat dalam struktur gereja.
            </p>
          </div>
          <button
            onClick={() => setAddRoleOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Tambah Role
          </button>
        </div>

        <div className="p-6 space-y-4">
          {(() => {
            const allRoles = j.jemaatRoles ?? [];
            const activeRoles = allRoles.filter((r) => r.isActive);
            const pastRoles = allRoles.filter((r) => !r.isActive);
            return (
              <>
                <div>
                  <div className="text-xs uppercase text-neutral-500 mb-2 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-600" /> Aktif
                  </div>
                  {activeRoles.length === 0 ? (
                    <p className="text-sm text-neutral-400 italic">Belum ada role aktif.</p>
                  ) : (
                    <div className="space-y-2">
                      {activeRoles.map((r) => (
                        <JemaatRoleRow
                          key={r.id}
                          r={r}
                          isActive
                          onEnd={() => endRoleMut.mutate(r.id)}
                          onDelete={() => setDeletingRole(r)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {pastRoles.length > 0 && (
                  <div>
                    <div className="text-xs uppercase text-neutral-500 mb-2 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Riwayat
                    </div>
                    <div className="space-y-2">
                      {pastRoles.map((r) => (
                        <JemaatRoleRow
                          key={r.id}
                          r={r}
                          onDelete={() => setDeletingRole(r)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </section>

      {/* Relasi Keluarga section */}
      <RelasiSection jemaatId={jemaatId} />

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

      {/* Edit Profile modal */}
      <FormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Profil Jemaat"
        schema={jemaatConfig.updateSchema}
        fields={jemaatConfig.fields}
        defaultValues={j as unknown as Record<string, unknown>}
        isEdit
        loading={updateProfileMut.isPending}
        onSubmit={async (values) => {
          await updateProfileMut.mutateAsync(values as Record<string, unknown>);
        }}
      />

      {/* Add Role modal */}
      {addRoleOpen && (
        <AddJemaatRoleModal
          jemaatId={jemaatId}
          existing={j.jemaatRoles ?? []}
          onClose={() => setAddRoleOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['jemaat', 'detail', jemaatId] });
            setAddRoleOpen(false);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deletingRole}
        loading={deleteRoleMut.isPending}
        onClose={() => setDeletingRole(null)}
        title="Hapus role ini?"
        itemName={
          deletingRole
            ? `${deletingRole.role.nama}:${deletingRole.subRole.nama}${
                deletingRole.subRoleStatus ? `:${deletingRole.subRoleStatus.nama}` : ''
              }`
            : undefined
        }
        onConfirm={() => deletingRole && deleteRoleMut.mutate(deletingRole.id)}
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

// ============== Relasi Keluarga Section ==============

interface RelasiItem {
  id: string;
  keterangan: string | null;
  jemaatTerkait: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  tipeRelasi: { id: string; nama: string };
}

interface TipeRelasi {
  id: string;
  nama: string;
}

interface JemaatLite {
  id: string;
  namaLengkap: string;
  noHp: string | null;
}

function RelasiSection({ jemaatId }: { jemaatId: string }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<RelasiItem | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  const relasiQ = useQuery({
    queryKey: ['relasi-jemaat', jemaatId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RelasiItem[] }>(
        `/admin/keluarga/relasi/jemaat/${jemaatId}`,
      );
      return res.data.data;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/keluarga/relasi/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['relasi-jemaat', jemaatId] });
      toast.success('Relasi dihapus');
      setDeleting(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const relasi = relasiQ.data ?? [];

  return (
    <section className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-500" />
            Relasi Keluarga
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Hubungan kekeluargaan (suami/istri/anak/orangtua/dll) ke jemaat lain.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Tambah Relasi
        </button>
      </div>

      <div className="p-6">
        {relasiQ.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : relasi.length === 0 ? (
          <p className="text-sm text-neutral-400 italic text-center py-3">
            Belum ada relasi keluarga tercatat.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {relasi.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50"
              >
                {r.jemaatTerkait.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${apiBase}${r.jemaatTerkait.fotoUrl}`}
                    alt={r.jemaatTerkait.namaLengkap}
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/jemaat/${r.jemaatTerkait.id}`}
                    className="font-medium text-neutral-900 hover:text-brand-600 hover:underline text-sm truncate block"
                  >
                    {r.jemaatTerkait.namaLengkap}
                  </Link>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="inline-block px-2 py-0.5 bg-pink-50 text-pink-700 text-xs rounded">
                      {r.tipeRelasi.nama}
                    </span>
                    {r.keterangan && (
                      <span className="text-xs text-neutral-500 italic">{r.keterangan}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setDeleting(r)}
                  className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <AddRelasiModal
          jemaatId={jemaatId}
          onClose={() => setAddOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['relasi-jemaat', jemaatId] });
            setAddOpen(false);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus relasi keluarga?"
        itemName={
          deleting
            ? `${deleting.tipeRelasi.nama}: ${deleting.jemaatTerkait.namaLengkap}`
            : undefined
        }
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </section>
  );
}

function AddRelasiModal({
  jemaatId,
  onClose,
  onSuccess,
}: {
  jemaatId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [search, setSearch] = useState('');
  const [jemaatTerkaitId, setJemaatTerkaitId] = useState('');
  const [tipeRelasiId, setTipeRelasiId] = useState('');
  const [keterangan, setKeterangan] = useState('');

  const tipeRelasiQ = useQuery({
    queryKey: ['tipe-relasi', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: TipeRelasi[] }>('/admin/keluarga/tipe', {
        params: { limit: 100 },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  const searchQ = useQuery({
    queryKey: ['jemaat-search', search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const res = await apiClient.get<{ data: JemaatLite[] }>('/admin/jemaat', {
        params: { search, limit: 15 },
      });
      // Filter out current jemaat (jangan relasi ke diri sendiri)
      return res.data.data.filter((j) => j.id !== jemaatId);
    },
  });

  const createMut = useMutation({
    mutationFn: async () =>
      apiClient.post('/admin/keluarga/relasi', {
        jemaatId,
        jemaatTerkaitId,
        tipeRelasiId,
        keterangan: keterangan || undefined,
      }),
    onSuccess: () => {
      toast.success('Relasi ditambah');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const selected = (searchQ.data ?? []).find((j) => j.id === jemaatTerkaitId);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Tambah Relasi Keluarga</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Tip: relasi <em>satu arah</em> — A → suami B berarti B adalah suami dari A.
            </p>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Tipe Relasi</span>
              <select
                value={tipeRelasiId}
                onChange={(e) => setTipeRelasiId(e.target.value)}
                disabled={tipeRelasiQ.isLoading}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="">— pilih tipe —</option>
                {tipeRelasiQ.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nama}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Cari jemaat terkait</span>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setJemaatTerkaitId('');
                }}
                placeholder="Ketik nama (min 2 karakter)"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
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
                      onClick={() => setJemaatTerkaitId(j.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 border-b border-neutral-100 last:border-0 ${
                        jemaatTerkaitId === j.id ? 'bg-brand-50 text-brand-700 font-medium' : ''
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

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Keterangan (opsional)</span>
              <input
                type="text"
                value={keterangan}
                onChange={(e) => setKeterangan(e.target.value)}
                placeholder="Mis. menikah 2010"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
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
              disabled={!jemaatTerkaitId || !tipeRelasiId || createMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Tambah
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============== Jemaat Role row + Modal ==============

function JemaatRoleRow({
  r,
  isActive,
  onEnd,
  onDelete,
}: {
  r: JemaatRoleAssignment;
  isActive?: boolean;
  onEnd?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-neutral-900">{r.role.nama}</span>
          <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700">
            {r.subRole.nama}
          </span>
          {r.subRoleStatus && (
            <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-700">
              {r.subRoleStatus.nama}
            </span>
          )}
        </div>
        <div className="text-xs text-neutral-500 mt-0.5">
          {new Date(r.tanggalMulai).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
          {r.tanggalSelesai && (
            <>
              {' '}
              –{' '}
              {new Date(r.tanggalSelesai).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </>
          )}
          {r.catatan && <span className="italic"> · {r.catatan}</span>}
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

function AddJemaatRoleModal({
  jemaatId,
  existing,
  onClose,
  onSuccess,
}: {
  jemaatId: string;
  existing: JemaatRoleAssignment[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [roleId, setRoleId] = useState('');
  const [subRoleId, setSubRoleId] = useState('');
  const [subRoleStatusId, setSubRoleStatusId] = useState('');
  const [tanggalMulai, setTanggalMulai] = useState(new Date().toISOString().slice(0, 10));
  const [catatan, setCatatan] = useState('');

  const rolesQ = useQuery({
    queryKey: ['role', 'with-subroles'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RoleDetail[] }>('/admin/role');
      return res.data.data;
    },
  });

  const selectedRole = (rolesQ.data ?? []).find((r) => r.id === roleId);
  const selectedSubRole = selectedRole?.subRoles.find((s) => s.id === subRoleId);
  const availableStatuses = selectedSubRole?.statuses ?? [];

  // Cek duplikat aktif: jemaat tidak boleh punya 2 row aktif untuk
  // (role, subRole) yang sama. Hanya warning di UI; backend tetap final guard.
  const existingActiveKey = new Set(
    existing.filter((e) => e.isActive).map((e) => `${e.role.id}:${e.subRole.id}`),
  );
  const duplicateActive =
    !!(roleId && subRoleId && existingActiveKey.has(`${roleId}:${subRoleId}`));

  const createMut = useMutation({
    mutationFn: async () =>
      apiClient.post('/admin/role/assign', {
        jemaatId,
        roleId,
        subRoleId,
        subRoleStatusId: subRoleStatusId || undefined,
        tanggalMulai,
        catatan: catatan || undefined,
      }),
    onSuccess: () => {
      toast.success('Role ditambah');
      onSuccess();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal menambahkan role'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Tambah Role</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Role → Sub-Role wajib; Status opsional kalau Sub-Role punya tingkatan status.
            </p>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Role</span>
              <select
                value={roleId}
                onChange={(e) => {
                  setRoleId(e.target.value);
                  setSubRoleId('');
                  setSubRoleStatusId('');
                }}
                disabled={rolesQ.isLoading}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
              >
                <option value="">{rolesQ.isLoading ? 'Memuat...' : '— pilih role —'}</option>
                {(rolesQ.data ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nama}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Sub-Role</span>
              <select
                value={subRoleId}
                onChange={(e) => {
                  setSubRoleId(e.target.value);
                  setSubRoleStatusId('');
                }}
                disabled={!roleId}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
              >
                <option value="">— pilih sub-role —</option>
                {(selectedRole?.subRoles ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Status <span className="text-neutral-400">(opsional)</span>
              </span>
              <select
                value={subRoleStatusId}
                onChange={(e) => setSubRoleStatusId(e.target.value)}
                disabled={!subRoleId || availableStatuses.length === 0}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white disabled:opacity-50"
              >
                <option value="">
                  {availableStatuses.length === 0 && subRoleId
                    ? '(sub-role ini tidak punya tingkatan status)'
                    : '— tanpa status —'}
                </option>
                {availableStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Tanggal Mulai</span>
              <input
                type="date"
                value={tanggalMulai}
                onChange={(e) => setTanggalMulai(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Catatan (opsional)</span>
              <input
                type="text"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="Mis. dilantik 2025"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            {duplicateActive && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                Jemaat ini sudah memiliki role aktif untuk kombinasi tersebut.
                Akhiri yang lama dulu atau pilih sub-role berbeda.
              </div>
            )}
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
              disabled={
                !roleId || !subRoleId || createMut.isPending || duplicateActive
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Tambah
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============== Kartu QR Jemaat ==============
// Tampilkan kode + QR. Kode dipakai untuk scan check-in event (sec 24 KB).
// QR di-render via api.qrserver.com (pattern sama dgn QR kode reservasi).

function JemaatQrCard({ kode, nama }: { kode: string; nama: string }) {
  const [copied, setCopied] = useState(false);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(kode)}`;

  function copyKode() {
    navigator.clipboard?.writeText(kode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-100">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <QrCode className="w-4 h-4 text-brand-500" />
          Kartu QR Jemaat
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Kode unik {nama} untuk scan check-in event yang butuh kehadiran.
          Cetak atau kirim QR ini ke jemaat.
        </p>
      </div>
      <div className="p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl}
          alt={`QR ${kode}`}
          className="w-40 h-40 border border-neutral-200 rounded bg-white p-2 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
            Kode
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="px-3 py-2 bg-neutral-100 rounded text-lg font-mono tracking-wider text-neutral-900">
              {kode}
            </code>
            <button
              onClick={copyKode}
              className="inline-flex items-center gap-1 px-2 py-2 text-xs font-medium border border-neutral-300 rounded hover:bg-neutral-50"
              title="Copy kode"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-neutral-500 mt-3 leading-relaxed">
            Saat hari H event, admin scan QR ini (atau ketik kode manual) di halaman event
            → tombol <strong>Check-in</strong>. Sistem otomatis mark partisipasi sebagai HADIR.
          </p>
        </div>
      </div>
    </section>
  );
}
