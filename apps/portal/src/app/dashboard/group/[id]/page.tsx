'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Users,
  Loader2,
  MapPin,
  Calendar,
  Clock,
  Globe,
  Lock,
  Copy,
  Check,
  RefreshCw,
  UserPlus,
  UserMinus,
  Trash2,
  ChevronRight,
  Info,
  UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

interface GroupMember {
  id: string;
  groupId: string;
  jemaatId: string;
  tanggalBergabung: string;
  tanggalKeluar: string | null;
  isActive: boolean;
  catatan: string | null;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
}

interface GroupDetail {
  id: string;
  cabangId: string;
  parentId: string | null;
  nama: string;
  deskripsi: string | null;
  jenis: string;
  alamat: string | null;
  gps: string | null;
  hari: string | null;
  jam: string | null;
  picJemaatId: string | null;
  isPublic: boolean;
  joinCode: string | null;
  isActive: boolean;
  legacyShiftsoftCircleId: number | null;
  cabang: { id: string; nama: string; kode: string };
  parent: { id: string; nama: string } | null;
  children: Array<{ id: string; nama: string; jenis: string; _count: { members: number } }>;
  picJemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null } | null;
  members: GroupMember[];
  memberCount: number;
}

interface JemaatPickItem {
  id: string;
  namaLengkap: string;
  noHp: string | null;
}

const JENIS_LABEL: Record<string, string> = {
  FAMILY: 'Family',
  MINISTRY: 'Ministry',
  COMMUNITY: 'Community',
  HOMECELL_STYLE: 'Homecell',
  SYSTEM: 'System',
  LAINNYA: 'Lainnya',
};
const JENIS_COLORS: Record<string, string> = {
  FAMILY: 'bg-pink-100 text-pink-700',
  MINISTRY: 'bg-blue-100 text-blue-700',
  COMMUNITY: 'bg-purple-100 text-purple-700',
  HOMECELL_STYLE: 'bg-green-100 text-green-700',
  SYSTEM: 'bg-neutral-100 text-neutral-500',
  LAINNYA: 'bg-neutral-100 text-neutral-600',
};

export default function GroupDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const groupId = params.id;

  const [addOpen, setAddOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [removingMember, setRemovingMember] = useState<GroupMember | null>(null);

  const detailQ = useQuery({
    queryKey: ['group', 'detail', groupId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: GroupDetail }>(`/admin/group/${groupId}`);
      return res.data.data;
    },
  });

  const regenerateMut = useMutation({
    mutationFn: async () =>
      apiClient.post<{ data: { joinCode: string } }>(
        `/admin/group/${groupId}/regenerate-code`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', 'detail', groupId] });
      toast.success('Kode invitation baru berhasil di-generate');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal rotate kode'),
  });

  const removeMut = useMutation({
    mutationFn: async (jemaatId: string) =>
      apiClient.delete(`/admin/group/${groupId}/members/${jemaatId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', 'detail', groupId] });
      toast.success('Member berhasil dikeluarkan (notif WA terkirim)');
      setRemovingMember(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal remove'),
  });

  const dismissMut = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/group/${groupId}`),
    onSuccess: () => {
      toast.success('Group berhasil di-dismiss');
      router.push('/dashboard/group');
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal dismiss'),
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success('Kode disalin');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat group...
      </div>
    );
  }
  if (!detailQ.data) {
    return <div className="p-6 text-center text-neutral-500">Group tidak ditemukan.</div>;
  }

  const g = detailQ.data;

  return (
    <div className="space-y-6 max-w-5xl">
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
            <UsersRound className="w-6 h-6 text-brand-500" /> {g.nama}
          </h1>
          <div className="text-sm text-neutral-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${JENIS_COLORS[g.jenis] ?? 'bg-neutral-100'}`}
            >
              {JENIS_LABEL[g.jenis] ?? g.jenis}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                g.isPublic
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {g.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {g.isPublic ? 'Public' : 'Private'}
            </span>
            <Link
              href={`/dashboard/group?cabangId=${g.cabang.id}`}
              className="hover:underline"
            >
              {g.cabang.nama}
            </Link>
            {g.parent && (
              <>
                <ChevronRight className="w-3 h-3 text-neutral-300" />
                <Link href={`/dashboard/group/${g.parent.id}`} className="hover:underline">
                  {g.parent.nama}
                </Link>
              </>
            )}
          </div>
        </div>
        {!g.isActive && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-500">
            Dismissed
          </span>
        )}
        {g.isActive && (
          <button
            onClick={() => setDismissOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> Dismiss Group
          </button>
        )}
      </div>

      {/* Info + Join code card */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold text-neutral-900 mb-3">Detail Group</h2>
          <div className="space-y-2 text-sm">
            {g.deskripsi && (
              <div>
                <div className="text-xs text-neutral-500 mb-1">Deskripsi</div>
                <p className="text-neutral-700 whitespace-pre-line">{g.deskripsi}</p>
              </div>
            )}
            {g.alamat && (
              <div className="flex items-start gap-2 text-neutral-700">
                <MapPin className="w-4 h-4 mt-0.5 text-neutral-400 shrink-0" />
                <div>
                  {g.alamat}
                  {g.gps && (
                    <a
                      href={`https://www.google.com/maps?q=${encodeURIComponent(g.gps)}`}
                      target="_blank"
                      rel="noopener"
                      className="ml-2 text-xs text-brand-600 hover:underline"
                    >
                      Lihat peta
                    </a>
                  )}
                </div>
              </div>
            )}
            {(g.hari || g.jam) && (
              <div className="flex items-center gap-2 text-neutral-700">
                <Calendar className="w-4 h-4 text-neutral-400" />
                {g.hari && <span>{g.hari.charAt(0) + g.hari.slice(1).toLowerCase()}</span>}
                {g.jam && (
                  <>
                    <Clock className="w-4 h-4 text-neutral-400 ml-2" />
                    <span>{g.jam}</span>
                  </>
                )}
              </div>
            )}
            <div>
              <div className="text-xs text-neutral-500 mb-1">PIC (Leader)</div>
              {g.picJemaat ? (
                <Link
                  href={`/dashboard/jemaat/${g.picJemaat.id}`}
                  className="flex items-center gap-2 text-brand-600 hover:underline"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold">
                    {g.picJemaat.namaLengkap.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium">{g.picJemaat.namaLengkap}</div>
                    <div className="text-xs text-neutral-500">{g.picJemaat.noHp ?? '-'}</div>
                  </div>
                </Link>
              ) : (
                <span className="text-neutral-400 italic">Belum ada PIC</span>
              )}
            </div>
          </div>
        </div>

        {/* Join code (private only) */}
        {!g.isPublic && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h2 className="font-semibold text-amber-900 mb-2 flex items-center gap-1.5">
              <Lock className="w-4 h-4" /> Kode Invitation
            </h2>
            <p className="text-xs text-amber-800 mb-3">
              Share kode ini via QR scan atau manual input untuk invite member.
            </p>
            {g.joinCode ? (
              <>
                <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg px-3 py-2 mb-3">
                  <code className="font-mono text-lg font-bold text-amber-900 tracking-wider flex-1">
                    {g.joinCode}
                  </code>
                  <button
                    onClick={() => copyCode(g.joinCode!)}
                    className="p-1.5 rounded hover:bg-amber-100 text-amber-800"
                    title="Copy"
                  >
                    {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <button
                  onClick={() => regenerateMut.mutate()}
                  disabled={regenerateMut.isPending}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-amber-300 text-amber-800 rounded hover:bg-amber-100"
                >
                  <RefreshCw className={`w-3 h-3 ${regenerateMut.isPending ? 'animate-spin' : ''}`} />
                  Rotate kode
                </button>
              </>
            ) : (
              <span className="text-xs text-amber-700 italic">
                Kode belum tersedia (Anda bukan PIC / admin).
              </span>
            )}
          </div>
        )}
      </div>

      {/* Children hierarchy (kalau ada) */}
      {g.children.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <h2 className="font-semibold text-neutral-900 mb-3">
            Sub-group ({g.children.length})
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {g.children.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/group/${c.id}`}
                className="flex items-center justify-between p-3 border border-neutral-200 rounded-lg hover:border-brand-300 hover:bg-brand-50"
              >
                <div className="min-w-0">
                  <div className="font-medium text-neutral-900 truncate">{c.nama}</div>
                  <div className="text-xs text-neutral-500 flex items-center gap-2">
                    <span
                      className={`px-1.5 py-0.5 rounded ${JENIS_COLORS[c.jenis] ?? 'bg-neutral-100'}`}
                    >
                      {JENIS_LABEL[c.jenis] ?? c.jenis}
                    </span>
                    · {c._count.members} member
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Members */}
      <div className="bg-white border border-neutral-200 rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-neutral-100">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <Users className="w-4 h-4" /> Members ({g.memberCount})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Add/remove member akan trigger notif WA otomatis.
            </p>
          </div>
          {g.isActive && (
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600"
            >
              <UserPlus className="w-4 h-4" /> Add Member
            </button>
          )}
        </div>
        {g.members.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            Belum ada member di group ini.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-5 py-2 font-medium">Nama</th>
                <th className="text-left px-5 py-2 font-medium">No HP</th>
                <th className="text-left px-5 py-2 font-medium">Bergabung</th>
                <th className="text-right px-5 py-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {g.members.map((m) => (
                <tr key={m.id}>
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
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setRemovingMember(m)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-600"
                      title="Remove member (kirim notif WA)"
                    >
                      <UserMinus className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {addOpen && (
        <AddMemberModal
          groupId={groupId}
          cabangId={g.cabang.id}
          existingIds={new Set(g.members.map((m) => m.jemaatId))}
          onClose={() => setAddOpen(false)}
        />
      )}

      <ConfirmDelete
        open={!!removingMember}
        title="Keluarkan member dari group?"
        itemName={removingMember?.jemaat.namaLengkap}
        onConfirm={() => removingMember && removeMut.mutate(removingMember.jemaatId)}
        onClose={() => setRemovingMember(null)}
        loading={removeMut.isPending}
      />

      <ConfirmDelete
        open={dismissOpen}
        title="Dismiss group ini?"
        itemName={g.nama}
        onConfirm={() => dismissMut.mutate()}
        onClose={() => setDismissOpen(false)}
        loading={dismissMut.isPending}
      />
    </div>
  );
}

// ============================================================
// Add Member Modal
// ============================================================

function AddMemberModal({
  groupId,
  cabangId,
  existingIds,
  onClose,
}: {
  groupId: string;
  cabangId: string;
  existingIds: Set<string>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const jemaatQ = useQuery({
    queryKey: ['jemaat', 'pick', cabangId, search],
    queryFn: async () => {
      const res = await apiClient.get<{ data: JemaatPickItem[] }>('/admin/jemaat', {
        params: { cabangId, search: search || undefined, limit: 50 },
      });
      return res.data.data;
    },
  });

  const available = (jemaatQ.data ?? []).filter((j) => !existingIds.has(j.id));

  const addMut = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Pilih jemaat dulu');
      return apiClient.post(`/admin/group/${groupId}/members/${selectedId}`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', 'detail', groupId] });
      toast.success('Member berhasil ditambahkan (notif WA terkirim)');
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? e.message ?? 'Gagal'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl">
        <div className="p-5 border-b border-neutral-100 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-brand-500" />
          <h3 className="font-semibold text-neutral-900">Tambah Member ke Group</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Cari Jemaat (dari cabang group)
            </label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik nama / no HP..."
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
            <div className="mt-2 max-h-60 overflow-y-auto border border-neutral-100 rounded-lg divide-y divide-neutral-50">
              {jemaatQ.isLoading ? (
                <div className="p-3 text-sm text-neutral-500">Memuat...</div>
              ) : available.length === 0 ? (
                <div className="p-3 text-sm text-neutral-400">
                  Tidak ada jemaat yang cocok / semuanya sudah member.
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
          <div className="text-xs text-neutral-500 flex items-start gap-1.5 bg-blue-50 border border-blue-200 rounded p-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-blue-600" />
            <span>
              PIC add member = auto-approve (bypass QR invitation). Jemaat akan menerima notif
              WhatsApp otomatis.
            </span>
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
            {addMut.isPending && <Loader2 className="w-4 h-4 animate-spin inline mr-1" />}
            Tambah
          </button>
        </div>
      </div>
    </div>
  );
}
