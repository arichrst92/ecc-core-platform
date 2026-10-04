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
  Home as HomeIcon,
  Megaphone,
  Church,
  Users as UsersGroup,
  Store,
  ExternalLink,
  ChevronRight,
  MessageCircle,
  Handshake,
  MapPinned,
  FileText,
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
  user?: { lastLoginAt: string | null } | null;
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
      <div className="flex items-center justify-between mb-3">
        <Link
          href="/dashboard/jemaat"
          className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="w-3 h-3" /> Kembali ke daftar jemaat
        </Link>
        <button
          onClick={async () => {
            // Buka tab dulu di user-gesture context (iOS Safari popup fix)
            const printWin = window.open('', '_blank');
            try {
              const res = await apiClient.get(`/admin/jemaat/${jemaatId}/export?format=pdf`, {
                responseType: 'blob',
              });
              const url = URL.createObjectURL(res.data as Blob);
              if (printWin) {
                printWin.location.href = url;
              } else {
                // Popup blocked → fallback same-tab navigation
                window.location.href = url;
              }
              setTimeout(() => URL.revokeObjectURL(url), 20_000);
            } catch (e) {
              if (printWin) printWin.close();
              toast.error('Gagal export. Cek console.');
              // eslint-disable-next-line no-console
              console.error('[jemaat detail export] failed', e);
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200"
          title="Buka print view — Ctrl+P untuk save PDF"
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      {/* Profile header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-6 mb-6 flex flex-col sm:flex-row items-stretch sm:items-start gap-4 sm:gap-5">
        {j.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${apiBase}${j.fotoUrl}`}
            alt={j.namaLengkap}
            className="w-24 h-24 rounded-full object-cover border-2 border-neutral-200 mx-auto sm:mx-0 shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mx-auto sm:mx-0 shrink-0">
            <UserIcon className="w-10 h-10" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-neutral-900">{j.namaLengkap}</h1>
          <div className="text-sm text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
            {j.cabang?.nama && (
              <Link
                href={`/dashboard/cabang/${j.cabang.id}`}
                className="hover:text-brand-600 hover:underline"
              >
                {j.cabang.nama}
              </Link>
            )}
            {j.jenisKelamin && <span>· {j.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</span>}
            {j.user?.lastLoginAt ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"
                title={new Date(j.user.lastLoginAt).toLocaleString('id-ID')}
              >
                <Clock className="w-3 h-3" />
                Login {formatRelativeTime(j.user.lastLoginAt)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-50 text-red-700 border border-red-200">
                <Clock className="w-3 h-3" />
                Belum pernah login
              </span>
            )}
            {!j.isActive && (
              <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-500">
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
        <div className="flex flex-row sm:flex-col gap-2 shrink-0 flex-wrap">
          <button
            onClick={() => setEditOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm flex-1 sm:flex-none"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Profile
          </button>
          <ContactButtons noHp={j.noHp} email={j.email} nama={j.namaLengkap} />
        </div>
      </div>

      {/* Kartu QR jemaat — kode untuk scan check-in event */}
      {j.kode && <JemaatQrCard kode={j.kode} nama={j.namaLengkap} />}

      {/* Pelayanan section */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden mt-6">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100 flex-wrap gap-2">
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
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100 flex-wrap gap-2">
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

      {/* History sections: Homecell + Event + Ibadah + Group + Business */}
      <JemaatHistorySections jemaatId={jemaatId} />

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
  jemaatTerkait: {
    id: string;
    namaLengkap: string;
    fotoUrl: string | null;
    noHp: string | null;
    email: string | null;
  };
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
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100 flex-wrap gap-2">
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
                <ContactButtons
                  noHp={r.jemaatTerkait.noHp}
                  email={r.jemaatTerkait.email}
                  nama={r.jemaatTerkait.namaLengkap}
                  compact
                />
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

// ============================================================
//  Helpers + History Sections
// ============================================================

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return '';
  if (diff < 0) return 'baru saja';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s lalu`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}h lalu`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}bln lalu`;
  return `${Math.floor(day / 365)}thn lalu`;
}

function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  };
  return d.toLocaleString('id-ID', opts);
}

interface JemaatProfileData {
  homecells: Array<{
    id: string;
    tanggalBergabung: string;
    tanggalKeluar: string | null;
    isActive: boolean;
    homecell: {
      id: string;
      nama: string;
      area: { id: string; nama: string } | null;
    };
    attendance: {
      totalHadir: number;
      lastAttended: string | null;
      recentHistory: Array<{
        id: string;
        scannedAt: string;
        source: string;
        schedule: { id: string; tanggal: string } | null;
      }>;
    };
  }>;
  events: Array<{
    id: string;
    status: string;
    registeredAt: string;
    attendedAt: string | null;
    paidAt: string | null;
    cancelledAt: string | null;
    nominalBayar: string | null;
    event: {
      id: string;
      slug: string | null;
      judul: string;
      tanggalMulai: string;
      tanggalSelesai: string | null;
      lokasi: string | null;
      tipeBayar: string;
    };
  }>;
  ibadah: Array<{
    id: string;
    status: string;
    tanggalIbadah: string;
    reservedAt: string;
    joinedAt: string | null;
    cancelledAt: string | null;
    ibadah: { id: string; nama: string; jamMulai: string | null; lokasi: string | null };
  }>;
  groups: Array<{
    id: string;
    tanggalBergabung: string;
    tanggalKeluar: string | null;
    isActive: boolean;
    group: {
      id: string;
      nama: string;
      jenis: string | null;
      cabang: { nama: string } | null;
    };
  }>;
  businesses: Array<{
    id: string;
    nama: string;
    industri: string | null;
    tipeBisnis: string;
    isActive: boolean;
    createdAt: string;
  }>;
  visits: Array<{
    id: string;
    judul: string;
    lokasi: string | null;
    tanggalVisit: string;
    noteDariInitiator: string | null;
    noteDariTarget: string | null;
    createdAt: string;
    initiatorJemaatId: string;
    targetJemaatId: string;
    initiator: { id: string; namaLengkap: string; fotoUrl: string | null };
    target: { id: string; namaLengkap: string; fotoUrl: string | null };
  }>;
  activity: {
    windowDays: number;
    score: number;
    tier: 'PASIF' | 'KURANG_AKTIF' | 'CUKUP_AKTIF' | 'AKTIF' | 'SANGAT_AKTIF';
    breakdown: {
      homecellAttendance: number;
      eventParticipation: number;
      ibadahReservasi: number;
      visit: number;
    };
  };
}

function JemaatHistorySections({ jemaatId }: { jemaatId: string }) {
  const q = useQuery({
    queryKey: ['jemaat', 'profile', jemaatId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: JemaatProfileData }>(
        `/admin/jemaat/${jemaatId}/profile`,
      );
      return res.data.data;
    },
  });

  if (q.isLoading) {
    return (
      <div className="mt-6 flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }
  if (!q.data) return null;
  const d = q.data;

  return (
    <>
      <ActivityIndicator activity={d.activity} />
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HomecellSection homecells={d.homecells} />
        <GroupSection groups={d.groups} />
        <EventHistorySection events={d.events} />
        <IbadahHistorySection ibadah={d.ibadah} />
        <VisitSection visits={d.visits} selfJemaatId={jemaatId} />
        <BusinessSection businesses={d.businesses} />
      </div>
    </>
  );
}

const ACTIVITY_TIERS: Array<{
  key: JemaatProfileData['activity']['tier'];
  label: string;
  color: string;
  bar: string;
  emoji: string;
}> = [
  { key: 'PASIF', label: 'Pasif', color: 'text-red-700 bg-red-50 border-red-200', bar: 'bg-red-500', emoji: '😴' },
  { key: 'KURANG_AKTIF', label: 'Kurang Aktif', color: 'text-orange-700 bg-orange-50 border-orange-200', bar: 'bg-orange-500', emoji: '🙂' },
  { key: 'CUKUP_AKTIF', label: 'Cukup Aktif', color: 'text-amber-700 bg-amber-50 border-amber-200', bar: 'bg-amber-500', emoji: '😊' },
  { key: 'AKTIF', label: 'Aktif', color: 'text-lime-700 bg-lime-50 border-lime-200', bar: 'bg-lime-500', emoji: '🙌' },
  { key: 'SANGAT_AKTIF', label: 'Sangat Aktif', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', bar: 'bg-emerald-500', emoji: '🔥' },
];

function ActivityIndicator({ activity }: { activity: JemaatProfileData['activity'] }) {
  const currentIdx = ACTIVITY_TIERS.findIndex((t) => t.key === activity.tier);
  const current = (ACTIVITY_TIERS[currentIdx] ?? ACTIVITY_TIERS[0]) as (typeof ACTIVITY_TIERS)[number];
  // Percent progress: max score mapping to 100%. Cap untuk visual bar.
  const maxForBar = 25;
  const pct = Math.min(100, (activity.score / maxForBar) * 100);

  return (
    <section className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-100">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2 text-sm">
          <span className="text-base">{current.emoji}</span>
          Indikator Keaktifan — 3 Bulan Terakhir
        </h2>
      </div>
      <div className="p-6">
        {/* Current tier label */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <div className={`inline-block px-3 py-1.5 rounded-lg border text-sm font-bold ${current.color}`}>
              {current.label}
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Skor aktivitas: <strong className="text-neutral-900">{activity.score}</strong> aktivitas
            </p>
          </div>
          <div className="text-right text-xs text-neutral-500 hidden sm:block">
            Window: {activity.windowDays} hari terakhir
          </div>
        </div>

        {/* Tier progression bar */}
        <div className="relative h-2.5 bg-neutral-100 rounded-full overflow-hidden mb-2">
          <div
            className={`absolute top-0 left-0 h-full ${current.bar} transition-all duration-500`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-neutral-500">
          {ACTIVITY_TIERS.map((t, i) => (
            <span
              key={t.key}
              className={`${i === currentIdx ? 'font-bold text-neutral-900' : ''}`}
            >
              {t.label}
            </span>
          ))}
        </div>

        {/* Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
          <BreakdownStat label="Homecell" value={activity.breakdown.homecellAttendance} color="blue" />
          <BreakdownStat label="Event" value={activity.breakdown.eventParticipation} color="orange" />
          <BreakdownStat label="Ibadah" value={activity.breakdown.ibadahReservasi} color="indigo" />
          <BreakdownStat label="Visit" value={activity.breakdown.visit} color="rose" />
        </div>
      </div>
    </section>
  );
}

function BreakdownStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'orange' | 'indigo' | 'rose';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-900 border-blue-200',
    orange: 'bg-orange-50 text-orange-900 border-orange-200',
    indigo: 'bg-indigo-50 text-indigo-900 border-indigo-200',
    rose: 'bg-rose-50 text-rose-900 border-rose-200',
  };
  return (
    <div className={`px-3 py-2 rounded-lg border text-center ${colors[color]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
    </div>
  );
}

/** Normalize nomor HP ke E.164 untuk link WhatsApp (strip "+" dan non-digit). */
function waNumber(noHp: string): string {
  return noHp.replace(/[^\d]/g, '');
}

function ContactButtons({
  noHp,
  email,
  nama,
  compact = false,
}: {
  noHp: string | null;
  email: string | null;
  nama: string;
  compact?: boolean;
}) {
  const greeting = `Halo ${nama}, `;
  const waUrl = noHp
    ? `https://wa.me/${waNumber(noHp)}?text=${encodeURIComponent(greeting)}`
    : null;
  const mailUrl = email
    ? `mailto:${email}?subject=${encodeURIComponent('Dari Portal ECC')}&body=${encodeURIComponent(greeting)}`
    : null;

  if (compact) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
            title={`WhatsApp ${noHp}`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="p-1.5 text-neutral-300" title="No HP tidak tersedia">
            <MessageCircle className="w-3.5 h-3.5" />
          </span>
        )}
        {mailUrl ? (
          <a
            href={mailUrl}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
            title={`Email ${email}`}
          >
            <Mail className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="p-1.5 text-neutral-300" title="Email tidak tersedia">
            <Mail className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-row sm:flex-col gap-1.5 flex-1 sm:flex-none">
      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold"
          title={`WhatsApp ${noHp}`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp
        </a>
      ) : (
        <button
          disabled
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-400 rounded-lg text-xs font-semibold cursor-not-allowed"
          title="No HP tidak tersedia"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          WhatsApp
        </button>
      )}
      {mailUrl ? (
        <a
          href={mailUrl}
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold"
          title={`Email ${email}`}
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </a>
      ) : (
        <button
          disabled
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-400 rounded-lg text-xs font-semibold cursor-not-allowed"
          title="Email tidak tersedia"
        >
          <Mail className="w-3.5 h-3.5" />
          Email
        </button>
      )}
    </div>
  );
}

function VisitSection({
  visits,
  selfJemaatId,
}: {
  visits: JemaatProfileData['visits'];
  selfJemaatId: string;
}) {
  return (
    <HistoryCard
      title="History Visit"
      icon={Handshake}
      count={visits.length}
      emptyLabel="Belum ada riwayat visit"
      color="from-rose-500 to-pink-600"
    >
      {visits.map((v) => {
        const isInitiator = v.initiatorJemaatId === selfJemaatId;
        const other = isInitiator ? v.target : v.initiator;
        return (
          <div key={v.id} className="px-5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900 truncate">{v.judul}</p>
                <div className="flex items-center gap-1.5 text-xs text-neutral-600 mt-1">
                  <span className="text-neutral-400">{isInitiator ? '→' : '←'}</span>
                  <Link
                    href={`/dashboard/jemaat/${other.id}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    {other.namaLengkap}
                  </Link>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      isInitiator
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-pink-50 text-pink-700'
                    }`}
                  >
                    {isInitiator ? 'Saya kunjungi' : 'Mengunjungi saya'}
                  </span>
                </div>
                {v.lokasi && (
                  <p className="text-[11px] text-neutral-500 mt-0.5 flex items-center gap-1">
                    <MapPinned className="w-3 h-3" />
                    {v.lokasi}
                  </p>
                )}
                {(v.noteDariInitiator || v.noteDariTarget) && (
                  <details className="mt-1.5">
                    <summary className="text-[11px] text-brand-600 cursor-pointer hover:underline">
                      Catatan
                    </summary>
                    <div className="mt-1 pl-3 space-y-1 text-[11px] text-neutral-600 border-l-2 border-neutral-200">
                      {v.noteDariInitiator && (
                        <p>
                          <span className="font-semibold">{v.initiator.namaLengkap}:</span>{' '}
                          {v.noteDariInitiator}
                        </p>
                      )}
                      {v.noteDariTarget && (
                        <p>
                          <span className="font-semibold">{v.target.namaLengkap}:</span>{' '}
                          {v.noteDariTarget}
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[11px] text-neutral-500">
                  {formatDate(v.tanggalVisit)}
                </div>
                <div className="text-[10px] text-neutral-400 mt-0.5">
                  {formatRelativeTime(v.tanggalVisit)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </HistoryCard>
  );
}

function HistoryCard({
  title,
  icon: Icon,
  count,
  emptyLabel,
  color,
  children,
}: {
  title: string;
  icon: typeof HomeIcon;
  count: number;
  emptyLabel: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className={`px-5 py-3 border-b border-neutral-100 bg-gradient-to-r ${color}`}>
        <h2 className="font-semibold text-white flex items-center gap-2 text-sm">
          <Icon className="w-4 h-4" />
          {title}
          <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">
            {count}
          </span>
        </h2>
      </div>
      <div className="divide-y divide-neutral-100 max-h-96 overflow-y-auto">
        {count === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-neutral-400">{emptyLabel}</div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function HomecellSection({ homecells }: { homecells: JemaatProfileData['homecells'] }) {
  return (
    <HistoryCard
      title="Homecell"
      icon={HomeIcon}
      count={homecells.length}
      emptyLabel="Belum tergabung di homecell manapun"
      color="from-blue-600 to-blue-700"
    >
      {homecells.map((h) => (
        <div key={h.id} className="px-5 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Link
                href={`/dashboard/homecell/${h.homecell.id}`}
                className="font-medium text-neutral-900 hover:text-brand-600 hover:underline flex items-center gap-1"
              >
                {h.homecell.nama}
                <ExternalLink className="w-3 h-3 opacity-50" />
              </Link>
              {h.homecell.area && (
                <Link
                  href={`/dashboard/homecell-area?search=${encodeURIComponent(h.homecell.area.nama)}`}
                  className="text-xs text-neutral-500 hover:text-brand-600 hover:underline block"
                >
                  Area: {h.homecell.area.nama}
                </Link>
              )}
              <div className="text-[11px] text-neutral-500 mt-1 flex flex-wrap gap-x-3">
                <span>Bergabung {formatDate(h.tanggalBergabung)}</span>
                {h.tanggalKeluar && <span>Keluar {formatDate(h.tanggalKeluar)}</span>}
                {!h.isActive && <span className="text-neutral-400 italic">Nonaktif</span>}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-blue-700">
                {h.attendance.totalHadir}
              </div>
              <div className="text-[10px] text-neutral-500 uppercase tracking-wide">Hadir</div>
              {h.attendance.lastAttended && (
                <div className="text-[10px] text-neutral-400 mt-0.5">
                  Terakhir {formatRelativeTime(h.attendance.lastAttended)}
                </div>
              )}
            </div>
          </div>
          {h.attendance.recentHistory.length > 0 && (
            <details className="mt-2">
              <summary className="text-[11px] text-brand-600 cursor-pointer hover:underline">
                Riwayat kehadiran ({h.attendance.recentHistory.length})
              </summary>
              <ul className="mt-1 pl-4 space-y-0.5 text-[11px] text-neutral-600">
                {h.attendance.recentHistory.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                    {formatDate(a.scannedAt, true)}
                    <span className="text-neutral-400">({a.source})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}
    </HistoryCard>
  );
}

function EventHistorySection({ events }: { events: JemaatProfileData['events'] }) {
  return (
    <HistoryCard
      title="History Event"
      icon={Megaphone}
      count={events.length}
      emptyLabel="Belum pernah mendaftar event"
      color="from-orange-500 to-amber-500"
    >
      {events.map((e) => (
        <Link
          key={e.id}
          href={`/dashboard/event/${e.event.id}`}
          className="block px-5 py-3 hover:bg-neutral-50"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-900 truncate flex items-center gap-1">
                {e.event.judul}
                <ChevronRight className="w-3 h-3 text-neutral-400" />
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {formatDate(e.event.tanggalMulai)}
                {e.event.lokasi && ` · ${e.event.lokasi}`}
              </p>
            </div>
            <EventStatusBadge status={e.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-neutral-500">
            <span>Daftar {formatRelativeTime(e.registeredAt)}</span>
            {e.paidAt && <span>Bayar {formatRelativeTime(e.paidAt)}</span>}
            {e.attendedAt && <span>Hadir {formatRelativeTime(e.attendedAt)}</span>}
            {e.cancelledAt && (
              <span className="text-red-500">Batal {formatRelativeTime(e.cancelledAt)}</span>
            )}
          </div>
        </Link>
      ))}
    </HistoryCard>
  );
}

function EventStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DAFTAR: 'bg-blue-100 text-blue-700',
    MENUNGGU_VERIFIKASI: 'bg-amber-100 text-amber-700',
    BAYAR: 'bg-emerald-100 text-emerald-700',
    HADIR: 'bg-purple-100 text-purple-700',
    BATAL: 'bg-neutral-200 text-neutral-500',
  };
  return (
    <span
      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
        map[status] ?? 'bg-neutral-100 text-neutral-700'
      }`}
    >
      {status}
    </span>
  );
}

function IbadahHistorySection({ ibadah }: { ibadah: JemaatProfileData['ibadah'] }) {
  return (
    <HistoryCard
      title="History Ibadah"
      icon={Church}
      count={ibadah.length}
      emptyLabel="Belum pernah reservasi ibadah"
      color="from-indigo-600 to-indigo-700"
    >
      {ibadah.map((r) => (
        <Link
          key={r.id}
          href={`/dashboard/ibadah/${r.ibadah.id}`}
          className="block px-5 py-3 hover:bg-neutral-50"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-900 truncate flex items-center gap-1">
                {r.ibadah.nama}
                <ChevronRight className="w-3 h-3 text-neutral-400" />
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {formatDate(r.tanggalIbadah)}
                {r.ibadah.jamMulai && ` · ${r.ibadah.jamMulai}`}
                {r.ibadah.lokasi && ` · ${r.ibadah.lokasi}`}
              </p>
            </div>
            <IbadahStatusBadge status={r.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-neutral-500">
            <span>Reservasi {formatRelativeTime(r.reservedAt)}</span>
            {r.joinedAt && <span>Join {formatRelativeTime(r.joinedAt)}</span>}
            {r.cancelledAt && (
              <span className="text-red-500">Batal {formatRelativeTime(r.cancelledAt)}</span>
            )}
          </div>
        </Link>
      ))}
    </HistoryCard>
  );
}

function IbadahStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    RESERVE: 'bg-blue-100 text-blue-700',
    JOIN: 'bg-emerald-100 text-emerald-700',
    CANCEL: 'bg-neutral-200 text-neutral-500',
  };
  return (
    <span
      className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${
        map[status] ?? 'bg-neutral-100 text-neutral-700'
      }`}
    >
      {status}
    </span>
  );
}

function GroupSection({ groups }: { groups: JemaatProfileData['groups'] }) {
  return (
    <HistoryCard
      title="Group / Komunitas"
      icon={UsersGroup}
      count={groups.length}
      emptyLabel="Belum tergabung di group manapun"
      color="from-purple-600 to-fuchsia-600"
    >
      {groups.map((g) => (
        <Link
          key={g.id}
          href={`/dashboard/group/${g.group.id}`}
          className="block px-5 py-3 hover:bg-neutral-50"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-900 truncate flex items-center gap-1">
                {g.group.nama}
                <ChevronRight className="w-3 h-3 text-neutral-400" />
              </p>
              <div className="text-xs text-neutral-500 mt-0.5 flex flex-wrap gap-x-2">
                {g.group.jenis && <span>{g.group.jenis}</span>}
                {g.group.cabang && <span>· {g.group.cabang.nama}</span>}
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Bergabung {formatDate(g.tanggalBergabung)}
                {g.tanggalKeluar && ` · Keluar ${formatDate(g.tanggalKeluar)}`}
              </div>
            </div>
            {!g.isActive && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-500">
                Nonaktif
              </span>
            )}
          </div>
        </Link>
      ))}
    </HistoryCard>
  );
}

function BusinessSection({ businesses }: { businesses: JemaatProfileData['businesses'] }) {
  return (
    <HistoryCard
      title="Local Market"
      icon={Store}
      count={businesses.length}
      emptyLabel="Belum terdaftar sebagai pemilik bisnis"
      color="from-emerald-600 to-teal-600"
    >
      {businesses.map((b) => (
        <Link
          key={b.id}
          href={`/dashboard/local-business?search=${encodeURIComponent(b.nama)}`}
          className="block px-5 py-3 hover:bg-neutral-50"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-900 truncate flex items-center gap-1">
                {b.nama}
                <ChevronRight className="w-3 h-3 text-neutral-400" />
              </p>
              <div className="text-xs text-neutral-500 mt-0.5 flex flex-wrap gap-x-2">
                <span className="font-medium">{b.tipeBisnis}</span>
                {b.industri && <span>· {b.industri}</span>}
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Terdaftar {formatDate(b.createdAt)}
              </div>
            </div>
            {!b.isActive && (
              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-500">
                Nonaktif
              </span>
            )}
          </div>
        </Link>
      ))}
    </HistoryCard>
  );
}
