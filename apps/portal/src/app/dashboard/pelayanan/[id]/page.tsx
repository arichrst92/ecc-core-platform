'use client';

/**
 * Detail Pelayanan — header ringkas (statistik, permintaan menunggu) + tab:
 *   Anggota · Peran · Tugas petugas · Pendaftaran & koordinator · Penugasan.
 * Tab tersimpan di URL (?tab=) supaya bisa dibuka langsung lewat link.
 * API: /admin/pelayanan/:id/members, /:id/candidates, /assign
 */
import { useTugasKategori } from '@/components/pelayanan/tugas-kategori-panel';
import { TugasKosongPanel, useTugasKosong } from '@/components/pelayanan/tugas-kosong';
import { NeedsFillBadge } from '@/components/ui/needs-fill-badge';
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarCheck, ChevronDown, ChevronRight, ChevronUp, ClipboardList, Crown, Loader2, Pencil, Search, ShieldCheck, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { PersonaTabs } from '@/components/ui/persona-tabs';
import { useCabangOptions } from '@/components/report/report-ui';
import { PelayananIcon } from '@/components/pelayanan/pelayanan-icon';
import { TugasKategoriPanel } from '@/components/pelayanan/tugas-kategori-panel';
import { PenugasanModal } from '@/components/pelayanan/penugasan-modal';
import { EditPelayananModal, RoleManager, usePendingJoinCounts } from '@/components/pelayanan/pelayanan-manage';
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
  memberRoleIds?: string[];
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

type TabKey = 'anggota' | 'peran' | 'tugas' | 'pendaftaran' | 'penugasan';
const TABS: { key: TabKey; label: string; icon: typeof Users; hint: string }[] = [
  { key: 'anggota', label: 'Anggota', icon: Users, hint: 'Daftar anggota per cabang, ubah peran, koordinator, keluarkan' },
  { key: 'peran', label: 'Peran', icon: Crown, hint: 'Peran & level dalam pelayanan' },
  { key: 'tugas', label: 'Tugas petugas', icon: ClipboardList, hint: 'Kategori → Tugas yang dipilih saat menyusun jadwal' },
  { key: 'pendaftaran', label: 'Pendaftaran & koordinator', icon: ShieldCheck, hint: 'Buka/tutup pendaftaran per cabang & siapa koordinatornya' },
  { key: 'penugasan', label: 'Penugasan', icon: CalendarCheck, hint: 'Ibadah & event tempat pelayanan ini bertugas' },
];

export default function PelayananDetailPage() {
  return (
    <Suspense fallback={null}>
      <PelayananDetail />
    </Suspense>
  );
}

function PelayananDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const tabParam = sp.get('tab') as TabKey | null;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : 'anggota';
  const setTab = (t: TabKey) => router.replace(`/dashboard/pelayanan/${id}?tab=${t}`, { scroll: false });

  const [search, setSearch] = usePersistentState(`pelayanan:${id}:search`, '');
  const [cabangId, setCabangId] = usePersistentState(`pelayanan:${id}:cabang`, '');
  const [roleId, setRoleId] = usePersistentState(`pelayanan:${id}:role`, '');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [authFor, setAuthFor] = useState<Member | null>(null);
  const dq = useDebounce(search, 300);
  const KEY = ['pelayanan', id, 'members'];
  const fetchMembers = async (s: string) =>
    (await apiClient.get<{ data: MembersResp }>(`/admin/pelayanan/${id}/members`, { params: { search: s || undefined } })).data.data;

  // Semua anggota (untuk statistik, peran, koordinator) + hasil pencarian (tab Anggota).
  const allQ = useQuery({ queryKey: [...KEY, ''], queryFn: () => fetchMembers('') });
  const q = useQuery({ queryKey: [...KEY, dq], queryFn: () => fetchMembers(dq), placeholderData: (p) => p, enabled: !!dq });
  const pending = usePendingJoinCounts().byId.get(id) ?? 0;
  const pel = allQ.data?.pelayanan;
  const everyone = allQ.data?.members ?? [];
  const all = (dq ? q.data?.members : everyone) ?? [];

  const stats = useMemo(() => {
    const cabang = new Set(everyone.map((m) => m.jemaat.cabang.id));
    const byRole = new Map<string, number>();
    for (const m of everyone) byRole.set(m.pelayananRole.id, (byRole.get(m.pelayananRole.id) ?? 0) + 1);
    const koordinator = everyone.filter((m) => m.approvalCabang?.length);
    return { cabang: cabang.size, byRole, koordinator };
  }, [everyone]);

  // Opsi cabang dari anggota yang ada.
  const cabangOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of everyone) m.set(x.jemaat.cabang.id, x.jemaat.cabang.nama);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'id'));
  }, [everyone]);

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

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['pelayanan', 'tree'] });
  };

  const changeRole = useMutation({
    mutationFn: async ({ assignId, pelayananRoleId }: { assignId: string; pelayananRoleId: string }) =>
      apiClient.patch(`/admin/pelayanan/assign/${assignId}`, { pelayananRoleId }),
    onSuccess: () => {
      toast.success('Peran diperbarui');
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal mengubah peran')),
  });
  const remove = useMutation({
    mutationFn: async (m: Member) =>
      apiClient.patch(`/admin/pelayanan/assign/${m.id}`, { isActive: false, tanggalSelesai: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => {
      toast.success(`${removing?.jemaat.namaLengkap ?? 'Anggota'} dikeluarkan dari pelayanan`);
      setRemoving(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal mengeluarkan')),
  });

  const tagline = pel?.deskripsi?.split('\n')[0]?.trim();
  const tugasKosong = useTugasKosong(id).data?.total ?? 0;
  // Kategori tugas belum dibuat sama sekali → tab "Tugas petugas" diberi badge biru.
  const kategoriQ = useTugasKategori(id);
  const kategoriKosong = kategoriQ.isSuccess && (kategoriQ.data?.length ?? 0) === 0;
  const koordinatorKosong = everyone.length > 0 && stats.koordinator.length === 0;
  const tabCount: Partial<Record<TabKey, number>> = {
    anggota: everyone.length,
    peran: pel?.roles.length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <Link href="/dashboard/pelayanan" className="p-2 -ml-1 rounded-lg hover:bg-neutral-100" aria-label="Kembali ke daftar pelayanan">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <PelayananIcon ikon={pel?.ikon} warna={pel?.warna} size={48} />
          <div className="flex-1 min-w-0 basis-40">
            <div className="text-xs text-neutral-500">
              <Link href="/dashboard/pelayanan" className="hover:underline">
                Pelayanan
              </Link>{' '}
              / {pel?.nama ?? '…'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 flex flex-wrap items-center gap-2 break-words">
              {pel?.nama ?? '…'}
              {pel && !pel.isActive ? (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-neutral-200 text-neutral-600">Nonaktif</span>
              ) : null}
            </h1>
            {tagline ? <p className="text-sm text-neutral-500 mt-0.5">{tagline}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              disabled={!pel}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              title="Ubah nama, deskripsi, ikon, warna & status aktif"
            >
              <Pencil className="w-4 h-4" /> Ubah
            </button>
            <button
              onClick={() => setAdding(true)}
              disabled={!pel?.roles.length}
              title={pel && !pel.roles.length ? 'Tambahkan peran dulu di tab Peran' : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white text-sm font-semibold rounded-lg"
            >
              <UserPlus className="w-4 h-4" /> Tambah Anggota
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Stat label="Anggota aktif" value={everyone.length} onClick={() => setTab('anggota')} />
          <Stat label="Cabang" value={stats.cabang} onClick={() => setTab('anggota')} />
          <Stat label="Peran" value={pel?.roles.length ?? 0} onClick={() => setTab('peran')} />
          <Stat
            label="Koordinator"
            value={stats.koordinator.length}
            warn={everyone.length > 0 && stats.koordinator.length === 0 ? 'Belum ada' : undefined}
            onClick={() => setTab('pendaftaran')}
          />
        </div>
        {pending > 0 ? (
          <Link
            href={`/dashboard/pelayanan/join-requests?pelayananId=${id}`}
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 hover:bg-amber-100"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            <span className="min-w-0"><b>{pending}</b> permintaan bergabung menunggu persetujuan</span>
            <span className="ml-auto inline-flex items-center gap-0.5 font-semibold">
              Tinjau <ChevronRight className="w-4 h-4" />
            </span>
          </Link>
        ) : null}
      </div>

      {/* Tab */}
      <PersonaTabs
        value={tab}
        onChange={setTab}
        items={TABS.map((t) => ({
          key: t.key,
          label: t.label,
          Icon: t.icon,
          title: t.hint,
          badge: tabCount[t.key] ?? null,
          extra: (
            <>
              {t.key === 'tugas' && kategoriKosong ? (
                <NeedsFillBadge hint="Belum ada kategori & tugas petugas — buat di tab ini supaya koordinator bisa menetapkan tugas tiap petugas" />
              ) : null}
              {t.key === 'tugas' && tugasKosong > 0 ? (
                <NeedsFillBadge label={`${tugasKosong} perlu diisi`} hint="Petugas yang belum diberi tugas — lihat daftarnya di tab ini" />
              ) : null}
              {t.key === 'pendaftaran' && koordinatorKosong ? (
                <NeedsFillBadge hint="Belum ada koordinator — permintaan bergabung & jadwal di app tidak ada yang mengurus" />
              ) : null}
            </>
          ),
        }))}
      />
      <p className="text-xs text-neutral-500 -mt-2">{TABS.find((t) => t.key === tab)?.hint}</p>

      {allQ.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : allQ.isError || !pel ? (
        <div className="py-12 text-center text-sm text-red-600">Gagal memuat pelayanan.</div>
      ) : tab === 'peran' ? (
        <RoleManager pelayananId={pel.id} roles={pel.roles} memberCountByRole={stats.byRole} onChanged={refresh} />
      ) : tab === 'tugas' ? (
        <div className="space-y-4">
          <TugasKosongPanel pelayananId={pel.id} />
          <TugasKategoriPanel pelayananId={pel.id} warna={pel.warna} embedded />
        </div>
      ) : tab === 'pendaftaran' ? (
        <div className="space-y-4">
          <PendaftaranPanel pelayananId={pel.id} embedded />
          <KoordinatorPanel members={everyone} onAtur={setAuthFor} onGoAnggota={() => setTab('anggota')} />
        </div>
      ) : tab === 'penugasan' ? (
        <PenugasanModal pelayananId={pel.id} embedded />
      ) : (
        <>
          <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-0 basis-56">
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
              <option value="">Semua peran</option>
              {pel.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nama}
                </option>
              ))}
            </select>
            {search || cabangId || roleId ? (
              <button
                onClick={() => {
                  setSearch('');
                  setCabangId('');
                  setRoleId('');
                }}
                className="text-xs text-neutral-500 hover:text-neutral-800 px-2"
              >
                Reset
              </button>
            ) : null}
            <span className="w-full text-[11px] text-neutral-500 inline-flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> = atur koordinator (otoritas approval per cabang)
              </span>
              <span className="inline-flex items-center gap-1">
                <UserMinus className="w-3.5 h-3.5" /> = keluarkan (riwayat tetap tersimpan)
              </span>
            </span>
          </div>

          {dq && q.isFetching && !q.data ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
          ) : groups.length === 0 ? (
            <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-12 text-center text-sm text-neutral-500">
              {everyone.length ? 'Tidak ada anggota yang cocok dengan saringan.' : 'Belum ada anggota. Klik Tambah Anggota.'}
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((g) => {
                const isClosed = closed[g.cabang.id];
                return (
                  <div key={g.cabang.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setClosed((c) => ({ ...c, [g.cabang.id]: !c[g.cabang.id] }))}
                      className="w-full flex flex-wrap items-center justify-between px-4 py-2.5 bg-neutral-50 border-b border-neutral-100 gap-2"
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
                          <div key={m.id} className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1.5 px-3 sm:px-4 py-2.5 hover:bg-neutral-50">
                            <Avatar nama={m.jemaat.namaLengkap} foto={m.jemaat.fotoUrl} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Link href={`/dashboard/jemaat/${m.jemaat.id}`} className="font-medium text-brand-600 hover:underline truncate">
                                  {m.jemaat.namaLengkap}
                                </Link>
                                {m.approvalCabang?.length ? (
                                  <span
                                    className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 break-words"
                                    title={`Koordinator untuk: ${m.approvalCabang.map((c) => c.nama).join(', ')}`}
                                  >
                                    Koordinator · {m.approvalCabang.map((c) => c.nama).join(', ')}
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-xs text-neutral-500 truncate">
                                {[m.jemaat.kode, m.jemaat.noHp, `sejak ${new Date(m.tanggalMulai).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 ml-auto shrink-0">
                            <select
                              value={m.pelayananRole.id}
                              onChange={(e) => changeRole.mutate({ assignId: m.id, pelayananRoleId: e.target.value })}
                              disabled={changeRole.isPending}
                              className="px-2 py-1 border border-neutral-300 rounded-lg text-xs bg-white max-w-[150px]"
                              title="Ubah peran"
                            >
                              {pel.roles.some((r) => r.id === m.pelayananRole.id) ? null : (
                                <option value={m.pelayananRole.id}>{m.pelayananRole.nama}</option>
                              )}
                              {pel.roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.nama}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => setAuthFor(m)}
                              className={`p-1.5 rounded hover:bg-emerald-50 ${m.approvalCabang?.length ? 'text-emerald-600' : 'text-neutral-400'} hover:text-emerald-700`}
                              title="Atur koordinator (otoritas approval per cabang)"
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
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {editing && pel ? (
        <EditPelayananModal
          pelayanan={pel}
          onClose={() => setEditing(false)}
          onSuccess={() => {
            setEditing(false);
            refresh();
          }}
        />
      ) : null}

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
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 pointer-events-auto max-h-[90vh] overflow-y-auto">
              <h3 className="font-semibold text-neutral-900">Keluarkan dari pelayanan?</h3>
              <p className="text-sm text-neutral-600 mt-1">
                <b>{removing.jemaat.namaLengkap}</b> dikeluarkan dari <b>{pel?.nama}</b>. Riwayat keanggotaan tetap tersimpan
                (tanggal selesai hari ini). Bila ia koordinator, otoritasnya ikut dicabut.
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

function Stat({ label, value, warn, onClick }: { label: string; value: number; warn?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="text-left rounded-lg border border-neutral-200 px-3 py-2 hover:bg-neutral-50">
      <div className="text-xl font-bold text-neutral-900">{value.toLocaleString('id-ID')}</div>
      <div className="text-xs text-neutral-500">
        {label}
        {warn ? <span className="ml-1 font-semibold text-amber-700">· {warn}</span> : null}
      </div>
    </button>
  );
}

/** Ringkasan koordinator per cabang (cabang anggota tanpa koordinator ditandai). */
function KoordinatorPanel({
  members,
  onAtur,
  onGoAnggota,
}: {
  members: Member[];
  onAtur: (m: Member) => void;
  onGoAnggota: () => void;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, { nama: string; koordinator: Member[]; anggota: number }>();
    for (const m of members) {
      const c = m.jemaat.cabang;
      const e = map.get(c.id) ?? { nama: c.nama, koordinator: [], anggota: 0 };
      e.anggota++;
      map.set(c.id, e);
    }
    for (const m of members)
      for (const c of m.approvalCabang ?? []) {
        const e = map.get(c.id) ?? { nama: c.nama, koordinator: [], anggota: 0 };
        e.koordinator.push(m);
        map.set(c.id, e);
      }
    return [...map.entries()].sort((a, b) => a[1].nama.localeCompare(b[1].nama, 'id'));
  }, [members]);
  return (
    <div className="bg-white border border-neutral-200 rounded-xl">
      <div className="px-4 py-3 border-b border-neutral-100">
        <div className="font-semibold text-neutral-900">Koordinator per cabang</div>
        <p className="text-xs text-neutral-500 mt-0.5">
          Koordinator menyetujui permintaan bergabung dari jemaat cabangnya, membuka/menutup pendaftaran, dan mengatur jadwal petugas dari app.
          Tambah koordinator: tab <button onClick={onGoAnggota} className="text-brand-600 hover:underline">Anggota</button> → ikon perisai.
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-500">Belum ada anggota.</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {rows.map(([cid, r]) => (
            <div key={cid} className="px-4 py-2.5 flex flex-wrap items-center gap-2">
              <span className="font-medium text-neutral-900 w-full sm:w-40 min-w-0 break-words">{r.nama}</span>
              <span className="text-xs text-neutral-500 w-24">{r.anggota} anggota</span>
              {r.koordinator.length ? (
                r.koordinator.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => onAtur(k)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    title="Ubah cabang otoritas"
                  >
                    <ShieldCheck className="w-3 h-3" /> {k.jemaat.namaLengkap}
                  </button>
                ))
              ) : (
                <span className="text-xs font-semibold text-amber-700">Belum ada koordinator — permintaan bergabung dari cabang ini hanya bisa diproses admin di Portal</span>
              )}
            </div>
          ))}
        </div>
      )}
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
          <div className="flex flex-wrap items-center justify-between px-3 sm:px-5 py-3 border-b border-neutral-100 gap-2">
            <h2 className="font-semibold text-neutral-900">Tambah anggota · {pelayananNama}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3 sm:px-5 py-3 space-y-2 border-b border-neutral-100">
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
              <div className="p-4 sm:p-6 text-center text-sm text-neutral-400">Ketik minimal 2 karakter.</div>
            ) : q.isLoading ? (
              <div className="p-4 sm:p-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : (q.data ?? []).length === 0 ? (
              <div className="p-4 sm:p-6 text-center text-sm text-neutral-400">Tidak ada jemaat yang cocok.</div>
            ) : (
              q.data!.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 sm:px-5 py-2.5">
                  <Avatar nama={c.namaLengkap} foto={c.fotoUrl} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-neutral-900 truncate">{c.namaLengkap}</div>
                    <div className="text-xs text-neutral-500 truncate">{[c.kode, c.noHp, c.cabang.nama].filter(Boolean).join(' · ')}</div>
                  </div>
                  {c.memberRole ? (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full max-w-[140px] truncate" title={c.memberRole}>
                      Sudah · {c.memberRole}
                    </span>
                  ) : null}
                  {c.memberRoleIds?.includes(roleId) ? null : (
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
          <div className="flex flex-wrap items-center justify-between px-3 sm:px-5 py-3 border-b border-neutral-100 gap-2">
            <h2 className="font-semibold text-neutral-900 inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Otoritas approval
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3 sm:px-5 py-3 text-sm text-neutral-600 border-b border-neutral-100">
            <b>{member.jemaat.namaLengkap}</b> boleh menyetujui / menolak request bergabung <b>{pelayananNama}</b> dari jemaat
            di cabang yang dicentang, termasuk mengatur jadwal pelayanan di app. Di app, Fulltimer pun hanya bisa sesuai otoritasnya.
          </div>
          <div className="overflow-y-auto px-3 sm:px-5 py-2">
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
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-5 py-3 border-t border-neutral-100">
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

interface PendaftaranRow {
  cabangId: string;
  cabangNama: string;
  status: 'MENERIMA' | 'BUKA' | 'TUTUP';
  catatan: string | null;
  tutupOtomatis: string | null;
}

const STATUS_PEND: Record<PendaftaranRow['status'], { label: string; cls: string }> = {
  BUKA: { label: 'Buka pendaftaran', cls: 'bg-emerald-100 text-emerald-800' },
  MENERIMA: { label: 'Belum dibuka', cls: 'bg-neutral-100 text-neutral-600' },
  TUTUP: { label: 'Tutup', cls: 'bg-red-100 text-red-700' },
};

/**
 * Buka / tutup pendaftaran per cabang (badge "Buka pendaftaran" di app; ditutup
 * → tombol Gabung hilang & request baru ditolak untuk jemaat cabang tsb).
 */
function PendaftaranPanel({ pelayananId, embedded = false }: { pelayananId: string; embedded?: boolean }) {
  const qc = useQueryClient();
  const [openState, setOpen] = useState(false);
  const open = embedded || openState;
  const [edit, setEdit] = useState<PendaftaranRow | null>(null);
  const [catatan, setCatatan] = useState('');
  const [tutup, setTutup] = useState('');
  const q = useQuery({
    queryKey: ['pelayanan', pelayananId, 'pendaftaran'],
    queryFn: async () => (await apiClient.get<{ data: PendaftaranRow[] }>(`/admin/ministry/${pelayananId}/pendaftaran`)).data.data,
    retry: false,
  });
  const save = useMutation({
    mutationFn: async (v: { cabangId: string; isOpen: boolean; catatan?: string | null; tutupOtomatis?: string | null }) =>
      apiClient.put(`/admin/ministry/${pelayananId}/pendaftaran/${v.cabangId}`, v),
    onSuccess: (_d, v) => {
      toast.success(v.isOpen ? 'Pendaftaran dibuka' : 'Pendaftaran ditutup');
      setEdit(null);
      void qc.invalidateQueries({ queryKey: ['pelayanan', pelayananId, 'pendaftaran'] });
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });
  if (q.isError || !q.data) return null;
  const rows = q.data;
  const nBuka = rows.filter((r) => r.status === 'BUKA').length;
  const nTutup = rows.filter((r) => r.status === 'TUTUP').length;
  return (
    <div className="bg-white border border-neutral-200 rounded-xl">
      <button onClick={() => !embedded && setOpen((x) => !x)} className={`w-full flex items-center justify-between px-4 py-3 ${embedded ? 'cursor-default' : ''}`}>
        <span className="font-semibold text-neutral-900">
          Pendaftaran per cabang
          <span className="ml-2 text-xs font-normal text-neutral-500">
            {nBuka} buka · {nTutup} tutup · {rows.length - nBuka - nTutup} belum dibuka
          </span>
        </span>
        {embedded ? null : open ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
      </button>
      {open ? (
        <div className="border-t border-neutral-100 divide-y divide-neutral-100">
          <p className="px-4 py-2 text-xs text-neutral-500 bg-neutral-50">
            Jemaat hanya bisa mendaftar di cabang yang statusnya <b>Buka pendaftaran</b>. Cabang yang belum dibuka atau ditutup tidak
            menampilkan tombol Gabung di app.
          </p>
          {rows.map((r) => (
            <div key={r.cabangId} className="px-4 py-2.5 flex flex-wrap items-center gap-2">
              <span className="font-medium text-neutral-900 w-full sm:w-40 min-w-0 break-words">{r.cabangNama}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_PEND[r.status].cls}`}>{STATUS_PEND[r.status].label}</span>
              <span className="text-xs text-neutral-500 flex-1 min-w-[120px] truncate">
                {r.catatan ?? ''}
                {r.tutupOtomatis ? ` · tutup otomatis ${r.tutupOtomatis}` : ''}
              </span>
              <button
                onClick={() => {
                  setEdit(r);
                  setCatatan(r.catatan ?? '');
                  setTutup(r.tutupOtomatis ?? '');
                }}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Buka pendaftaran
              </button>
              <button
                onClick={() => save.mutate({ cabangId: r.cabangId, isOpen: false })}
                disabled={save.isPending || r.status === 'TUTUP'}
                className="px-3 py-1 rounded-lg text-xs font-semibold border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-40"
              >
                Tutup pendaftaran
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {edit ? (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setEdit(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 pointer-events-auto space-y-3 max-h-[90vh] overflow-y-auto">
              <h3 className="font-semibold text-neutral-900">Buka pendaftaran · {edit.cabangNama}</h3>
              <label className="block text-sm">
                <span className="text-neutral-700">Catatan untuk calon pendaftar (opsional)</span>
                <textarea
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="mis. Dibutuhkan 2 operator kamera"
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <label className="block text-sm">
                <span className="text-neutral-700">Tutup otomatis setelah (opsional)</span>
                <input
                  type="date"
                  value={tutup}
                  onChange={(e) => setTutup(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setEdit(null)} className="px-3 py-1.5 rounded-lg text-sm hover:bg-neutral-100">
                  Batal
                </button>
                <button
                  onClick={() => save.mutate({ cabangId: edit.cabangId, isOpen: true, catatan: catatan.trim() || null, tutupOtomatis: tutup || null })}
                  disabled={save.isPending}
                  className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  Buka pendaftaran
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
