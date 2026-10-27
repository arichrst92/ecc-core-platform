'use client';

/**
 * Tamu — teman yang diundang jemaat / walk-in di ibadah & event.
 * Tim ECC memperbarui status tindak lanjut; jemaat pengundang melihat
 * statusnya di aplikasi (Profil → Tamu Saya).
 * API: /admin/tamu
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Contact, Loader2, MessageCircle, Plus, Search, StickyNote, UserCheck, X } from 'lucide-react';
import { AddGuestModal } from '@/components/tamu/add-guest-modal';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';
import { ExportButtons, selectCls, useCabangOptions } from '@/components/report/report-ui';
import { todayYmd } from '@/lib/dates';

type Status = 'DIUNDANG' | 'TERLIBAT' | 'FOLLOWUP' | 'TERDAFTAR';

interface Tamu {
  id: string;
  namaLengkap: string;
  noHp: string | null;
  kode: string | null;
  isTamu: boolean;
  isAnak?: boolean;
  tanggalLahir?: string | null;
  cabang: { id: string; nama: string } | null;
  pertamaDicatat: string;
  pengundang: { id: string; namaLengkap: string; noHp: string | null; sejak: string }[];
  /** Homecell tempat tamu dicatat (oleh pemimpin homecell di app). */
  homecell?: { id: string; nama: string; sejak: string; catatan: string | null }[];
  kehadiran: number;
  terakhirHadir: string | null;
  terakhirAcara: { jenis: 'IBADAH' | 'EVENT'; id: string; nama: string; tanggal: string } | null;
  status: Status;
  statusLabel: string;
  statusTersimpan: string | null;
  statusDiubah: string | null;
  catatan: string | null;
  followupBy: { id: string; namaLengkap: string; noHp: string | null } | null;
  followupSejak: string | null;
}

interface ListResp {
  data: Tamu[];
  meta: {
    page: number;
    total: number;
    totalPages: number;
    totalAll: number;
    counts: Record<Status, number>;
    statusOptions: { value: Status; label: string }[];
    followupPeople: { id: string; namaLengkap: string }[];
  };
}

const STATUS_STYLE: Record<Status, string> = {
  DIUNDANG: 'bg-neutral-100 text-neutral-700',
  TERLIBAT: 'bg-sky-100 text-sky-700',
  FOLLOWUP: 'bg-amber-100 text-amber-800',
  TERDAFTAR: 'bg-green-100 text-green-700',
};
const STATUS_ORDER: Status[] = ['DIUNDANG', 'TERLIBAT', 'FOLLOWUP', 'TERDAFTAR'];
const STATUS_LABEL: Record<Status, string> = {
  DIUNDANG: 'Diundang',
  TERLIBAT: 'Sudah terlibat event / ibadah',
  FOLLOWUP: 'Sedang di-follow-up ECC',
  TERDAFTAR: 'Sudah terdaftar di ECC',
};

const tgl = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const waLink = (hp: string) => `https://wa.me/${hp.replace(/\D/g, '')}`;

export default function TamuPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status | ''>('');
  const [cabangId, setCabangId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [noteFor, setNoteFor] = useState<Tamu | null>(null);
  const [assignFor, setAssignFor] = useState<Tamu | null>(null);
  const [followupBy, setFollowupBy] = useState('');
  const [sumber, setSumber] = useState('');
  const [adding, setAdding] = useState(false);
  const s = useDebounce(search, 300);
  const cabangQ = useCabangOptions();

  // Filter yang sama untuk daftar & export
  const filterParams: Record<string, string | undefined> = {
    status: status || undefined,
    cabangId: cabangId || undefined,
    search: s || undefined,
    followupBy: followupBy || undefined,
    sumber: sumber || undefined,
  };

  const q = useQuery({
    queryKey: ['tamu', status, cabangId, s, followupBy, sumber, page],
    queryFn: async () =>
      (
        await apiClient.get<ListResp>('/admin/tamu', {
          params: { ...filterParams, page },
        })
      ).data,
    placeholderData: (p) => p,
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: { status?: Status; catatan?: string | null; followupById?: string | null };
    }) =>
      apiClient.patch(`/admin/tamu/${id}`, body),
    onSuccess: () => {
      toast.success('Tersimpan');
      qc.invalidateQueries({ queryKey: ['tamu'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });

  const meta = q.data?.meta;
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <Contact className="w-6 h-6 text-brand-500" /> Tamu
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5 max-w-3xl">
          Teman yang diundang jemaat atau datang langsung ke ibadah / event. Perbarui status tindak lanjut di sini —
          jemaat yang mengundang melihat statusnya di aplikasi. Status otomatis naik ke <i>Sudah terlibat</i> saat tamu
          hadir, dan ke <i>Sudah terdaftar</i> saat tamu mendaftar Els App.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <ExportButtons endpoint="/admin/tamu/export" params={filterParams} filename={`tamu-${todayYmd()}`} />
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-semibold hover:bg-brand-600"
        >
          <Plus className="w-4 h-4" /> Tambah Tamu
        </button>
      </div>
      </div>
      {adding ? (
        <AddGuestModal onClose={() => setAdding(false)} onSuccess={() => qc.invalidateQueries({ queryKey: ['tamu'] })} />
      ) : null}

      {/* Ringkasan per status (klik untuk filter) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <button
          onClick={() => {
            setStatus('');
            setPage(1);
          }}
          className={`text-left bg-white border rounded-xl px-4 py-3 ${status === '' ? 'border-brand-400 ring-2 ring-brand-100' : 'border-neutral-200'}`}
        >
          <div className="text-2xl font-bold text-neutral-900">{meta?.totalAll ?? '—'}</div>
          <div className="text-xs text-neutral-500">Semua tamu</div>
        </button>
        {STATUS_ORDER.map((st) => (
          <button
            key={st}
            onClick={() => {
              setStatus(st);
              setPage(1);
            }}
            className={`text-left bg-white border rounded-xl px-4 py-3 ${status === st ? 'border-brand-400 ring-2 ring-brand-100' : 'border-neutral-200'}`}
          >
            <div className="text-2xl font-bold text-neutral-900">{meta?.counts[st] ?? '—'}</div>
            <div className="text-xs text-neutral-500">{STATUS_LABEL[st]}</div>
          </button>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama tamu / no HP / pengundang / homecell"
            className="flex-1 py-1.5 outline-none text-sm"
          />
        </div>
        <select
          value={cabangId}
          onChange={(e) => {
            setCabangId(e.target.value);
            setPage(1);
          }}
          className={`${selectCls} w-48`}
        >
          <option value="">Semua cabang</option>
          {(cabangQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>
        <select
          value={followupBy}
          onChange={(e) => {
            setFollowupBy(e.target.value);
            setPage(1);
          }}
          className={`${selectCls} w-56`}
        >
          <option value="">Semua petugas follow-up</option>
          <option value="none">Belum ada petugas follow-up</option>
          {(meta?.followupPeople ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.namaLengkap}
            </option>
          ))}
        </select>
        <select
          value={sumber}
          onChange={(e) => {
            setSumber(e.target.value);
            setPage(1);
          }}
          className={`${selectCls} w-44`}
        >
          <option value="">Semua sumber</option>
          <option value="homecell">Tamu homecell</option>
        </select>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        {q.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-sm text-neutral-400">Tidak ada tamu.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Tamu</th>
                <th className="text-left px-4 py-2 font-medium">Diundang oleh</th>
                <th className="text-left px-4 py-2 font-medium">Kehadiran</th>
                <th className="text-left px-4 py-2 font-medium w-64">Status</th>
                <th className="text-left px-4 py-2 font-medium w-48">Difollow-up oleh</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/jemaat/${t.id}`} className="font-medium text-neutral-900 hover:text-brand-600 hover:underline">
                      {t.namaLengkap}
                    </Link>
                    {t.isAnak ? (
                      <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded bg-pink-100 text-pink-700 align-middle">
                        Anak
                      </span>
                    ) : null}
                    <div className="text-xs text-neutral-500 flex items-center gap-1.5">
                      {t.noHp ? (
                        <a href={waLink(t.noHp)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-green-700">
                          <MessageCircle className="w-3 h-3" /> {t.noHp}
                        </a>
                      ) : (
                        'Tanpa no HP'
                      )}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {t.cabang?.nama ?? '—'} · dicatat {tgl(t.pertamaDicatat)}
                      {!t.isTamu ? ' · sudah punya akun' : ''}
                    </div>
                    {t.homecell && t.homecell.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {t.homecell.map((h) => (
                          <Link
                            key={h.id}
                            href={`/dashboard/homecell/${h.id}`}
                            className="px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 text-[10px] font-semibold hover:underline"
                            title={h.catatan ?? undefined}
                          >
                            Homecell: {h.nama}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {t.pengundang.length === 0 ? (
                      <span className="text-neutral-400">Walk-in</span>
                    ) : (
                      t.pengundang.map((p) => (
                        <div key={p.id}>
                          <Link href={`/dashboard/jemaat/${p.id}`} className="text-neutral-800 hover:underline">
                            {p.namaLengkap}
                          </Link>
                          <span className="text-neutral-400"> · {tgl(p.sejak)}</span>
                        </div>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {t.kehadiran ? (
                      <>
                        <div className="font-semibold text-neutral-800">{t.kehadiran}× hadir</div>
                        <div>terakhir {tgl(t.terakhirHadir)}</div>
                        {t.terakhirAcara ? (
                          <div className="text-neutral-500">
                            {t.terakhirAcara.jenis === 'EVENT' ? 'Event' : 'Ibadah'}: {t.terakhirAcara.nama}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-neutral-400">Belum hadir</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={t.status}
                      disabled={update.isPending}
                      onChange={(e) => update.mutate({ id: t.id, body: { status: e.target.value as Status } })}
                      className={`w-full text-xs font-semibold rounded-full px-3 py-1.5 border-0 ${STATUS_STYLE[t.status]}`}
                    >
                      {STATUS_ORDER.map((st) => (
                        <option key={st} value={st}>
                          {STATUS_LABEL[st]}
                        </option>
                      ))}
                    </select>
                    {t.statusDiubah ? (
                      <div className="text-[10px] text-neutral-400 mt-1">Diubah {tgl(t.statusDiubah)}</div>
                    ) : null}
                    {t.catatan ? <div className="text-[11px] text-neutral-600 mt-1 line-clamp-2">“{t.catatan}”</div> : null}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {t.followupBy ? (
                      <>
                        <Link href={`/dashboard/jemaat/${t.followupBy.id}`} className="font-medium text-neutral-800 hover:underline">
                          {t.followupBy.namaLengkap}
                        </Link>
                        {t.followupSejak ? <div className="text-[10px] text-neutral-400">sejak {tgl(t.followupSejak)}</div> : null}
                      </>
                    ) : (
                      <span className="text-neutral-400">Belum ada</span>
                    )}
                    <button onClick={() => setAssignFor(t)} className="block mt-1 text-brand-600 hover:underline">
                      {t.followupBy ? 'Ganti' : 'Tugaskan'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setNoteFor(t)}
                      className="p-1.5 rounded text-neutral-400 hover:text-brand-600 hover:bg-neutral-100"
                      title="Catatan follow-up"
                    >
                      <StickyNote className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 text-xs text-neutral-500">
            <span>
              Halaman {meta.page} dari {meta.totalPages} · {meta.total} tamu
            </span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">
                ←
              </button>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border rounded disabled:opacity-40"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {assignFor && (
        <AssignModal
          tamu={assignFor}
          saving={update.isPending}
          onClose={() => setAssignFor(null)}
          onSave={(followupById) =>
            update.mutate({ id: assignFor.id, body: { followupById } }, { onSuccess: () => setAssignFor(null) })
          }
        />
      )}

      {noteFor && (
        <NoteModal
          tamu={noteFor}
          saving={update.isPending}
          onClose={() => setNoteFor(null)}
          onSave={(catatan) => update.mutate({ id: noteFor.id, body: { catatan } }, { onSuccess: () => setNoteFor(null) })}
        />
      )}
    </div>
  );
}

function NoteModal({
  tamu,
  saving,
  onClose,
  onSave,
}: {
  tamu: Tamu;
  saving: boolean;
  onClose: () => void;
  onSave: (v: string | null) => void;
}) {
  const [v, setV] = useState(tamu.catatan ?? '');
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-semibold">Catatan follow-up</h2>
              <p className="text-xs text-neutral-500">{tamu.namaLengkap} · hanya terlihat oleh tim ECC</p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            value={v}
            onChange={(e) => setV(e.target.value)}
            rows={5}
            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="mis. Sudah ditelepon 18 Okt, tertarik ikut homecell area Selatan"
          />
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-neutral-300">
              Batal
            </button>
            <button
              onClick={() => onSave(v.trim() || null)}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
            >
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

interface JemaatOpt {
  id: string;
  namaLengkap: string;
  kode: string | null;
  noHp: string | null;
  cabang?: { nama: string } | null;
}

function AssignModal({
  tamu,
  saving,
  onClose,
  onSave,
}: {
  tamu: Tamu;
  saving: boolean;
  onClose: () => void;
  onSave: (followupById: string | null) => void;
}) {
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 300);
  const res = useQuery({
    queryKey: ['jemaat-pick-followup', dq],
    enabled: dq.length >= 2,
    queryFn: async () =>
      (await apiClient.get<{ data: JemaatOpt[] }>('/admin/jemaat', { params: { search: dq, limit: 8, isActive: 'true' } })).data.data,
    staleTime: 30_000,
  });
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="font-semibold flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-brand-500" /> Petugas follow-up
              </h2>
              <p className="text-xs text-neutral-500">
                {tamu.namaLengkap} · nama petugas terlihat oleh jemaat yang mengundang di aplikasi
              </p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          {tamu.followupBy ? (
            <div className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2 mb-3 text-sm">
              <span>
                Saat ini: <b>{tamu.followupBy.namaLengkap}</b>
              </span>
              <button onClick={() => onSave(null)} disabled={saving} className="text-xs text-red-600 hover:underline">
                Lepas
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama / no HP / kode jemaat"
              className="flex-1 py-2 outline-none text-sm"
            />
          </div>
          <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-neutral-100">
            {dq.length < 2 ? (
              <p className="text-xs text-neutral-400 px-1 py-3">Ketik minimal 2 huruf.</p>
            ) : res.isLoading ? (
              <div className="py-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
              </div>
            ) : (res.data ?? []).filter((j) => j.id !== tamu.id).length === 0 ? (
              <p className="text-xs text-neutral-400 px-1 py-3">Tidak ditemukan.</p>
            ) : (
              (res.data ?? [])
                .filter((j) => j.id !== tamu.id)
                .map((j) => (
                  <button
                    key={j.id}
                    onClick={() => onSave(j.id)}
                    disabled={saving}
                    className="w-full text-left px-2 py-2.5 hover:bg-brand-50 rounded flex items-center justify-between gap-2"
                  >
                    <span className="text-sm font-medium text-neutral-900">{j.namaLengkap}</span>
                    <span className="text-[11px] text-neutral-500">
                      {[j.kode, j.cabang?.nama].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ))
            )}
          </div>
          <p className="text-[11px] text-neutral-500 mt-3">
            Menugaskan petugas otomatis mengubah status menjadi <i>Sedang di-follow-up ECC</i> (kecuali tamu sudah terdaftar).
          </p>
        </div>
      </div>
    </>
  );
}
