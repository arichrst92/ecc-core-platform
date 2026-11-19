'use client';

/**
 * 2.5.0 — Kelola pilihan "bagian / tugas" petugas pelayanan (Kategori → Tugas).
 * Dipakai koordinator (app) & admin (Portal) saat menyusun jadwal petugas.
 * Hapus = nonaktif: jadwal lama tetap menampilkan nama yang tersimpan.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Eye, EyeOff, ImagePlus, Loader2, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { PELAYANAN_IKON } from '@ecc/shared-types';
import { PELAYANAN_ICON_MAP, PelayananIcon } from '@/components/pelayanan/pelayanan-icon';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

export interface TugasItem {
  id: string;
  nama: string;
  urutan?: number;
  isActive?: boolean;
}
export interface TugasKategori {
  id: string;
  nama: string;
  ikon: string | null;
  urutan?: number;
  isActive?: boolean;
  tugas: TugasItem[];
}

const errMsg = (e: any, fb: string) => e?.response?.data?.error?.message ?? fb;

export function useTugasKategori(pelayananId: string | null | undefined, all = false) {
  return useQuery({
    queryKey: ['pelayanan', pelayananId, 'tugas-kategori', all ? 'all' : 'active'],
    queryFn: async () =>
      (
        await apiClient.get<{ data: TugasKategori[] }>(`/admin/pelayanan/${pelayananId}/tugas-kategori`, {
          params: all ? { all: 1 } : undefined,
        })
      ).data.data,
    enabled: !!pelayananId,
    staleTime: 60_000,
  });
}

export function TugasKategoriPanel({
  pelayananId,
  warna,
  embedded = false,
}: {
  pelayananId: string;
  warna?: string | null;
  /** true = selalu terbuka (tab Tugas petugas di detail pelayanan). */
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const [openState, setOpen] = useState(false);
  const open = embedded || openState;
  const [showInactive, setShowInactive] = useState(false);
  const [newKat, setNewKat] = useState('');
  const [newTugas, setNewTugas] = useState<Record<string, string>>({});
  const [iconFor, setIconFor] = useState<string | null>(null);
  const q = useTugasKategori(pelayananId, true);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['pelayanan', pelayananId, 'tugas-kategori'] });

  const mut = useMutation({
    mutationFn: async (a: { method: 'post' | 'patch' | 'put' | 'delete'; url: string; body?: unknown; ok?: string }) => {
      if (a.method === 'delete') await apiClient.delete(a.url);
      else await apiClient[a.method](a.url, a.body);
      return a.ok;
    },
    onSuccess: (ok) => {
      if (ok) toast.success(ok);
      void invalidate();
    },
    onError: (e) => {
      toast.error(errMsg(e, 'Gagal menyimpan'));
      void invalidate();
    },
  });

  const rows = q.data ?? [];
  const activeKat = rows.filter((k) => k.isActive !== false);
  const nTugas = activeKat.reduce((n, k) => n + k.tugas.filter((t) => t.isActive !== false).length, 0);
  const visible = showInactive ? rows : activeKat;

  /** Tukar posisi `id` dengan tetangga terlihat (dir -1 naik, +1 turun); kirim urutan lengkap. */
  const move = (full: { id: string }[], shown: { id: string }[], id: string, dir: -1 | 1, url: string) => {
    const si = shown.findIndex((x) => x.id === id);
    const other = shown[si + dir];
    if (!other) return;
    const ids = full.map((x) => x.id);
    const a = ids.indexOf(id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b]!, ids[a]!];
    // Optimistic: urutkan cache dulu supaya tidak "lompat".
    qc.setQueryData<TugasKategori[]>(['pelayanan', pelayananId, 'tugas-kategori', 'all'], (old) => {
      if (!old) return old;
      const order = new Map(ids.map((x, i) => [x, i]));
      const sortBy = <T extends { id: string }>(l: T[]) =>
        order.has(l[0]?.id ?? '') ? [...l].sort((p, q2) => (order.get(p.id) ?? 0) - (order.get(q2.id) ?? 0)) : l;
      const top = sortBy(old);
      return top.map((k) => ({ ...k, tugas: sortBy(k.tugas) }));
    });
    mut.mutate({ method: 'put', url, body: { ids } });
  };

  const addKat = () => {
    const nama = newKat.trim();
    if (!nama) return;
    mut.mutate(
      { method: 'post', url: `/admin/pelayanan/${pelayananId}/tugas-kategori`, body: { nama }, ok: `Kategori "${nama}" ditambahkan` },
      { onSuccess: () => setNewKat('') },
    );
  };
  const addTugas = (k: TugasKategori) => {
    const nama = (newTugas[k.id] ?? '').trim();
    if (!nama) return;
    mut.mutate(
      { method: 'post', url: `/admin/pelayanan/tugas-kategori/${k.id}/tugas`, body: { nama }, ok: `Tugas "${nama}" ditambahkan` },
      { onSuccess: () => setNewTugas((m) => ({ ...m, [k.id]: '' })) },
    );
  };
  const rename = (kind: 'kategori' | 'tugas', id: string, nama: string) => {
    const url = kind === 'kategori' ? `/admin/pelayanan/tugas-kategori/${id}` : `/admin/pelayanan/tugas-item/${id}`;
    mut.mutate({ method: 'patch', url, body: { nama }, ok: 'Nama diperbarui' });
  };

  const iconBtn = 'p-1 rounded hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="bg-white border border-neutral-200 rounded-xl">
      <button
        onClick={() => !embedded && setOpen((x) => !x)}
        className={`w-full flex items-center justify-between px-4 py-3 ${embedded ? 'cursor-default' : ''}`}
      >
        <span className="font-semibold text-neutral-900">
          Kategori &amp; tugas petugas
          <span className="ml-2 text-xs font-normal text-neutral-500">
            {activeKat.length} kategori · {nTugas} tugas
          </span>
        </span>
        {embedded ? null : open ? (
          <ChevronUp className="w-4 h-4 text-neutral-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400" />
        )}
      </button>
      {open ? (
        <div className="border-t border-neutral-100">
          <div className="px-4 py-2 text-xs text-neutral-500 bg-neutral-50 flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[240px]">
              Pilihan bagian yang ditetapkan koordinator untuk tiap petugas di jadwal ibadah / event. Klik nama untuk mengubah, panah untuk
              mengatur urutan, ikon untuk menggantinya.
            </span>
            <button
              onClick={() => setShowInactive((x) => !x)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-neutral-200 text-neutral-600"
            >
              {showInactive ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {showInactive ? 'Sembunyikan nonaktif' : 'Tampilkan nonaktif'}
            </button>
          </div>
          {q.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {visible.length === 0 ? <p className="px-4 py-4 text-sm text-neutral-500">Belum ada kategori.</p> : null}
              {visible.map((k, ki) => {
                const inactive = k.isActive === false;
                const tugas = showInactive ? k.tugas : k.tugas.filter((t) => t.isActive !== false);
                const moveTargets = activeKat.filter((x) => x.id !== k.id);
                return (
                  <div key={k.id} className={`px-4 py-3 space-y-2 ${inactive ? 'opacity-60' : ''}`}>
                    {/* Header kategori */}
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <button
                          className={iconBtn}
                          disabled={ki === 0 || mut.isPending}
                          onClick={() => move(rows, visible, k.id, -1, `/admin/pelayanan/${pelayananId}/tugas-kategori/urutan`)}
                          title="Naikkan"
                        >
                          <ArrowUp className="w-3 h-3 text-neutral-500" />
                        </button>
                        <button
                          className={iconBtn}
                          disabled={ki === visible.length - 1 || mut.isPending}
                          onClick={() => move(rows, visible, k.id, 1, `/admin/pelayanan/${pelayananId}/tugas-kategori/urutan`)}
                          title="Turunkan"
                        >
                          <ArrowDown className="w-3 h-3 text-neutral-500" />
                        </button>
                      </div>
                      <div className="relative">
                        <button
                          onClick={() => setIconFor(iconFor === k.id ? null : k.id)}
                          className="rounded-lg ring-offset-1 hover:ring-2 hover:ring-brand-300"
                          title="Ganti ikon"
                          disabled={inactive}
                        >
                          {k.ikon ? (
                            <PelayananIcon ikon={k.ikon} warna={warna} size={28} />
                          ) : (
                            <span className="w-7 h-7 rounded-lg border border-dashed border-neutral-300 flex items-center justify-center text-neutral-400">
                              <ImagePlus className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </button>
                        {iconFor === k.id ? (
                          <IconGrid
                            value={k.ikon}
                            warna={warna}
                            onClose={() => setIconFor(null)}
                            onPick={(ikon) => {
                              setIconFor(null);
                              mut.mutate({ method: 'patch', url: `/admin/pelayanan/tugas-kategori/${k.id}`, body: { ikon }, ok: 'Ikon diperbarui' });
                            }}
                          />
                        ) : null}
                      </div>
                      <InlineName
                        value={k.nama}
                        maxLength={60}
                        disabled={inactive}
                        className="font-semibold text-neutral-900"
                        onSave={(nama) => rename('kategori', k.id, nama)}
                      />
                      {inactive ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">nonaktif</span> : null}
                      <span className="flex-1" />
                      {inactive ? (
                        <button
                          onClick={() =>
                            mut.mutate({ method: 'patch', url: `/admin/pelayanan/tugas-kategori/${k.id}`, body: { isActive: true }, ok: 'Kategori diaktifkan' })
                          }
                          className="p-1.5 rounded hover:bg-neutral-100"
                          title="Aktifkan lagi"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (window.confirm(`Nonaktifkan kategori "${k.nama}"? Jadwal yang sudah tersimpan tetap menampilkannya.`))
                              mut.mutate({ method: 'delete', url: `/admin/pelayanan/tugas-kategori/${k.id}`, ok: 'Kategori dinonaktifkan' });
                          }}
                          className="p-1.5 rounded hover:bg-red-50"
                          title="Nonaktifkan"
                        >
                          <X className="w-3.5 h-3.5 text-red-600" />
                        </button>
                      )}
                    </div>

                    {/* Daftar tugas */}
                    <div className="ml-14 space-y-1">
                      {tugas.map((t, ti) => {
                        const tIn = t.isActive === false;
                        const kUrl = `/admin/pelayanan/tugas-kategori/${k.id}/urutan`;
                        return (
                          <div key={t.id} className={`flex items-center gap-1.5 group ${tIn ? 'opacity-60' : ''}`}>
                            <button className={iconBtn} disabled={ti === 0 || mut.isPending} onClick={() => move(k.tugas, tugas, t.id, -1, kUrl)} title="Naikkan">
                              <ArrowUp className="w-3 h-3 text-neutral-500" />
                            </button>
                            <button
                              className={iconBtn}
                              disabled={ti === tugas.length - 1 || mut.isPending}
                              onClick={() => move(k.tugas, tugas, t.id, 1, kUrl)}
                              title="Turunkan"
                            >
                              <ArrowDown className="w-3 h-3 text-neutral-500" />
                            </button>
                            <span className="text-neutral-300">•</span>
                            <InlineName
                              value={t.nama}
                              maxLength={80}
                              disabled={tIn}
                              className={`text-sm ${tIn ? 'text-neutral-400 line-through' : 'text-neutral-800'}`}
                              onSave={(nama) => rename('tugas', t.id, nama)}
                            />
                            <span className="flex-1" />
                            {!tIn && moveTargets.length ? (
                              <select
                                value=""
                                onChange={(e) => {
                                  const dest = moveTargets.find((x) => x.id === e.target.value);
                                  if (!dest) return;
                                  mut.mutate({
                                    method: 'patch',
                                    url: `/admin/pelayanan/tugas-item/${t.id}`,
                                    body: { kategoriId: dest.id },
                                    ok: `"${t.nama}" dipindah ke ${dest.nama}`,
                                  });
                                }}
                                className="text-xs border border-neutral-200 rounded-md px-1.5 py-0.5 bg-white text-neutral-600 opacity-60 group-hover:opacity-100"
                                title="Pindah ke kategori lain"
                              >
                                <option value="">Pindah ke…</option>
                                {moveTargets.map((x) => (
                                  <option key={x.id} value={x.id}>
                                    {x.nama}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                            {tIn ? (
                              <button
                                onClick={() =>
                                  mut.mutate({ method: 'patch', url: `/admin/pelayanan/tugas-item/${t.id}`, body: { isActive: true }, ok: 'Tugas diaktifkan' })
                                }
                                className="p-1 rounded hover:bg-neutral-100"
                                title="Aktifkan lagi"
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                              </button>
                            ) : (
                              <button
                                onClick={() => mut.mutate({ method: 'delete', url: `/admin/pelayanan/tugas-item/${t.id}`, ok: 'Tugas dinonaktifkan' })}
                                className="p-1 rounded hover:bg-red-50"
                                title="Nonaktifkan"
                              >
                                <X className="w-3.5 h-3.5 text-red-500" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                      {!inactive ? (
                        <div className="flex items-center gap-1.5 pt-1">
                          <input
                            value={newTugas[k.id] ?? ''}
                            onChange={(e) => setNewTugas((m) => ({ ...m, [k.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && addTugas(k)}
                            placeholder="Tugas baru…"
                            maxLength={80}
                            className="w-56 px-2.5 py-1 border border-neutral-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-500"
                          />
                          <button
                            onClick={() => addTugas(k)}
                            disabled={!newTugas[k.id]?.trim() || mut.isPending}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-brand-500 text-white disabled:opacity-40"
                          >
                            <Plus className="w-3 h-3" /> Tugas
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div className="px-4 py-3 flex items-center gap-2">
                <input
                  value={newKat}
                  onChange={(e) => setNewKat(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addKat()}
                  placeholder="Kategori baru, mis. Sound, Lighting, Multimedia"
                  maxLength={60}
                  className="flex-1 px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  onClick={addKat}
                  disabled={!newKat.trim() || mut.isPending}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" /> Kategori
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Nama yang bisa diedit langsung: klik → input; Enter/klik luar = simpan, Esc = batal. */
function InlineName({
  value,
  onSave,
  maxLength,
  disabled,
  className = '',
}: {
  value: string;
  onSave: (v: string) => void;
  maxLength: number;
  disabled?: boolean;
  className?: string;
}) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value);
  const commit = () => {
    const nama = v.trim();
    setEdit(false);
    if (nama && nama !== value) onSave(nama);
    else setV(value);
  };
  if (edit)
    return (
      <input
        autoFocus
        value={v}
        maxLength={maxLength}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setV(value);
            setEdit(false);
          }
        }}
        className={`px-1.5 py-0.5 border border-brand-400 rounded-md outline-none focus:ring-2 focus:ring-brand-300 min-w-[160px] ${className}`}
      />
    );
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setV(value);
        setEdit(true);
      }}
      className={`inline-flex items-center gap-1 rounded-md px-1 -mx-1 hover:bg-neutral-100 disabled:hover:bg-transparent text-left ${className}`}
      title={disabled ? undefined : 'Klik untuk mengubah nama'}
    >
      {value}
      {!disabled ? <Pencil className="w-3 h-3 text-neutral-300" /> : null}
    </button>
  );
}

/** Pilihan ikon (daftar sama dengan ikon pelayanan). */
function IconGrid({
  value,
  warna,
  onPick,
  onClose,
}: {
  value: string | null;
  warna?: string | null;
  onPick: (ikon: string | null) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute left-0 top-9 z-40 w-[296px] bg-white border border-neutral-200 rounded-xl shadow-lg p-2">
        <div className="grid grid-cols-8 gap-1">
          {PELAYANAN_IKON.map((ik) => (
            <button
              key={ik}
              onClick={() => onPick(ik)}
              className={`p-0.5 rounded-lg ${value === ik ? 'ring-2 ring-brand-500' : 'hover:bg-neutral-100'}`}
              title={ik}
            >
              <PelayananIcon ikon={ik} warna={warna} size={28} />
            </button>
          ))}
        </div>
        <button onClick={() => onPick(null)} className="mt-2 w-full text-xs text-neutral-600 py-1 rounded-md hover:bg-neutral-100">
          Tanpa ikon
        </button>
      </div>
    </>
  );
}

// ------------------------------------------------------------------
//  Picker: pilih kategori (opsional) → tugas (opsional), multi.
// ------------------------------------------------------------------

export interface TugasEntry {
  kategoriId: string;
  kategori: string;
  ikon: string | null;
  tugasId: string | null;
  tugas: string | null;
}
export type TugasPilihan = { kategoriId: string; tugasId: string | null };

export const tugasText = (list: TugasEntry[] | null | undefined) =>
  (list ?? []).map((t) => (t.tugas ? `${t.kategori} › ${t.tugas}` : t.kategori)).join(', ');

export const toPilihan = (list: TugasEntry[] | null | undefined): TugasPilihan[] =>
  (list ?? []).map((t) => ({ kategoriId: t.kategoriId, tugasId: t.tugasId }));

/**
 * Chip kategori: klik = pilih/lepas kategori. Kategori terpilih membuka chip
 * tugasnya; memilih tugas menggantikan entri "kategori saja".
 */
export function TugasPicker({
  options,
  value,
  onChange,
}: {
  options: TugasKategori[];
  value: TugasPilihan[];
  onChange: (v: TugasPilihan[]) => void;
}) {
  if (!options.length)
    return <p className="text-xs text-neutral-500">Belum ada kategori tugas. Atur di halaman detail pelayanan.</p>;
  const katOn = (kid: string) => value.some((v) => v.kategoriId === kid);
  const tugasOn = (kid: string, tid: string) => value.some((v) => v.kategoriId === kid && v.tugasId === tid);
  const toggleKat = (kid: string) =>
    onChange(katOn(kid) ? value.filter((v) => v.kategoriId !== kid) : [...value, { kategoriId: kid, tugasId: null }]);
  const toggleTugas = (kid: string, tid: string) => {
    let next = tugasOn(kid, tid)
      ? value.filter((v) => !(v.kategoriId === kid && v.tugasId === tid))
      : [...value.filter((v) => !(v.kategoriId === kid && v.tugasId === null)), { kategoriId: kid, tugasId: tid }];
    // Semua tugas dilepas → tetap pilih kategorinya saja.
    if (!next.some((v) => v.kategoriId === kid)) next = [...next, { kategoriId: kid, tugasId: null }];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => toggleKat(k.id)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              katOn(k.id) ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {k.ikon && PELAYANAN_ICON_MAP[k.ikon]
              ? (() => {
                  const I = PELAYANAN_ICON_MAP[k.ikon]!;
                  return <I className="w-3.5 h-3.5" />;
                })()
              : null}
            {k.nama}
          </button>
        ))}
      </div>
      {options
        .filter((k) => katOn(k.id) && k.tugas.length)
        .map((k) => (
          <div key={k.id} className="pl-2 border-l-2 border-brand-200">
            <p className="text-[11px] text-neutral-500 mb-1">{k.nama} › tugas (opsional)</p>
            <div className="flex flex-wrap gap-1.5">
              {k.tugas.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTugas(k.id, t.id)}
                  className={`px-2 py-0.5 rounded-full text-xs border ${
                    tugasOn(k.id, t.id) ? 'bg-brand-50 border-brand-400 text-brand-700 font-semibold' : 'bg-white border-neutral-200 text-neutral-600'
                  }`}
                >
                  {t.nama}
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

/** Modal ubah tugas satu petugas (PATCH endpoint petugas ibadah / event). */
export function TugasEditModal({
  pelayananId,
  nama,
  initial,
  patchUrl,
  invalidateKey,
  onClose,
}: {
  pelayananId: string;
  nama: string;
  initial: TugasEntry[] | null | undefined;
  patchUrl: string;
  invalidateKey: readonly unknown[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const opts = useTugasKategori(pelayananId);
  const [value, setValue] = useState<TugasPilihan[]>(() => toPilihan(initial));
  const save = useMutation({
    mutationFn: async () => apiClient.patch(patchUrl, { tugas: value.length ? value : null }),
    onSuccess: () => {
      toast.success('Tugas petugas disimpan');
      void qc.invalidateQueries({ queryKey: invalidateKey as unknown[] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan tugas')),
  });
  // Pilihan lama yang sudah nonaktif tetap ditampilkan (tidak hilang saat disimpan).
  const known = new Set((opts.data ?? []).flatMap((k) => [`${k.id}:`, ...k.tugas.map((t) => `${k.id}:${t.id}`)]));
  const legacy = (initial ?? []).filter((t) => !known.has(`${t.kategoriId}:${t.tugasId ?? ''}`));
  const legacyKept = legacy.filter((l) => value.some((v) => v.kategoriId === l.kategoriId && v.tugasId === l.tugasId));
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 pointer-events-auto space-y-3">
          <div>
            <h3 className="font-semibold text-neutral-900">Tugas · {nama}</h3>
            <p className="text-xs text-neutral-500">Pilih kategori, lalu tugas (opsional). Boleh lebih dari satu, atau kosongkan.</p>
          </div>
          {opts.isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          ) : (
            <TugasPicker options={opts.data ?? []} value={value} onChange={setValue} />
          )}
          {legacyKept.length ? (
            <p className="text-[11px] text-neutral-500">Tetap tersimpan (pilihan sudah nonaktif): {tugasText(legacyKept)}</p>
          ) : null}
          <div className="flex justify-between gap-2 pt-1">
            <button onClick={() => setValue([])} className="px-3 py-1.5 rounded-lg text-sm text-neutral-600 hover:bg-neutral-100">
              Kosongkan
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm hover:bg-neutral-100">
                Batal
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
