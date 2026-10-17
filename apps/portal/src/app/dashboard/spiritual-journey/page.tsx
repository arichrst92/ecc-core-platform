'use client';

/**
 * Spiritual Journey — tahap berurutan (global) dengan syarat Role / Sub role /
 * Status + cara mendapatkannya. Jemaat melihat progresnya di app mobile.
 * API: /admin/spiritual-journey
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Footprints,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { useDebounce } from '@/lib/use-debounce';

interface Ref {
  id: string;
  nama: string;
}
interface Step {
  id: string;
  judul: string;
  deskripsi: string | null;
  caraMendapatkan: string | null;
  ikon: string | null;
  urutan: number;
  roleId: string;
  subRoleId: string | null;
  subRoleStatusId: string | null;
  isActive: boolean;
  role: Ref;
  subRole: Ref | null;
  subRoleStatus: Ref | null;
  achievedCount: number;
  upcomingEventCount: number;
}
interface RoleOpt extends Ref {
  subRoles: (Ref & { statuses: Ref[] })[];
}

const KEY = ['spiritual-journey'];
const errMsg = (e: any, fb: string) => e?.response?.data?.error?.message ?? fb;

export default function SpiritualJourneyPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Step | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Step | null>(null);
  const [viewing, setViewing] = useState<Step | null>(null);

  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<{ data: Step[] }>('/admin/spiritual-journey')).data.data,
  });
  const steps = q.data ?? [];

  const reorder = useMutation({
    mutationFn: async (ids: string[]) => apiClient.post('/admin/spiritual-journey/reorder', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast.error(errMsg(e, 'Gagal mengubah urutan')),
  });
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/spiritual-journey/${id}`),
    onSuccess: () => {
      toast.success('Tahap dihapus');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menghapus')),
  });

  function move(i: number, dir: -1 | 1) {
    const ids = steps.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    qc.setQueryData<Step[]>(KEY, (old) => (old ? ids.map((id) => old.find((s) => s.id === id)!) : old));
    reorder.mutate(ids);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Footprints className="w-6 h-6 text-brand-500" /> Spiritual Journey
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5 max-w-2xl">
            Tahap pertumbuhan rohani berurutan. Tahap tercapai kalau jemaat punya Role / Sub role / Status yang
            disyaratkan. Jemaat melihat progres & cara mendapatkannya di aplikasi mobile.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg"
        >
          <Plus className="w-4 h-4" /> Tambah Tahap
        </button>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : steps.length === 0 ? (
        <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-12 text-center text-neutral-500 text-sm">
          Belum ada tahap. Klik <b>Tambah Tahap</b> untuk membuat tahap pertama, mis. <i>Expand Class</i>.
        </div>
      ) : (
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={`bg-white border rounded-xl p-4 flex gap-4 ${s.isActive ? 'border-neutral-200' : 'border-dashed border-neutral-300 opacity-60'}`}
            >
              <div className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center text-lg">
                  {s.ikon || i + 1}
                </div>
                <div className="text-[10px] text-neutral-400 mt-1">Tahap {i + 1}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-neutral-900">{s.judul}</h2>
                  {!s.isActive && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-600">Nonaktif</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 mt-1 text-xs">
                  <span className="text-neutral-500">Syarat:</span>
                  <Badge>{s.role.nama}</Badge>
                  {s.subRole && (
                    <>
                      <span className="text-neutral-300">›</span>
                      <Badge>{s.subRole.nama}</Badge>
                    </>
                  )}
                  {s.subRoleStatus && (
                    <>
                      <span className="text-neutral-300">›</span>
                      <Badge tone="brand">{s.subRoleStatus.nama}</Badge>
                    </>
                  )}
                </div>
                {s.deskripsi && <p className="text-sm text-neutral-700 mt-2">{s.deskripsi}</p>}
                {s.caraMendapatkan && (
                  <div className="mt-2 text-sm">
                    <div className="text-xs font-semibold text-neutral-500">Cara mendapatkan</div>
                    <p className="text-neutral-700 whitespace-pre-wrap">{s.caraMendapatkan}</p>
                  </div>
                )}
                <div className="flex flex-wrap gap-3 mt-3 text-xs">
                  <button onClick={() => setViewing(s)} className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                    <Users className="w-3.5 h-3.5" /> {s.achievedCount.toLocaleString('id-ID')} jemaat sudah mencapai
                  </button>
                  <Link href="/dashboard/event" className="inline-flex items-center gap-1 text-neutral-500 hover:text-brand-600">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {s.upcomingEventCount
                      ? `${s.upcomingEventCount} event mendatang memberi status ini`
                      : 'Belum ada event yang memberi status ini'}
                  </Link>
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <IconBtn title="Naikkan" disabled={i === 0 || reorder.isPending} onClick={() => move(i, -1)}>
                  <ArrowUp className="w-4 h-4" />
                </IconBtn>
                <IconBtn title="Turunkan" disabled={i === steps.length - 1 || reorder.isPending} onClick={() => move(i, 1)}>
                  <ArrowDown className="w-4 h-4" />
                </IconBtn>
                <IconBtn title="Ubah" onClick={() => setEditing(s)}>
                  <Pencil className="w-4 h-4" />
                </IconBtn>
                <IconBtn title="Hapus" danger onClick={() => setDeleting(s)}>
                  <Trash2 className="w-4 h-4" />
                </IconBtn>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="text-xs text-neutral-500">
        Tips: atur event/kelas (menu Event → “Syarat &amp; Role Peserta” → “Role yang diberikan ke peserta”) dengan role/status yang sama supaya jemaat otomatis
        naik tahap setelah hadir, dan event mendatangnya tampil sebagai “cara mendapatkan” di aplikasi.
      </p>

      {editing && <StepForm step={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {viewing && <AchieversModal step={viewing} onClose={() => setViewing(null)} />}
      <ConfirmDelete
        open={!!deleting}
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus tahap Spiritual Journey?"
        itemName={deleting?.judul}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'brand' }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full font-medium ${
        tone === 'brand' ? 'bg-brand-100 text-brand-700' : 'bg-neutral-100 text-neutral-700'
      }`}
    >
      {children}
    </span>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded text-neutral-400 disabled:opacity-30 ${
        danger ? 'hover:text-red-600 hover:bg-red-50' : 'hover:text-brand-600 hover:bg-neutral-100'
      }`}
    >
      {children}
    </button>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white disabled:bg-neutral-50';

function StepForm({ step, onClose }: { step: Step | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [judul, setJudul] = useState(step?.judul ?? '');
  const [ikon, setIkon] = useState(step?.ikon ?? '');
  const [deskripsi, setDeskripsi] = useState(step?.deskripsi ?? '');
  const [cara, setCara] = useState(step?.caraMendapatkan ?? '');
  const [roleId, setRoleId] = useState(step?.roleId ?? '');
  const [subRoleId, setSubRoleId] = useState(step?.subRoleId ?? '');
  const [statusId, setStatusId] = useState(step?.subRoleStatusId ?? '');
  const [isActive, setIsActive] = useState(step?.isActive ?? true);

  const rolesQ = useQuery({
    queryKey: ['role', 'options'],
    queryFn: async () => {
      const d = (await apiClient.get('/admin/role')).data as { data: RoleOpt[] };
      return d.data;
    },
    staleTime: 5 * 60_000,
  });
  const role = rolesQ.data?.find((r) => r.id === roleId);
  const sub = role?.subRoles.find((s) => s.id === subRoleId);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        judul,
        ikon: ikon || null,
        deskripsi: deskripsi || null,
        caraMendapatkan: cara || null,
        roleId,
        subRoleId: subRoleId || null,
        subRoleStatusId: statusId || null,
        isActive,
      };
      return step
        ? apiClient.patch(`/admin/spiritual-journey/${step.id}`, body)
        : apiClient.post('/admin/spiritual-journey', body);
    },
    onSuccess: () => {
      toast.success(step ? 'Tahap diperbarui' : 'Tahap ditambahkan');
      qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold">{step ? 'Ubah tahap' : 'Tambah tahap'}</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-6 space-y-4">
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Lbl label="Judul *">
                <input value={judul} onChange={(e) => setJudul(e.target.value)} className={inputCls} placeholder="Expand Class" />
              </Lbl>
              <Lbl label="Ikon">
                <input value={ikon} onChange={(e) => setIkon(e.target.value)} className={inputCls} placeholder="🌱" maxLength={16} />
              </Lbl>
            </div>
            <div className="rounded-xl border border-neutral-200 p-3 space-y-3">
              <div className="text-xs font-semibold text-neutral-500 uppercase">Syarat</div>
              <Lbl label="Role *">
                <select
                  value={roleId}
                  onChange={(e) => {
                    setRoleId(e.target.value);
                    setSubRoleId('');
                    setStatusId('');
                  }}
                  className={inputCls}
                >
                  <option value="">Pilih role</option>
                  {(rolesQ.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nama}
                    </option>
                  ))}
                </select>
              </Lbl>
              <div className="grid grid-cols-2 gap-3">
                <Lbl label="Sub role">
                  <select
                    value={subRoleId}
                    disabled={!role}
                    onChange={(e) => {
                      setSubRoleId(e.target.value);
                      setStatusId('');
                    }}
                    className={inputCls}
                  >
                    <option value="">Semua sub role</option>
                    {(role?.subRoles ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama}
                      </option>
                    ))}
                  </select>
                </Lbl>
                <Lbl label="Status">
                  <select value={statusId} disabled={!sub} onChange={(e) => setStatusId(e.target.value)} className={inputCls}>
                    <option value="">Semua status</option>
                    {(sub?.statuses ?? []).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama}
                      </option>
                    ))}
                  </select>
                </Lbl>
              </div>
            </div>
            <Lbl label="Deskripsi">
              <textarea
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                rows={2}
                className={inputCls}
                placeholder="Kelas lanjutan untuk jemaat tetap…"
              />
            </Lbl>
            <Lbl label="Cara mendapatkan">
              <textarea
                value={cara}
                onChange={(e) => setCara(e.target.value)}
                rows={4}
                className={inputCls}
                placeholder={'1. Daftar kelas Expand di app (menu Event)\n2. Hadiri 4 sesi\n3. Status otomatis diperbarui'}
              />
            </Lbl>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Tampilkan di aplikasi
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-neutral-300 text-neutral-700 hover:bg-white">
              Batal
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || judul.trim().length < 2 || !roleId}
              className="px-4 py-2 text-sm rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Lbl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-neutral-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function AchieversModal({ step, onClose }: { step: Step; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const s = useDebounce(search, 300);
  const q = useQuery({
    queryKey: ['spiritual-journey', step.id, 'jemaat', s, page],
    queryFn: async () =>
      (
        await apiClient.get<{
          data: { id: string; namaLengkap: string; kode: string | null; cabang: Ref }[];
          meta: { total: number; totalPages: number };
        }>(`/admin/spiritual-journey/${step.id}/jemaat`, { params: { search: s || undefined, page } })
      ).data,
    placeholderData: (p) => p,
  });
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
            <div>
              <h2 className="font-semibold">{step.judul}</h2>
              <p className="text-xs text-neutral-500">{q.data?.meta.total ?? step.achievedCount} jemaat sudah mencapai</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-3 border-b border-neutral-100">
            <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3">
              <Search className="w-3.5 h-3.5 text-neutral-400" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Cari nama"
                className="flex-1 py-1.5 outline-none text-sm"
              />
            </div>
          </div>
          <div className="overflow-y-auto divide-y divide-neutral-100">
            {q.isLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : (q.data?.data ?? []).length === 0 ? (
              <div className="p-8 text-center text-sm text-neutral-400">Belum ada jemaat.</div>
            ) : (
              q.data!.data.map((j) => (
                <Link key={j.id} href={`/dashboard/jemaat/${j.id}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-neutral-50">
                  <span className="text-sm font-medium text-neutral-900">{j.namaLengkap}</span>
                  <span className="text-xs text-neutral-500">
                    {j.kode ? `${j.kode} · ` : ''}
                    {j.cabang.nama}
                  </span>
                </Link>
              ))
            )}
          </div>
          {q.data && q.data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-100 text-xs text-neutral-500">
              <span>
                Halaman {page} / {q.data.meta.totalPages}
              </span>
              <div className="flex gap-1">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">
                  ←
                </button>
                <button
                  disabled={page >= q.data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1 border rounded disabled:opacity-40"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
