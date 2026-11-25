'use client';

/**
 * People → Konseling (2026-12). Antrian permintaan konseling dari app,
 * tugaskan konselor (anggota pelayanan yang dikonfigurasi), dan pengaturan.
 * Isi konseling = data sensitif: hanya Role Access menu Konseling & konselor.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CalendarClock, HeartHandshake, Loader2, Lock, Mail, Phone, Plus, Search, Settings2, Trash2, UserCheck, X } from 'lucide-react';
import { KONSELING_STATUS_LABEL } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';

type Person = { id: string; namaLengkap: string; fotoUrl: string | null; jenisKelamin: 'L' | 'P' | null } | null;
type Item = {
  id: string;
  jemaatId: string;
  pokokMasalah: string;
  harapan: string;
  jadwalUsulan: string | null;
  catatanJadwal: string | null;
  preferensiGender: 'ANY' | 'SAME';
  kontakNoHp: string | null;
  kontakEmail: string | null;
  kontakDisetujuiAt: string;
  status: keyof typeof KONSELING_STATUS_LABEL;
  konselorId: string | null;
  assignedAt: string | null;
  jadwalFinal: string | null;
  catatanKonselor: string | null;
  selesaiAt: string | null;
  dibatalkanAt: string | null;
  dibatalkanOleh: string | null;
  alasanBatal: string | null;
  createdAt: string;
  jemaat: Person;
  konselor: Person;
  cabang: string | null;
};

const BADGE: Record<string, string> = {
  BARU: 'bg-amber-50 text-amber-700',
  DITUGASKAN: 'bg-sky-50 text-sky-700',
  DIJADWALKAN: 'bg-violet-50 text-violet-700',
  SELESAI: 'bg-emerald-50 text-emerald-700',
  DIBATALKAN: 'bg-neutral-100 text-neutral-500',
};
const FILTERS = [
  { key: 'AKTIF', label: 'Aktif' },
  { key: 'BARU', label: 'Menunggu konselor' },
  { key: 'DITUGASKAN', label: 'Ditugaskan' },
  { key: 'DIJADWALKAN', label: 'Terjadwal' },
  { key: 'SELESAI', label: 'Selesai' },
  { key: 'DIBATALKAN', label: 'Dibatalkan' },
  { key: '', label: 'Semua' },
];
const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB' : '—';
const errMsg = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Gagal';

export default function KonselingPage() {
  const [tab, setTab] = useState<'antrian' | 'pengaturan'>('antrian');
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <HeartHandshake className="w-6 h-6 text-brand-500" /> Konseling
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">Permintaan konseling dari Els App. Tugaskan konselor dari pelayanan konselor; isi bersifat rahasia.</p>
        </div>
      </div>
      <div className="flex gap-1 border-b border-neutral-200 mb-4">
        {(
          [
            ['antrian', 'Permintaan'],
            ['pengaturan', 'Pengaturan konselor'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-brand-500 text-brand-700' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'antrian' ? <Antrian onSetup={() => setTab('pengaturan')} /> : <Pengaturan />}
    </div>
  );
}

function Antrian({ onSetup }: { onSetup: () => void }) {
  const [status, setStatus] = useState('AKTIF');
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['konseling', status, dq],
    queryFn: async () =>
      (await apiClient.get<{ data: Item[]; meta: { counts: Record<string, number>; configured: boolean } }>('/admin/konseling', { params: { status: status || undefined, q: dq || undefined } })).data,
  });
  const rows = list.data?.data ?? [];
  const counts = list.data?.meta.counts ?? {};
  return (
    <div className="space-y-3">
      {list.data && !list.data.meta.configured ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">Belum ada pelayanan konselor. Atur dulu supaya permintaan bisa ditugaskan.</span>
          <button onClick={onSetup} className="font-semibold underline">
            Atur sekarang
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-semibold ${status === f.key ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
            >
              {f.label}
              {f.key && f.key !== 'AKTIF' && counts[f.key] ? ` (${counts[f.key]})` : ''}
              {f.key === 'AKTIF' ? ` (${(counts.BARU ?? 0) + (counts.DITUGASKAN ?? 0) + (counts.DIJADWALKAN ?? 0)})` : ''}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 px-3 h-9 border border-neutral-300 rounded-lg bg-white">
          <Search className="w-4 h-4 text-neutral-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama jemaat" className="text-sm outline-none w-40" />
        </label>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {list.isLoading ? (
          <div className="py-14 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-14 text-center text-sm text-neutral-500">Tidak ada permintaan konseling.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Jemaat</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                  <th className="text-left font-medium px-4 py-2">Konselor</th>
                  <th className="text-left font-medium px-4 py-2">Jadwal</th>
                  <th className="text-left font-medium px-4 py-2">Masuk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r.id)} className="hover:bg-brand-50/40 cursor-pointer">
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-neutral-900">{r.jemaat?.namaLengkap ?? '—'}</div>
                      <div className="text-[11px] text-neutral-500">
                        {[r.cabang, r.jemaat?.jenisKelamin === 'L' ? 'Laki-laki' : r.jemaat?.jenisKelamin === 'P' ? 'Perempuan' : null, r.preferensiGender === 'SAME' ? 'minta konselor sesama jenis' : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${BADGE[r.status]}`}>{KONSELING_STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700">{r.konselor?.namaLengkap ?? <span className="text-amber-700 text-xs font-semibold">Belum ditugaskan</span>}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-600">{r.jadwalFinal ? fmt(r.jadwalFinal) : r.jadwalUsulan ? `Usulan: ${fmt(r.jadwalUsulan)}` : '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-500 whitespace-nowrap">{fmt(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open ? <Detail id={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

type Opt = { id: string; namaLengkap: string; jenisKelamin: 'L' | 'P' | null; cabang: string | null; sameCabang: boolean; sameGender: boolean; pelayanan: string[]; aktif: number };

function Detail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const det = useQuery({ queryKey: ['konseling', 'detail', id], queryFn: async () => (await apiClient.get<{ data: Item }>(`/admin/konseling/${id}`)).data.data });
  const [all, setAll] = useState(false);
  const opts = useQuery({
    queryKey: ['konseling', 'opts', id, all],
    queryFn: async () => (await apiClient.get<{ data: Opt[]; meta: { configured: boolean } }>('/admin/konseling/konselor-options', { params: { requestId: id, all: all ? '1' : undefined } })).data,
  });
  const [pick, setPick] = useState('');
  const [alasan, setAlasan] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const done = () => {
    qc.invalidateQueries({ queryKey: ['konseling'] });
  };
  const assign = useMutation({
    mutationFn: async () => apiClient.patch(`/admin/konseling/${id}/assign`, { konselorId: pick }),
    onSuccess: () => {
      toast.success('Konselor ditugaskan — jemaat & konselor diberi tahu');
      setPick('');
      done();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const cancel = useMutation({
    mutationFn: async () => apiClient.post(`/admin/konseling/${id}/cancel`, { alasan: alasan || null }),
    onSuccess: () => {
      toast.success('Permintaan dibatalkan');
      setCancelOpen(false);
      done();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const d = det.data;
  const open = d && ['BARU', 'DITUGASKAN', 'DIJADWALKAN'].includes(d.status);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center gap-2 z-10">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-neutral-900 truncate">{d?.jemaat?.namaLengkap ?? 'Memuat…'}</div>
            {d ? <div className="text-xs text-neutral-500">{d.cabang ?? ''} · masuk {fmt(d.createdAt)}</div> : null}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        {!d ? (
          <div className="py-16 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : (
          <div className="p-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${BADGE[d.status]}`}>{KONSELING_STATUS_LABEL[d.status]}</span>
              {d.jemaat ? (
                <Link href={`/dashboard/jemaat/${d.jemaat.id}`} className="text-xs text-brand-600 hover:underline">
                  Profil jemaat
                </Link>
              ) : null}
              <span className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> Rahasia — hanya admin Konseling & konselor
              </span>
            </div>
            <Section title="Pokok masalah">{d.pokokMasalah}</Section>
            <Section title="Harapan dari konseling">{d.harapan}</Section>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Section title="Usulan jadwal">
                {d.jadwalUsulan ? fmt(d.jadwalUsulan) : '—'}
                {d.catatanJadwal ? <div className="text-xs text-neutral-500 mt-1">{d.catatanJadwal}</div> : null}
              </Section>
              <Section title="Preferensi konselor">{d.preferensiGender === 'SAME' ? 'Sesama jenis kelamin' : 'Bebas'}</Section>
            </div>
            <Section title="Kontak (disetujui dibagikan ke konselor)">
              <div className="flex flex-wrap gap-3 text-sm">
                {d.kontakNoHp ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-neutral-400" /> {d.kontakNoHp}
                  </span>
                ) : null}
                {d.kontakEmail ? (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-neutral-400" /> {d.kontakEmail}
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-neutral-400 mt-1">Disetujui {fmt(d.kontakDisetujuiAt)}</div>
            </Section>
            {d.konselor ? (
              <Section title="Konselor">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600" /> {d.konselor.namaLengkap}
                  <span className="text-xs text-neutral-500">· ditugaskan {fmt(d.assignedAt)}</span>
                </div>
                {d.jadwalFinal ? (
                  <div className="mt-1 inline-flex items-center gap-1 text-violet-700">
                    <CalendarClock className="w-4 h-4" /> {fmt(d.jadwalFinal)}
                  </div>
                ) : null}
                {d.catatanKonselor ? <div className="text-xs text-neutral-600 mt-1 whitespace-pre-wrap">Catatan konselor: {d.catatanKonselor}</div> : null}
              </Section>
            ) : null}
            {d.status === 'DIBATALKAN' ? (
              <div className="rounded-lg bg-neutral-100 p-3 text-xs text-neutral-700">
                Dibatalkan {d.dibatalkanOleh === 'JEMAAT' ? 'oleh jemaat' : 'oleh admin'} {fmt(d.dibatalkanAt)}
                {d.alasanBatal ? ` — ${d.alasanBatal}` : ''}
              </div>
            ) : null}

            {open ? (
              <div className="border-t border-neutral-100 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-neutral-500">{d.konselor ? 'Ganti konselor' : 'Tugaskan konselor'}</div>
                  {d.preferensiGender === 'SAME' ? (
                    <label className="text-[11px] text-neutral-500 flex items-center gap-1">
                      <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-brand-500" /> Tampilkan semua jenis kelamin
                    </label>
                  ) : null}
                </div>
                {opts.data && !opts.data.meta.configured ? (
                  <p className="text-xs text-amber-700">Belum ada pelayanan konselor — atur di tab Pengaturan konselor.</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                    {(opts.data?.data ?? []).map((o) => (
                      <label key={o.id} className={`flex items-start gap-2 px-3 py-2 cursor-pointer ${pick === o.id ? 'bg-brand-50' : 'hover:bg-neutral-50'}`}>
                        <input type="radio" name="konselor" checked={pick === o.id} onChange={() => setPick(o.id)} className="mt-1 accent-brand-500" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-neutral-900">
                            {o.namaLengkap}
                            {o.id === d.konselorId ? <span className="text-[10px] text-emerald-700"> · saat ini</span> : null}
                          </div>
                          <div className="text-[11px] text-neutral-500">
                            {[o.cabang, o.jenisKelamin === 'L' ? 'L' : o.jenisKelamin === 'P' ? 'P' : null, o.pelayanan.join(', ')].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {o.sameCabang ? <div className="text-[10px] text-emerald-700 font-semibold">Satu cabang</div> : null}
                          <div className="text-[10px] text-neutral-500">{o.aktif} aktif</div>
                        </div>
                      </label>
                    ))}
                    {opts.data && !opts.data.data.length ? <div className="px-3 py-4 text-xs text-neutral-500">Tidak ada konselor yang sesuai.</div> : null}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 justify-between">
                  <button onClick={() => setCancelOpen(true)} className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50">
                    Batalkan permintaan
                  </button>
                  <button
                    disabled={!pick || pick === d.konselorId || assign.isPending}
                    onClick={() => assign.mutate()}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {assign.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />} Tugaskan
                  </button>
                </div>
                {cancelOpen ? (
                  <div className="rounded-lg bg-neutral-50 p-3 space-y-2">
                    <textarea value={alasan} onChange={(e) => setAlasan(e.target.value)} rows={2} placeholder="Alasan (dikirim ke jemaat, opsional)" className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm" />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setCancelOpen(false)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-neutral-100">
                        Tidak
                      </button>
                      <button onClick={() => cancel.mutate()} disabled={cancel.isPending} className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50">
                        Batalkan
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-neutral-500 mb-1">{title}</div>
      <div className="text-neutral-900 whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}

type MinOpt = { id: string; nama: string; roles: { id: string; nama: string }[] };
type Cfg = { pelayananId: string; pelayananRoleId: string | null; pelayanan?: string; peran?: string | null };

function Pengaturan() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ['konseling', 'config'], queryFn: async () => (await apiClient.get<{ data: { ministries: Cfg[]; konselorCount: number } }>('/admin/konseling/config')).data.data });
  const opts = useQuery({ queryKey: ['konseling', 'ministry-options'], queryFn: async () => (await apiClient.get<{ data: MinOpt[] }>('/admin/konseling/ministry-options')).data.data });
  const [draft, setDraft] = useState<Cfg[] | null>(null);
  const items = draft ?? cfg.data?.ministries ?? [];
  const [pel, setPel] = useState('');
  const [role, setRole] = useState('');
  const pm = useMemo(() => new Map((opts.data ?? []).map((p) => [p.id, p])), [opts.data]);
  const save = useMutation({
    mutationFn: async () => apiClient.put('/admin/konseling/config', { ministries: items.map((i) => ({ pelayananId: i.pelayananId, pelayananRoleId: i.pelayananRoleId })) }),
    onSuccess: () => {
      toast.success('Pengaturan konselor disimpan');
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['konseling'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="max-w-2xl bg-white border border-neutral-200 rounded-xl p-4 space-y-4">
      <div className="flex items-start gap-2">
        <Settings2 className="w-5 h-5 text-brand-500 mt-0.5" />
        <div>
          <h2 className="font-semibold text-neutral-900">Konselor diambil dari pelayanan</h2>
          <p className="text-sm text-neutral-500">
            Anggota aktif pelayanan (dan peran, bila dipilih) di bawah ini bisa ditugaskan sebagai konselor dan melihat tab <b>Ditugaskan ke saya</b> di menu Konseling app.
          </p>
          {cfg.data ? <p className="text-xs text-emerald-700 mt-1">{cfg.data.konselorCount} konselor saat ini.</p> : null}
        </div>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? <p className="text-sm text-neutral-500">Belum ada pelayanan konselor.</p> : null}
        {items.map((i, idx) => (
          <div key={`${i.pelayananId}:${i.pelayananRoleId ?? ''}`} className="flex items-center gap-2 border border-neutral-200 rounded-lg px-3 py-2">
            <HeartHandshake className="w-4 h-4 text-brand-500" />
            <span className="flex-1 text-sm">
              <b>{i.pelayanan ?? pm.get(i.pelayananId)?.nama ?? 'Pelayanan'}</b> ·{' '}
              {i.pelayananRoleId ? i.peran ?? pm.get(i.pelayananId)?.roles.find((r) => r.id === i.pelayananRoleId)?.nama ?? 'Peran' : 'Semua peran'}
            </span>
            <button onClick={() => setDraft(items.filter((_, j) => j !== idx))} className="p-1 text-neutral-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <select value={pel} onChange={(e) => { setPel(e.target.value); setRole(''); }} className="flex-1 min-w-[180px] px-2 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white">
          <option value="">Pilih pelayanan…</option>
          {(opts.data ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} disabled={!pel} className="flex-1 min-w-[160px] px-2 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white disabled:opacity-50">
          <option value="">Semua peran</option>
          {(pm.get(pel)?.roles ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.nama}
            </option>
          ))}
        </select>
        <button
          disabled={!pel}
          onClick={() => {
            setDraft([...items, { pelayananId: pel, pelayananRoleId: role || null }]);
            setPel('');
            setRole('');
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-brand-300 text-brand-700 text-sm font-semibold disabled:opacity-40"
        >
          <Plus className="w-4 h-4" /> Tambah
        </button>
      </div>
      <div className="flex justify-end">
        <button
          disabled={!draft || save.isPending}
          onClick={() => save.mutate()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Simpan
        </button>
      </div>
    </div>
  );
}
