'use client';

/**
 * Akses CKids — atur pelayanan / role mana yang boleh membuka tiap menu di
 * aplikasi CKids (ckids.eccchurch.global). Bisa lebih dari satu per menu.
 * Fulltimer & Role Access "Gift Stall (CKids)" tetap berlaku.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Loader2, Pencil, Search, ShieldCheck, Users, X, BadgeCheck, ChevronRight, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { PelayananIcon } from '@/components/pelayanan/pelayanan-icon';

interface PelayananLite {
  id: string;
  nama: string;
  ikon?: string | null;
  warna?: string | null;
}
interface PosisiLite {
  id: string;
  nama: string;
  pelayanan: PelayananLite;
}
interface RoleLite {
  id: string;
  nama: string;
}
interface MenuRow {
  key: string;
  label: string;
  desc: string;
  manage: boolean;
  pelayanan: PelayananLite[];
  pelayananRoles?: PosisiLite[];
  roles: RoleLite[];
}

const errMsg = (e: unknown, f: string) =>
  (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? f;

export default function CkidsAccessPage() {
  const q = useQuery({
    queryKey: ['ckids-access'],
    queryFn: async () => (await apiClient.get<{ data: MenuRow[] }>('/admin/ckids-access')).data.data,
  });
  const [editing, setEditing] = useState<MenuRow | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Akses CKids</h1>
          <p className="text-sm text-neutral-500">
            Tentukan pelayanan dan role yang boleh membuka tiap menu di{' '}
            <Link href="https://ckids.eccchurch.global" target="_blank" className="text-brand-600 hover:underline inline-flex items-center gap-0.5">
              aplikasi CKids <ExternalLink className="w-3 h-3" />
            </Link>
            . Berlaku untuk anggota aktif pelayanan / pemegang role aktif.
          </p>
        </div>
      </div>

      <div className="text-xs text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
        Fulltimer selalu bisa membuka semua menu. Role Access “Gift Stall (CKids)” tetap berlaku: <strong>Lihat</strong> → menu
        lihat, <strong>Ubah</strong> → juga menu ubah data. Perubahan berlaku saat petugas membuka ulang / login ulang aplikasi CKids.
      </div>

      {q.isLoading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
          {(q.data ?? []).map((m) => (
            <div key={m.key} className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3">
              <div className="md:w-56 shrink-0">
                <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                  {m.label}
                  {m.manage ? (
                    <span className="text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Ubah data</span>
                  ) : null}
                </div>
                <div className="text-xs text-neutral-500">{m.desc}</div>
              </div>
              <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
                {m.pelayanan.length === 0 && (m.pelayananRoles ?? []).length === 0 && m.roles.length === 0 ? (
                  <span className="text-xs text-neutral-400">Belum ada — hanya Fulltimer & Role Access Gift Stall</span>
                ) : null}
                {m.pelayanan.map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full pl-1 pr-2 py-0.5">
                    <PelayananIcon ikon={p.ikon} warna={p.warna} size={16} />
                    {p.nama}
                  </span>
                ))}
                {(m.pelayananRoles ?? []).map((p) => (
                  <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 border-dashed rounded-full pl-1 pr-2 py-0.5">
                    <PelayananIcon ikon={p.pelayanan.ikon} warna={p.pelayanan.warna} size={16} />
                    {p.pelayanan.nama} <ChevronRight className="w-3 h-3 opacity-60" /> {p.nama}
                  </span>
                ))}
                {m.roles.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-800 border border-violet-200 rounded-full px-2 py-0.5">
                    <BadgeCheck className="w-3 h-3" />
                    {r.nama}
                  </span>
                ))}
              </div>
              <button
                onClick={() => setEditing(m)}
                className="self-start md:self-center inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-neutral-300 text-sm text-neutral-700 hover:bg-neutral-50 shrink-0"
              >
                <Pencil className="w-3.5 h-3.5" /> Atur
              </button>
            </div>
          ))}
        </div>
      )}

      {editing ? <EditModal menu={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function EditModal({ menu, onClose }: { menu: MenuRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pelayanan' | 'role'>('pelayanan');
  const [search, setSearch] = useState('');
  const [pel, setPel] = useState<Set<string>>(() => new Set(menu.pelayanan.map((p) => p.id)));
  const [pos, setPos] = useState<Set<string>>(() => new Set((menu.pelayananRoles ?? []).map((p) => p.id)));
  const [open, setOpen] = useState<Set<string>>(() => new Set((menu.pelayananRoles ?? []).map((p) => p.pelayanan.id)));
  const [rol, setRol] = useState<Set<string>>(() => new Set(menu.roles.map((r) => r.id)));

  const pelQ = useQuery({
    queryKey: ['pelayanan', 'options-all'],
    queryFn: async () =>
      (await apiClient.get<{ data: (PelayananLite & { isActive?: boolean; roles?: { id: string; nama: string; isActive?: boolean }[] })[] }>('/admin/pelayanan', {
        params: { limit: 100, sortBy: 'nama', sortOrder: 'asc' },
      })).data.data,
    staleTime: 60_000,
  });
  const roleQ = useQuery({
    queryKey: ['role', 'options-all'],
    queryFn: async () => (await apiClient.get<{ data: (RoleLite & { isActive?: boolean })[] }>('/admin/role')).data.data,
    staleTime: 60_000,
  });

  const save = useMutation({
    mutationFn: async () =>
      apiClient.put(`/admin/ckids-access/${menu.key}`, {
        pelayananIds: [...pel],
        // Posisi di pelayanan yang sudah dipilih utuh tidak perlu dikirim.
        pelayananRoleIds: [...pos].filter((id) => !(pelQ.data ?? []).some((p) => pel.has(p.id) && p.roles?.some((r) => r.id === id))),
        roleIds: [...rol],
      }),
    onSuccess: () => {
      toast.success(`Akses "${menu.label}" disimpan`);
      void qc.invalidateQueries({ queryKey: ['ckids-access'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });

  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    const src = tab === 'pelayanan' ? pelQ.data ?? [] : roleQ.data ?? [];
    return src.filter(
      (x) =>
        (x.isActive ?? true) &&
        (!s ||
          x.nama.toLowerCase().includes(s) ||
          ((x as { roles?: { nama: string }[] }).roles ?? []).some((r) => r.nama.toLowerCase().includes(s))),
    );
  }, [tab, search, pelQ.data, roleQ.data]);
  const setPicked = tab === 'pelayanan' ? setPel : setRol;
  const toggle = (id: string) =>
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const loading = tab === 'pelayanan' ? pelQ.isLoading : roleQ.isLoading;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={save.isPending ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
            <div>
              <h2 className="font-semibold text-neutral-900">Akses · {menu.label}</h2>
              <p className="text-xs text-neutral-500">{menu.desc}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 pt-3 space-y-2">
            <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5">
              {(['pelayanan', 'role'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    setSearch('');
                  }}
                  className={`flex-1 h-8 rounded-md text-sm inline-flex items-center justify-center gap-1.5 ${
                    tab === t ? 'bg-white shadow-sm font-semibold text-neutral-900' : 'text-neutral-600'
                  }`}
                >
                  {t === 'pelayanan' ? <Users className="w-3.5 h-3.5" /> : <BadgeCheck className="w-3.5 h-3.5" />}
                  {t === 'pelayanan' ? 'Pelayanan' : 'Role'}
                  <span className="text-xs text-neutral-500">({t === 'pelayanan' ? pel.size + pos.size : rol.size})</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'pelayanan' ? 'Cari pelayanan atau posisi…' : 'Cari role…'}
                className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {loading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : list.length === 0 ? (
              <div className="py-8 text-center text-sm text-neutral-400">Tidak ada yang cocok.</div>
            ) : (
              list.map((x) => {
                if (tab === 'role') {
                  return (
                    <label key={x.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-50 cursor-pointer">
                      <input type="checkbox" checked={rol.has(x.id)} onChange={() => toggle(x.id)} className="w-4 h-4 accent-brand-500" />
                      <BadgeCheck className="w-4 h-4 text-violet-500" />
                      <span className="text-sm text-neutral-800">{x.nama}</span>
                    </label>
                  );
                }
                const p = x as PelayananLite & { roles?: { id: string; nama: string; isActive?: boolean }[] };
                const roles = (p.roles ?? []).filter((r) => r.isActive ?? true);
                const whole = pel.has(p.id);
                const nPos = roles.filter((r) => pos.has(r.id)).length;
                const isOpen = open.has(p.id) || (!!search.trim() && roles.some((r) => r.nama.toLowerCase().includes(search.trim().toLowerCase())));
                return (
                  <div key={p.id} className="rounded-lg">
                    <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        checked={whole}
                        ref={(el) => {
                          if (el) el.indeterminate = !whole && nPos > 0;
                        }}
                        onChange={() => toggle(p.id)}
                        className="w-4 h-4 accent-brand-500"
                        title="Semua anggota pelayanan ini"
                      />
                      <PelayananIcon ikon={p.ikon} warna={p.warna} size={22} />
                      <button
                        type="button"
                        onClick={() => setOpen((prev) => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                        className="flex-1 flex items-center justify-between text-left text-sm text-neutral-800"
                      >
                        <span>
                          {p.nama}
                          <span className="ml-1.5 text-xs text-neutral-500">
                            {whole ? '· semua anggota' : nPos ? `· ${nPos} posisi` : ''}
                          </span>
                        </span>
                        {roles.length ? (isOpen ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />) : null}
                      </button>
                    </div>
                    {isOpen && roles.length > 0 ? (
                      <div className="ml-9 mb-1 border-l border-neutral-200 pl-3">
                        {roles.map((r) => (
                          <label key={r.id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${whole ? 'opacity-60' : 'hover:bg-neutral-50 cursor-pointer'}`}>
                            <input
                              type="checkbox"
                              disabled={whole}
                              checked={whole || pos.has(r.id)}
                              onChange={() => setPos((prev) => { const n = new Set(prev); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                              className="w-4 h-4 accent-brand-500"
                            />
                            <span className="text-sm text-neutral-700">{r.nama}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
          <div className="flex gap-2 px-5 py-3 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl">
            <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-neutral-300 bg-white text-sm text-neutral-700">
              Batal
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex-1 h-10 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Simpan ({pel.size + pos.size + rol.size})
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
