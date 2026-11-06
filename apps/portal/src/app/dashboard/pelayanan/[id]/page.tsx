'use client';

/**
 * Detail Pelayanan — anggota aktif dikelompokkan per cabang gereja, cari &
 * saring, ubah role, keluarkan, dan tambah anggota (cari nama / kode / no HP).
 * API: /admin/pelayanan/:id/members, /:id/candidates, /assign
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, ChevronDown, ChevronUp, Loader2, Search, ShieldCheck, UserMinus, UserPlus, X } from 'lucide-react';
import { useCabangOptions } from '@/components/report/report-ui';
import { PelayananIcon } from '@/components/pelayanan/pelayanan-icon';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { resolveMediaUrl } from '@/lib/media-url';
import { useDebounce } from '@/lib/use-debounce';
import { usePersistentState } from '@/lib/use-persistent-state';

interface Role {
  id: string;
  nama: string;
  level: number;
}
interface Member {
  id: string;
  tanggalMulai: string;
  catatan: string | null;
  pelayananRole: Role;
  /** Cabang tempat anggota ini punya otoritas approval request bergabung. */
  approvalCabang?: { id: string; nama: string }[];
  jemaat: {
    id: string;
    namaLengkap: string;
    kode: string | null;
    fotoUrl: string | null;
    noHp: string | null;
    jenisKelamin: 'L' | 'P' | null;
    cabang: { id: string; nama: string };
  };
}
interface MembersResp {
  pelayanan: { id: string; nama: string; deskripsi: string | null; ikon?: string | null; warna?: string | null; isActive: boolean; roles: Role[] };
  members: Member[];
}
interface Candidate {
  id: string;
  namaLengkap: string;
  kode: string | null;
  noHp: string | null;
  fotoUrl: string | null;
  cabang: { id: string; nama: string };
  memberRole: string | null;
}

const errMsg = (e: any, fb: string) => e?.response?.data?.error?.message ?? fb;

function Avatar({ nama, foto }: { nama: string; foto: string | null }) {
  const src = foto ? resolveMediaUrl(foto) : null;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
  ) : (
    <div className="w-8 h-8 rounded-full bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0">
      {nama.trim().charAt(0).toUpperCase()}
    </div>
  );
}

export default function PelayananDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = usePersistentState(`pelayanan:${id}:search`, '');
  const [cabangId, setCabangId] = usePersistentState(`pelayanan:${id}:cabang`, '');
  const [roleId, setRoleId] = usePersistentState(`pelayanan:${id}:role`, '');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [authFor, setAuthFor] = useState<Member | null>(null);
  const dq = useDebounce(search, 300);
  const KEY = ['pelayanan', id, 'members'];

  const q = useQuery({
    queryKey: [...KEY, dq],
    queryFn: async () =>
      (await apiClient.get<{ data: MembersResp }>(`/admin/pelayanan/${id}/members`, { params: { search: dq || undefined } })).data.data,
    placeholderData: (p) => p,
  });
  const pel = q.data?.pelayanan;
  const all = q.data?.members ?? [];

  // Opsi cabang dari anggota yang ada.
  const cabangOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of all) m.set(x.jemaat.cabang.id, x.jemaat.cabang.nama);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id'));
  }, [all]);

  const filtered = all.filter((m) => (!cabangId || m.jemaat.cabang.id === cabangId) && (!roleId || m.pelayananRole.id === roleId));
  // Kelompok per cabang; di dalamnya urut level role (tinggi dulu) lalu nama.
  const groups = useMemo(() => {
    const g = new Map<string, { cabang: { id: string; nama: string }; list: Member[] }>();
    for (const m of filtered) {
      const e = g.get(m.jemaat.cabang.id) ?? { cabang: m.jemaat.cabang, list: [] };
      e.list.push(m);
      g.set(m.jemaat.cabang.id, e);
    }
    for (const e of g.values())
      e.list.sort(
        (a, b) => b.pelayananRole.level - a.pelayananRole.level || a.jemaat.namaLengkap.localeCompare(b.jemaat.namaLengkap, 'id'),
      );
    return [...g.values()].sort((a, b) => a.cabang.nama.localeCompare(b.cabang.nama, 'id'));
  }, [filtered]);

  const changeRole = useMutation({
    mutationFn: async ({ assignId, pelayananRoleId }: { assignId: string; pelayananRoleId: string }) =>
      apiClient.patch(`/admin/pelayanan/assign/${assignId}`, { pelayananRoleId }),
    onSuccess: () => {
      toast.success('Role diperbarui');
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal mengubah role')),
  });
  const remove = useMutation({
    mutationFn: async (m: Member) =>
      apiClient.patch(`/admin/pelayanan/assign/${m.id}`, { isActive: false, tanggalSelesai: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => {
      toast.success(`${removing?.jemaat.namaLengkap ?? 'Anggota'} dikeluarkan dari pelayanan`);
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['pelayanan', 'tree'] });
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal mengeluarkan')),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => router.push('/dashboard/pelayanan')} className="p-2 rounded-lg hover:bg-neutral-100" aria-label="Kembali">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <PelayananIcon ikon={pel?.ikon} warna={pel?.warna} size={32} /> {pel?.nama ?? '…'}
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {pel?.deskripsi ? `${pel.deskripsi} · ` : ''}
            {all.length.toLocaleString('id-ID')} anggota aktif{dq ? ' (sesuai pencarian)' : ''} · {cabangOpts.length} cabang
          </p>
        </div>
        <button
          onClick={() => setAdding(true)}
          disabled={!pel?.roles.length}
          title={pel && !pel.roles.length ? 'Tambahkan role pelayanan dulu di halaman Pelayanan' : undefined}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg"
        >
          <UserPlus className="w-4 h-4" /> Tambah Anggota
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, kode, atau no HP anggota…"
            className="w-full pl-9 pr-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white">
          <option value="">Semua cabang</option>
          {cabangOpts.map(([cid, nama]) => (
            <option key={cid} value={cid}>
              {nama}
            </option>
          ))}
        </select>
        <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white">
          <option value="">Semua role</option>
          {(pel?.roles ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.nama}
            </option>
          ))}
        </select>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : q.isError ? (
        <div className="py-12 text-center text-sm text-red-600">Gagal memuat anggota pelayanan.</div>
      ) : groups.length === 0 ? (
        <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-12 text-center text-sm text-neutral-500">
          {all.length ? 'Tidak ada anggota yang cocok dengan saringan.' : 'Belum ada anggota. Klik Tambah Anggota.'}
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isClosed = closed[g.cabang.id];
            return (
              <div key={g.cabang.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setClosed((c) => ({ ...c, [g.cabang.id]: !c[g.cabang.id] }))}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-neutral-50 border-b border-neutral-100"
                >
                  <span className="font-semibold text-neutral-900 inline-flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-brand-500" /> {g.cabang.nama}
                    <span className="text-xs font-medium text-neutral-500">({g.list.length})</span>
                  </span>
                  {isClosed ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronUp className="w-4 h-4 text-neutral-400" />}
                </button>
                {isClosed ? null : (
                  <div className="divide-y divide-neutral-100">
                    {g.list.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50">
                        <Avatar nama={m.jemaat.namaLengkap} foto={m.jemaat.fotoUrl} />
                        <div className="flex-1 min-w-0">
                          <Link href={`/dashboard/jemaat/${m.jemaat.id}`} className="font-medium text-brand-600 hover:underline truncate block">
                            {m.jemaat.namaLengkap}
                          </Link>
                          {m.approvalCabang?.length ? (
                            <div className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> Approval: {m.approvalCabang.map((c) => c.nama).join(', ')}
                            </div>
                          ) : null}
                          <div className="text-xs text-neutral-500 truncate">
                            {[m.jemaat.kode, m.jemaat.noHp, `sejak ${new Date(m.tanggalMulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </div>
                        <select
                          value={m.pelayananRole.id}
                          onChange={(e) => changeRole.mutate({ assignId: m.id, pelayananRoleId: e.target.value })}
                          disabled={changeRole.isPending}
                          className="px-2 py-1 border border-neutral-300 rounded-lg text-xs bg-white max-w-[150px]"
                          title="Ubah role"
                        >
                          {(pel?.roles ?? []).some((r) => r.id === m.pelayananRole.id) ? null : (
                            <option value={m.pelayananRole.id}>{m.pelayananRole.nama}</option>
                          )}
                          {(pel?.roles ?? []).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nama}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setAuthFor(m)}
                          className={`p-1.5 rounded hover:bg-emerald-50 ${m.approvalCabang?.length ? 'text-emerald-600' : 'text-neutral-400'} hover:text-emerald-700`}
                          title="Otoritas approval request bergabung"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setRemoving(m)}
                          className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600"
                          title="Keluarkan dari pelayanan"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {authFor && pel ? (
        <ApprovalModal pelayananId={pel.id} pelayananNama={pel.nama} member={authFor} onClose={() => setAuthFor(null)} />
      ) : null}

      {adding && pel ? (
        <AddMemberModal pelayananId={pel.id} pelayananNama={pel.nama} roles={pel.roles} onClose={() => setAdding(false)} />
      ) : null}

      {removing ? (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={remove.isPending ? undefined : () => setRemoving(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 pointer-events-auto">
              <h3 className="font-semibold text-neutral-900">Keluarkan dari pelayanan?</h3>
              <p className="text-sm text-neutral-600 mt-1">
                <b>{removing.jemaat.namaLengkap}</b> dikeluarkan dari <b>{pel?.nama}</b>. Riwayat keanggotaan tetap tersimpan
                (tanggal selesai hari ini).
              </p>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setRemoving(null)} disabled={remove.isPending} className="px-3 py-1.5 rounded-lg text-sm hover:bg-neutral-100">
                  Batal
                </button>
                <button
                  onClick={() => remove.mutate(removing)}
                  disabled={remove.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
                  Keluarkan
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function AddMemberModal({
  pelayananId,
  pelayananNama,
  roles,
  onClose,
}: {
  pelayananId: string;
  pelayananNama: string;
  roles: Role[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  // Default: role dengan level terendah (mis. Member).
  const [roleId, setRoleId] = useState(() => [...roles].sort((a, b) => a.level - b.level)[0]?.id ?? '');
  const dq = useDebounce(search, 300);
  const q = useQuery({
    queryKey: ['pelayanan', pelayananId, 'candidates', dq],
    enabled: dq.trim().length >= 2,
    queryFn: async () =>
      (await apiClient.get<{ data: Candidate[] }>(`/admin/pelayanan/${pelayananId}/candidates`, { params: { search: dq } })).data.data,
  });
  const add = useMutation({
    mutationFn: async (c: Candidate) => apiClient.post('/admin/pelayanan/assign', { jemaatId: c.id, pelayananId, pelayananRoleId: roleId }),
    onSuccess: (_d, c) => {
      toast.success(`${c.namaLengkap} ditambahkan ke ${pelayananNama}`);
      void qc.invalidateQueries({ queryKey: ['pelayanan', pelayananId] });
      void qc.invalidateQueries({ queryKey: ['pelayanan', 'tree'] });
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menambahkan')),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Tambah anggota · {pelayananNama}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-3 space-y-2 border-b border-neutral-100">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, kode jemaat, atau no HP…"
                className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-neutral-600">Sebagai role</span>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="px-2 py-1 border border-neutral-300 rounded-lg text-sm bg-white">
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nama}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="overflow-y-auto divide-y divide-neutral-100">
            {dq.trim().length < 2 ? (
              <div className="p-6 text-center text-sm text-neutral-400">Ketik minimal 2 karakter.</div>
            ) : q.isLoading ? (
              <div className="p-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : (q.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-neutral-400">Tidak ada jemaat yang cocok.</div>
            ) : (
              q.data!.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Avatar nama={c.namaLengkap} foto={c.fotoUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-900 truncate">{c.namaLengkap}</div>
                    <div className="text-xs text-neutral-500 truncate">{[c.kode, c.noHp, c.cabang.nama].filter(Boolean).join(' · ')}</div>
                  </div>
                  {c.memberRole ? (
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Sudah · {c.memberRole}</span>
                  ) : (
                    <button
                      onClick={() => add.mutate(c)}
                      disabled={add.isPending || !roleId}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Otoritas approval: anggota boleh menyetujui request bergabung dari jemaat di cabang terpilih. */
function ApprovalModal({
  pelayananId,
  pelayananNama,
  member,
  onClose,
}: {
  pelayananId: string;
  pelayananNama: string;
  member: Member;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const cabangQ = useCabangOptions();
  const [picked, setPicked] = useState<Set<string>>(() => new Set((member.approvalCabang ?? []).map((c) => c.id)));
  const save = useMutation({
    mutationFn: async () => apiClient.put(`/admin/pelayanan/${pelayananId}/approver/${member.jemaat.id}`, { cabangIds: [...picked] }),
    onSuccess: () => {
      toast.success(picked.size ? 'Otoritas approval disimpan' : 'Otoritas approval dicabut');
      void qc.invalidateQueries({ queryKey: ['pelayanan', pelayananId] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={save.isPending ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Otoritas approval
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 py-3 text-sm text-neutral-600 border-b border-neutral-100">
            <b>{member.jemaat.namaLengkap}</b> boleh menyetujui / menolak request bergabung <b>{pelayananNama}</b> dari jemaat
            di cabang yang dicentang, termasuk mengatur jadwal pelayanan di app. Di app, Fulltimer pun hanya bisa sesuai otoritasnya.
          </div>
          <div className="overflow-y-auto px-5 py-2">
            {cabangQ.isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : (
              (cabangQ.data ?? []).map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4 accent-emerald-600" />
                  {c.nama}
                  {c.id === member.jemaat.cabang.id ? <span className="text-xs text-neutral-400">(cabang anggota)</span> : null}
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-neutral-100">
            <button
              onClick={() => setPicked(new Set())}
              disabled={!picked.size || save.isPending}
              className="text-xs text-red-600 hover:underline disabled:opacity-40"
            >
              Cabut semua
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={save.isPending} className="px-3 py-1.5 rounded-lg text-sm hover:bg-neutral-100">
                Batal
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
