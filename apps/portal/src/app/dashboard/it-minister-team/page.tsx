'use client';

/**
 * Team IT Minister — management page.
 *
 * Kanban view per divisi (HEAD / COORDINATOR / PRODUCT / DATA / OPERATION)
 * dgn add / edit / deactivate assignment. Data source /admin/it-minister-team.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  Users,
  UserPlus,
  Crown,
  Wrench,
  Database,
  ClipboardList,
  Trash2,
  Power,
  PowerOff,
  X,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type Divisi = 'HEAD' | 'COORDINATOR' | 'PRODUCT' | 'DATA' | 'OPERATION';
type RoleTitle =
  | 'HEAD_IT_MINISTER'
  | 'IT_COORDINATOR'
  | 'HEAD_PRODUCT'
  | 'SPECIFIC_PRODUCT'
  | 'HEAD_DATA'
  | 'DATA_MEMBER'
  | 'HEAD_OPERATION'
  | 'OPERATION_L0'
  | 'OPERATION_L1'
  | 'OPERATION_L2';

interface Assignment {
  id: string;
  jemaatId: string;
  divisi: Divisi;
  roleTitle: RoleTitle;
  cabangId: string | null;
  productArea: string | null;
  isActive: boolean;
  joinedAt: string;
  leftAt: string | null;
  catatan: string | null;
  jemaat: { id: string; namaLengkap: string; noHp: string | null; kode: string | null; fotoUrl: string | null };
  cabang: { id: string; nama: string; kode: string } | null;
}

const ROLE_LABEL: Record<RoleTitle, string> = {
  HEAD_IT_MINISTER: 'Head IT Minister',
  IT_COORDINATOR: 'IT Coordinator (ECC)',
  HEAD_PRODUCT: 'Head Product Minister',
  SPECIFIC_PRODUCT: 'Specific Product Minister',
  HEAD_DATA: 'Head Data Minister',
  DATA_MEMBER: 'Data Minister',
  HEAD_OPERATION: 'Head Operation Minister',
  OPERATION_L0: 'Operation Minister L0',
  OPERATION_L1: 'Operation Minister L1',
  OPERATION_L2: 'Operation Minister L2',
};

const DIVISI_META: Record<Divisi, { label: string; color: string; icon: typeof Crown }> = {
  HEAD: { label: 'Pimpinan', color: 'from-neutral-800 to-neutral-900', icon: Crown },
  COORDINATOR: { label: 'IT Coordinator (ECC)', color: 'from-blue-600 to-blue-700', icon: ClipboardList },
  PRODUCT: { label: 'Product', color: 'from-orange-500 to-amber-500', icon: ClipboardList },
  DATA: { label: 'Data', color: 'from-purple-500 to-fuchsia-600', icon: Database },
  OPERATION: { label: 'Operation', color: 'from-emerald-500 to-green-600', icon: Wrench },
};

export default function TeamITMinisterPage() {
  const qc = useQueryClient();
  const [showActive, setShowActive] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery({
    queryKey: ['it-minister-team', showActive],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Assignment[] }>('/admin/it-minister-team', {
        params: { isActive: showActive ? true : undefined },
      });
      return res.data.data;
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/admin/it-minister-team/${id}`, { isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['it-minister-team'] });
      toast.success('Status di-update');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal update'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/it-minister-team/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['it-minister-team'] });
      toast.success('Assignment dihapus');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal hapus'),
  });

  const rows = q.data ?? [];
  const grouped: Record<Divisi, Assignment[]> = {
    HEAD: rows.filter((r) => r.divisi === 'HEAD'),
    COORDINATOR: rows.filter((r) => r.divisi === 'COORDINATOR'),
    PRODUCT: rows.filter((r) => r.divisi === 'PRODUCT'),
    DATA: rows.filter((r) => r.divisi === 'DATA'),
    OPERATION: rows.filter((r) => r.divisi === 'OPERATION'),
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" />
            Team IT Minister
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Assignment jemaat ke divisi + role sesuai Protokol Departemen IT ECC.
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Tambah Anggota
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <button
          onClick={() => setShowActive(true)}
          className={`px-3 py-1.5 rounded-full font-medium ${
            showActive
              ? 'bg-brand-600 text-white'
              : 'bg-white border border-neutral-200 text-neutral-700'
          }`}
        >
          Aktif ({rows.filter((r) => r.isActive).length})
        </button>
        <button
          onClick={() => setShowActive(false)}
          className={`px-3 py-1.5 rounded-full font-medium ${
            !showActive
              ? 'bg-brand-600 text-white'
              : 'bg-white border border-neutral-200 text-neutral-700'
          }`}
        >
          Semua
        </button>
      </div>

      {/* Kanban */}
      {q.isLoading ? (
        <p className="text-sm text-neutral-500">Memuat…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(DIVISI_META) as Divisi[]).map((divisi) => {
            const meta = DIVISI_META[divisi];
            const items = grouped[divisi];
            const Icon = meta.icon;
            return (
              <div
                key={divisi}
                className="bg-white border border-neutral-200 rounded-xl overflow-hidden"
              >
                <div className={`px-4 py-3 bg-gradient-to-r ${meta.color} text-white flex items-center gap-2`}>
                  <Icon className="w-4 h-4" />
                  <h2 className="font-semibold text-sm">{meta.label}</h2>
                  <span className="ml-auto text-xs bg-white/20 px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>
                <div className="p-3 space-y-2 min-h-[100px]">
                  {items.length === 0 ? (
                    <p className="text-xs text-neutral-400 text-center py-4">
                      Belum ada anggota
                    </p>
                  ) : (
                    items.map((a) => (
                      <MemberCard
                        key={a.id}
                        assignment={a}
                        onToggle={() =>
                          toggleMut.mutate({ id: a.id, isActive: !a.isActive })
                        }
                        onDelete={() => {
                          if (confirm(`Hapus assignment ${a.jemaat.namaLengkap} dari ${ROLE_LABEL[a.roleTitle]}?`)) {
                            deleteMut.mutate(a.id);
                          }
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {addOpen && <AddModal onClose={() => setAddOpen(false)} />}
    </div>
  );
}

function MemberCard({
  assignment: a,
  onToggle,
  onDelete,
}: {
  assignment: Assignment;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`border rounded-lg p-3 text-sm ${
        a.isActive
          ? 'bg-neutral-50 border-neutral-200'
          : 'bg-neutral-100 border-neutral-200 opacity-60'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-neutral-900 truncate">{a.jemaat.namaLengkap}</p>
          <p className="text-xs text-orange-700 font-medium">{ROLE_LABEL[a.roleTitle]}</p>
          {a.cabang && <p className="text-[11px] text-neutral-500 mt-0.5">📍 {a.cabang.nama}</p>}
          {a.productArea && <p className="text-[11px] text-neutral-500 mt-0.5">📦 {a.productArea}</p>}
          {a.jemaat.noHp && (
            <p className="text-[11px] text-neutral-500 mt-0.5">{a.jemaat.noHp}</p>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onToggle}
            className={`p-1.5 rounded ${
              a.isActive
                ? 'text-emerald-600 hover:bg-emerald-50'
                : 'text-neutral-400 hover:bg-neutral-200'
            }`}
            title={a.isActive ? 'Deactivate' : 'Activate'}
          >
            {a.isActive ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded text-red-500 hover:bg-red-50"
            title="Hapus"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function AddModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [jemaatSearch, setJemaatSearch] = useState('');
  const [jemaatId, setJemaatId] = useState('');
  const [roleTitle, setRoleTitle] = useState<RoleTitle>('OPERATION_L0');
  const [cabangId, setCabangId] = useState('');
  const [productArea, setProductArea] = useState('');
  const [catatan, setCatatan] = useState('');

  const jemaatQ = useQuery({
    queryKey: ['jemaat-search', jemaatSearch],
    queryFn: async () => {
      const res = await apiClient.get<{ data: any[] }>('/admin/jemaat', {
        params: { search: jemaatSearch, limit: 10 },
      });
      return res.data.data;
    },
    enabled: jemaatSearch.length >= 2,
  });

  const cabangQ = useQuery({
    queryKey: ['cabang-list-all'],
    queryFn: async () => {
      const res = await apiClient.get<any[]>('/auth/cabang', { params: { isActive: true } });
      return res.data;
    },
  });

  const needsCabang = roleTitle === 'DATA_MEMBER';
  const needsArea = roleTitle === 'SPECIFIC_PRODUCT';

  const createMut = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      apiClient.post('/admin/it-minister-team', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['it-minister-team'] });
      toast.success('Anggota ditambahkan');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal tambah anggota'),
  });

  function submit() {
    if (!jemaatId) return toast.error('Pilih jemaat dulu');
    if (needsCabang && !cabangId) return toast.error('Pilih cabang untuk Data Minister');
    if (needsArea && !productArea.trim()) return toast.error('Isi Product Area untuk Specific Product Minister');
    createMut.mutate({
      jemaatId,
      roleTitle,
      cabangId: needsCabang ? cabangId : null,
      productArea: needsArea ? productArea.trim() : null,
      catatan: catatan.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 sticky top-0 bg-white">
          <h2 className="font-semibold text-lg">Tambah Anggota IT Minister</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Jemaat picker */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Jemaat</label>
            <input
              type="text"
              value={jemaatSearch}
              onChange={(e) => setJemaatSearch(e.target.value)}
              placeholder="Ketik minimal 2 karakter…"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            />
            {jemaatQ.data && jemaatQ.data.length > 0 && (
              <div className="mt-2 border border-neutral-200 rounded-lg max-h-40 overflow-y-auto">
                {jemaatQ.data.map((j: any) => (
                  <button
                    key={j.id}
                    onClick={() => {
                      setJemaatId(j.id);
                      setJemaatSearch(j.namaLengkap);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 border-b border-neutral-100 last:border-0 ${
                      jemaatId === j.id ? 'bg-orange-100 font-medium' : ''
                    }`}
                  >
                    {j.namaLengkap}
                    {j.noHp && <span className="text-xs text-neutral-500 ml-2">{j.noHp}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Role</label>
            <select
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value as RoleTitle)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            >
              {(Object.keys(ROLE_LABEL) as RoleTitle[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional cabang */}
          {needsCabang && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Cabang</label>
              <select
                value={cabangId}
                onChange={(e) => setCabangId(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              >
                <option value="">— pilih cabang —</option>
                {cabangQ.data?.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Conditional area */}
          {needsArea && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Product Area</label>
              <input
                type="text"
                value={productArea}
                onChange={(e) => setProductArea(e.target.value)}
                placeholder="mis. Els App, ECC Portal, Website"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
              />
            </div>
          )}

          {/* Catatan */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Catatan (opsional)
            </label>
            <textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
          >
            Batal
          </button>
          <button
            onClick={submit}
            disabled={createMut.isPending}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {createMut.isPending ? 'Menyimpan…' : 'Tambah'}
          </button>
        </div>
      </div>
    </div>
  );
}
