'use client';

/**
 * Buat / ubah Announcement (id = "new" untuk baru) — dan laporan kirim setelah terkirim.
 * Urutan form: Banner → Judul & isi (Markdown) → Tombol link → Penerima → Kanal → Waktu kirim.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  BellRing,
  CalendarClock,
  Crop,
  ExternalLink,
  ImagePlus,
  Info,
  Loader2,
  Mail,
  MessageCircle,
  Palette,
  Plus,
  Send,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { resolveMediaUrl } from '@/lib/media-url';
import { useDebounce } from '@/lib/use-debounce';
import { CoverCropper } from '@/components/worship/cover-cropper';
import { MarkdownEditor } from '@/components/announcement/markdown-editor';
import { ChipSelect, useJemaatSearch, useTargets } from '@/components/announcement/target-picker';
import {
  AnnouncementStatusBadge,
  fmtDateTime,
  type AnnouncementChannel,
  type AnnouncementItem,
  type AnnouncementLink,
} from '@/components/announcement/types';

interface Form {
  judul: string;
  isi: string;
  links: AnnouncementLink[];
  audienceMode: 'ALL' | 'FILTER';
  combine: 'OR' | 'AND';
  cabangIds: string[];
  areaIds: string[];
  homecellIds: string[];
  jemaatIds: string[];
  channels: AnnouncementChannel[];
  waProvider: 'auto' | 'fonnte' | 'starsender';
}
const EMPTY: Form = {
  judul: '',
  isi: '',
  links: [],
  audienceMode: 'ALL',
  combine: 'OR',
  cabangIds: [],
  areaIds: [],
  homecellIds: [],
  jemaatIds: [],
  channels: ['IN_APP'],
  waProvider: 'auto',
};
interface Preview {
  total: number;
  withWa: number;
  withEmail: number;
  waDelaySeconds: number;
  sample: { id: string; nama: string; kode: string | null; cabang: string | null; hasWa: boolean; hasEmail: boolean }[];
}

const errMsg = (e: any, d: string) => e?.response?.data?.error?.message ?? d;
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
function durationLabel(sec: number) {
  if (sec < 60) return `${sec} detik`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} menit`;
  return `${Math.floor(m / 60)} jam ${m % 60} menit`;
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-neutral-900">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-300 overflow-hidden">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-xs font-semibold ${value === v ? 'bg-brand-500 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'} disabled:opacity-60`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function AnnouncementEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(params.id === 'new' ? null : params.id);
  const [f, setF] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(params.id === 'new');
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60_000)));
  const [confirm, setConfirm] = useState(false);
  const [showSample, setShowSample] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const names = useRef(new Map<string, string>()).current;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  // ---- muat data
  const detail = useQuery({
    queryKey: ['announcement', id],
    enabled: !!id,
    queryFn: async () => (await apiClient.get<{ data: AnnouncementItem }>(`/admin/announcement/${id}`)).data.data,
    refetchInterval: (q) => (q.state.data?.status === 'SENDING' ? 10_000 : false),
  });
  const a = detail.data;
  useEffect(() => {
    if (!a || loaded) return;
    setF({
      judul: a.judul,
      isi: a.isi,
      links: a.links,
      audienceMode: a.audienceMode,
      combine: a.combine,
      cabangIds: a.cabangIds,
      areaIds: a.areaIds,
      homecellIds: a.homecellIds,
      jemaatIds: a.jemaatIds,
      channels: a.channels,
      waProvider: a.waProvider,
    });
    setBannerUrl(a.bannerUrl);
    if (a.scheduledAt && a.status === 'SCHEDULED') {
      setSendMode('schedule');
      setWhen(toLocalInput(new Date(a.scheduledAt)));
    }
    if (a.jemaatIds.length) {
      apiClient
        .post<{ data: { jemaat: { id: string; nama: string }[] } }>('/admin/announcement/target-names', { jemaatIds: a.jemaatIds })
        .then((r) => r.data.data.jemaat.forEach((j) => names.set(j.id, j.nama)))
        .catch(() => undefined);
    }
    setLoaded(true);
  }, [a, loaded, names]);

  const readOnly = !!a && a.status !== 'DRAFT' && a.status !== 'SCHEDULED';

  // ---- pilihan penerima
  const targets = useTargets();
  const jemaatSearch = useJemaatSearch();
  const cabangOpts = useMemo(() => (targets.data?.cabang ?? []).map((c) => ({ id: c.id, nama: c.nama })), [targets.data]);
  const areaOpts = useMemo(() => (targets.data?.areas ?? []).map((x) => ({ id: x.id, nama: x.nama, sub: x.cabang })), [targets.data]);
  const hcOpts = useMemo(
    () => (targets.data?.homecells ?? []).map((x) => ({ id: x.id, nama: x.nama, sub: [x.area, x.cabang].filter(Boolean).join(' · ') })),
    [targets.data],
  );

  // ---- pratinjau jumlah penerima
  const audience = { audienceMode: f.audienceMode, combine: f.combine, cabangIds: f.cabangIds, areaIds: f.areaIds, homecellIds: f.homecellIds, jemaatIds: f.jemaatIds };
  const dAudience = useDebounce(JSON.stringify(audience), 350);
  const preview = useQuery({
    queryKey: ['announcement-preview', dAudience],
    enabled: loaded,
    queryFn: async () => (await apiClient.post<{ data: Preview }>('/admin/announcement/preview', JSON.parse(dAudience))).data.data,
  });

  // ---- simpan
  const payload = () => ({ ...f, links: f.links.filter((l) => l.label.trim() && l.url.trim()) });
  function validate(): string | null {
    if (f.judul.trim().length < 3) return 'Judul minimal 3 karakter.';
    if (!f.isi.trim()) return 'Isi pesan wajib diisi.';
    if (!f.channels.length) return 'Pilih minimal satu kanal.';
    for (const l of f.links) if ((l.label.trim() || l.url.trim()) && (!l.label.trim() || !/^https?:\/\/\S+\.\S+/i.test(l.url.trim()))) return 'Tombol link perlu label dan URL yang diawali https://';
    return null;
  }
  async function save(): Promise<string | null> {
    const err = validate();
    if (err) {
      toast.error(err);
      return null;
    }
    try {
      if (id) {
        await apiClient.patch(`/admin/announcement/${id}`, payload());
        return id;
      }
      const res = await apiClient.post<{ data: AnnouncementItem }>('/admin/announcement', payload());
      const newId = res.data.data.id;
      setId(newId);
      window.history.replaceState(null, '', `/dashboard/announcement/${newId}`);
      return newId;
    } catch (e) {
      toast.error(errMsg(e, 'Gagal menyimpan'));
      return null;
    }
  }
  const saveDraft = useMutation({
    mutationFn: save,
    onSuccess: (r) => {
      if (!r) return;
      toast.success('Draft disimpan');
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['announcement', r] });
    },
  });

  const send = useMutation({
    mutationFn: async () => {
      const saved = await save();
      if (!saved) throw new Error('__handled');
      const body = sendMode === 'now' ? { mode: 'now' } : { mode: 'schedule', scheduledAt: new Date(when).toISOString() };
      return apiClient.post(`/admin/announcement/${saved}/send`, body);
    },
    onSuccess: () => {
      toast.success(sendMode === 'now' ? 'Announcement dikirim' : 'Announcement dijadwalkan');
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ['announcements'] });
      router.push('/dashboard/announcement');
    },
    onError: (e: any) => {
      if (e?.message !== '__handled') toast.error(errMsg(e, 'Gagal mengirim'));
      setConfirm(false);
    },
  });

  // ---- banner
  async function uploadBanner(blob: Blob) {
    const target = id ?? (await save());
    if (!target) return;
    const fd = new FormData();
    fd.append('file', blob, 'banner.jpg');
    try {
      const res = await apiClient.post<{ data: AnnouncementItem }>(`/admin/announcement/${target}/banner`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBannerUrl(res.data.data.bannerUrl);
      setCropFile(null);
      toast.success('Banner disimpan');
    } catch (e) {
      toast.error(errMsg(e, 'Gagal mengunggah banner'));
    }
  }
  async function removeBanner() {
    if (!id) return setBannerUrl(null);
    try {
      await apiClient.delete(`/admin/announcement/${id}/banner`);
      setBannerUrl(null);
    } catch (e) {
      toast.error(errMsg(e, 'Gagal menghapus banner'));
    }
  }
  function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error('Ukuran gambar maksimal 5 MB.');
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) return toast.error('Format harus JPG, PNG, atau WEBP.');
    if (!id && validate()) return toast.error('Isi judul dan pesan dulu sebelum menambah banner (draft akan disimpan otomatis).');
    setCropFile(file);
  }

  const p = preview.data;
  const hasWa = f.channels.includes('WHATSAPP');
  const toggleChannel = (c: AnnouncementChannel) =>
    set('channels', f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c]);

  if (id && !loaded) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/announcement" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-3">
        <ArrowLeft className="w-4 h-4" /> Announcement
      </Link>
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <BellRing className="w-6 h-6 text-brand-500" /> {id ? (readOnly ? 'Detail announcement' : 'Ubah announcement') : 'Announcement baru'}
        </h1>
        {a ? <AnnouncementStatusBadge a={a} /> : null}
      </div>

      {readOnly && a ? <Report a={a} /> : null}

      {/* Banner */}
      <Card title="Banner gambar (opsional)">
        <div className="grid sm:grid-cols-[260px_minmax(0,1fr)] gap-4 items-start">
          <div>
            {bannerUrl ? (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveMediaUrl(bannerUrl)} alt="" className="w-full h-full object-cover" />
                {!readOnly ? (
                  <div className="absolute top-2 right-2 flex gap-1.5">
                    <button type="button" onClick={() => fileRef.current?.click()} className="px-2 py-1 rounded-md bg-white/90 text-xs font-semibold">
                      Ganti
                    </button>
                    <button type="button" onClick={removeBanner} className="p-1 rounded-md bg-white/90 text-red-600" aria-label="Hapus banner">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                disabled={readOnly}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickFile(e.dataTransfer.files?.[0]);
                }}
                className="w-full aspect-video rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 flex flex-col items-center justify-center gap-1 text-neutral-500 text-xs hover:border-brand-300 disabled:opacity-60"
              >
                <ImagePlus className="w-6 h-6" />
                Pilih atau tarik gambar
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={(e) => pickFile(e.target.files?.[0] ?? undefined)} />
          </div>
          <ul className="text-xs text-neutral-600 space-y-1.5">
            <li className="flex gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-400" />
              <span>
                Rasio <b>16:9</b> · disarankan <b>1280 × 720 px</b> · JPG, PNG, WEBP · maks <b>5 MB</b>
              </span>
            </li>
            <li className="flex gap-2">
              <Crop className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-400" />
              Setelah dipilih, gambar dipotong ke 16:9 (sama seperti sampul Local Market).
            </li>
            <li className="flex gap-2">
              <Smartphone className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-400" />
              App dan email: tampil di atas pengumuman.
            </li>
            <li className="flex gap-2">
              <MessageCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-400" />
              WhatsApp: tampil sebagai pratinjau link (OG image) dari halaman pengumuman.
            </li>
            <li className="flex gap-2">
              <Palette className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-400" />
              Tanpa gambar: app & email memakai kepala oranye; WhatsApp berupa teks saja.
            </li>
          </ul>
        </div>
      </Card>

      {/* Isi */}
      <Card title="Isi pengumuman">
        <label className="block text-sm font-medium text-neutral-700 mb-1">Judul</label>
        <input
          value={f.judul}
          onChange={(e) => set('judul', e.target.value)}
          disabled={readOnly}
          maxLength={200}
          placeholder="Ibadah Natal 2026 — jadwal dan reservasi"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-neutral-50 mb-4"
        />
        <label className="block text-sm font-medium text-neutral-700 mb-1">Isi pesan</label>
        <MarkdownEditor value={f.isi} onChange={(v) => set('isi', v)} disabled={readOnly} />

        <div className="mt-4">
          <div className="text-sm font-medium text-neutral-700 mb-1">Tombol link (opsional)</div>
          <p className="text-xs text-neutral-500 mb-2">Jadi tombol di app & email; di WhatsApp ditulis "Label: URL" di bawah pesan.</p>
          {f.links.map((l, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input
                value={l.label}
                disabled={readOnly}
                maxLength={60}
                onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                placeholder="Reservasi sekarang"
                className="w-44 px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
              <input
                value={l.url}
                disabled={readOnly}
                onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                placeholder="https://eccchurch.global/ibadah"
                className="flex-1 min-w-0 px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
              {!readOnly ? (
                <button type="button" onClick={() => set('links', f.links.filter((_, j) => j !== i))} className="p-2 rounded-lg hover:bg-red-50 text-neutral-500 hover:text-red-600" aria-label="Hapus tombol">
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          ))}
          {!readOnly && f.links.length < 5 ? (
            <button type="button" onClick={() => set('links', [...f.links, { label: '', url: '' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
              <Plus className="w-3.5 h-3.5" /> Tambah tombol
            </button>
          ) : null}
        </div>
      </Card>

      {/* Penerima */}
      <Card title="Penerima">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <Seg value={f.audienceMode} onChange={(v) => set('audienceMode', v)} disabled={readOnly} options={[['ALL', 'Semua jemaat'], ['FILTER', 'Saring']]} />
          {f.audienceMode === 'FILTER' ? (
            <>
              <span className="text-xs text-neutral-500">Cara gabung:</span>
              <Seg value={f.combine} onChange={(v) => set('combine', v)} disabled={readOnly} options={[['OR', 'Salah satu (OR)'], ['AND', 'Semua (AND)']]} />
            </>
          ) : null}
        </div>
        {f.audienceMode === 'FILTER' ? (
          <div className="border-t border-neutral-100 pt-2">
            <p className="text-xs text-neutral-500 mb-1">
              {f.combine === 'OR'
                ? 'Penerima = siapa pun yang cocok dengan salah satu saringan.'
                : 'Penerima = hanya jemaat yang cocok dengan semua saringan yang diisi.'}
            </p>
            <ChipSelect label="Cabang" options={cabangOpts} selected={f.cabangIds} onChange={(v) => set('cabangIds', v)} disabled={readOnly} placeholder="Pilih cabang" names={names} />
            <ChipSelect label="Area" options={areaOpts} selected={f.areaIds} onChange={(v) => set('areaIds', v)} disabled={readOnly} placeholder="Pilih area" names={names} />
            <ChipSelect label="Homecell" options={hcOpts} selected={f.homecellIds} onChange={(v) => set('homecellIds', v)} disabled={readOnly} placeholder="Pilih homecell" names={names} />
            <ChipSelect
              label="Jemaat"
              options={jemaatSearch.options}
              selected={f.jemaatIds}
              onChange={(v) => set('jemaatIds', v)}
              disabled={readOnly}
              placeholder="Cari nama"
              onSearch={jemaatSearch.setQ}
              loading={jemaatSearch.loading}
              names={names}
            />
          </div>
        ) : null}
        <div className="grid grid-cols-3 gap-2 mt-3">
          {[
            ['Penerima', p?.total],
            ['Punya nomor WA', p?.withWa],
            ['Punya email', p?.withEmail],
          ].map(([label, v]) => (
            <div key={label as string} className="bg-neutral-50 rounded-lg px-3 py-2">
              <div className="text-xs text-neutral-500">{label}</div>
              <div className="text-lg font-bold text-neutral-900">{preview.isFetching && v === undefined ? '…' : (v as number | undefined)?.toLocaleString('id-ID') ?? '—'}</div>
            </div>
          ))}
        </div>
        {p && p.total > 0 ? (
          <div className="mt-2">
            <button type="button" onClick={() => setShowSample((x) => !x)} className="text-xs font-semibold text-brand-600 hover:underline">
              {showSample ? 'Sembunyikan daftar' : `Lihat daftar penerima${p.total > p.sample.length ? ` (${p.sample.length} pertama)` : ''}`}
            </button>
            {showSample ? (
              <div className="mt-2 max-h-64 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100 text-sm">
                {p.sample.map((s) => (
                  <div key={s.id} className="px-3 py-1.5 flex items-center gap-2">
                    <span className="flex-1 truncate">{s.nama}</span>
                    <span className="text-[11px] text-neutral-400">{s.cabang}</span>
                    <MessageCircle className={`w-3.5 h-3.5 ${s.hasWa ? 'text-emerald-500' : 'text-neutral-300'}`} />
                    <Mail className={`w-3.5 h-3.5 ${s.hasEmail ? 'text-emerald-500' : 'text-neutral-300'}`} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : p && f.audienceMode === 'FILTER' ? (
          <p className="text-xs text-amber-700 mt-2">Belum ada penerima yang cocok — tambah atau ubah saringan.</p>
        ) : null}
      </Card>

      {/* Kanal */}
      <Card title="Kanal">
        <div className="grid sm:grid-cols-3 gap-2">
          {(
            [
              ['IN_APP', 'In App', Smartphone, 'Popup + daftar notifikasi'],
              ['WHATSAPP', 'WhatsApp', MessageCircle, 'Dikirim bertahap'],
              ['EMAIL', 'Email', Mail, 'Lewat SendGrid'],
            ] as const
          ).map(([k, label, Icon, sub]) => {
            const on = f.channels.includes(k);
            return (
              <label key={k} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 cursor-pointer ${on ? 'border-brand-400 bg-brand-50/50' : 'border-neutral-200'}`}>
                <input type="checkbox" checked={on} disabled={readOnly} onChange={() => toggleChannel(k)} className="mt-0.5 accent-brand-600" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                    <Icon className="w-4 h-4" /> {label}
                  </span>
                  <span className="block text-[11px] text-neutral-500">{sub}</span>
                </span>
              </label>
            );
          })}
        </div>
        {hasWa ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-500">Provider WA</span>
              <select
                value={f.waProvider}
                disabled={readOnly}
                onChange={(e) => set('waProvider', e.target.value as Form['waProvider'])}
                className="px-2 py-1.5 border border-neutral-300 rounded-lg text-sm"
              >
                <option value="auto">Otomatis (sesuai Gateway & OTP)</option>
                <option value="fonnte">Fonnte</option>
                <option value="starsender">StarSender</option>
              </select>
            </div>
            <p className="text-xs text-neutral-500 flex gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Dikirim bertahap kira-kira 1 pesan tiap {p?.waDelaySeconds ?? 4} detik supaya nomor tidak diblokir
              {p?.withWa ? ` — perkiraan selesai ${durationLabel(p.withWa * (p.waDelaySeconds ?? 4))}` : ''}. Resmi.ID tidak bisa dipakai (hanya template OTP).
            </p>
          </div>
        ) : null}
      </Card>

      {/* Waktu kirim + aksi */}
      {!readOnly ? (
        <Card title="Waktu kirim">
          <div className="flex flex-wrap items-center gap-3">
            <Seg value={sendMode} onChange={setSendMode} options={[['now', 'Kirim sekarang'], ['schedule', 'Jadwalkan']]} />
            {sendMode === 'schedule' ? (
              <input
                type="datetime-local"
                value={when}
                min={toLocalInput(new Date())}
                onChange={(e) => setWhen(e.target.value)}
                className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm"
              />
            ) : null}
            {sendMode === 'schedule' ? <span className="text-xs text-neutral-500">Zona waktu perangkat Anda.</span> : null}
          </div>
          <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-neutral-100">
            <button type="button" onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending} className="h-9 px-4 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50">
              {saveDraft.isPending ? 'Menyimpan…' : 'Simpan draft'}
            </button>
            <button
              type="button"
              onClick={() => {
                const err = validate();
                if (err) return toast.error(err);
                if (!p?.total) return toast.error('Belum ada penerima.');
                if (sendMode === 'schedule' && new Date(when).getTime() < Date.now()) return toast.error('Waktu kirim sudah lewat.');
                setConfirm(true);
              }}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
            >
              {sendMode === 'now' ? <Send className="w-4 h-4" /> : <CalendarClock className="w-4 h-4" />}
              {sendMode === 'now' ? 'Kirim sekarang' : 'Jadwalkan'}
            </button>
          </div>
        </Card>
      ) : null}

      {cropFile ? (
        <CoverCropper
          file={cropFile}
          variant="banner"
          title="Atur banner 16:9"
          saveLabel="Simpan banner"
          onCancel={() => setCropFile(null)}
          onDone={uploadBanner}
        />
      ) : null}

      {confirm && p ? (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => !send.isPending && setConfirm(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto p-6">
              <h2 className="font-semibold text-neutral-900 text-lg mb-1">{sendMode === 'now' ? 'Kirim announcement sekarang?' : 'Jadwalkan announcement?'}</h2>
              <p className="text-sm text-neutral-600 mb-4">“{f.judul}”</p>
              <ul className="text-sm space-y-1.5 mb-5">
                <li>
                  <b>{p.total.toLocaleString('id-ID')}</b> penerima
                </li>
                {f.channels.includes('IN_APP') ? <li>• In App: popup & daftar notifikasi ({p.total.toLocaleString('id-ID')})</li> : null}
                {f.channels.includes('WHATSAPP') ? (
                  <li>
                    • WhatsApp: {p.withWa.toLocaleString('id-ID')} nomor, ±{durationLabel(p.withWa * p.waDelaySeconds)}
                  </li>
                ) : null}
                {f.channels.includes('EMAIL') ? <li>• Email: {p.withEmail.toLocaleString('id-ID')} alamat</li> : null}
                {sendMode === 'schedule' ? <li>• Dikirim: {fmtDateTime(new Date(when).toISOString())}</li> : null}
              </ul>
              <div className="flex justify-end gap-2">
                <button onClick={() => setConfirm(false)} disabled={send.isPending} className="h-9 px-4 rounded-lg text-sm hover:bg-neutral-100">
                  Batal
                </button>
                <button
                  onClick={() => send.mutate()}
                  disabled={send.isPending}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {sendMode === 'now' ? 'Ya, kirim' : 'Ya, jadwalkan'}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Laporan kirim + daftar penerima (setelah dikirim). */
function Report({ a }: { a: AnnouncementItem }) {
  const [channel, setChannel] = useState<'IN_APP' | 'WHATSAPP' | 'EMAIL'>(a.channels.includes('WHATSAPP') ? 'WHATSAPP' : a.channels[0] ?? 'IN_APP');
  const [status, setStatus] = useState('');
  const list = useQuery({
    queryKey: ['announcement-recipients', a.id, channel, status],
    queryFn: async () =>
      (
        await apiClient.get<{ data: any[]; meta: { total: number } }>(`/admin/announcement/${a.id}/recipients`, {
          params: { channel, status: status || undefined, limit: 200 },
        })
      ).data,
    refetchInterval: a.status === 'SENDING' ? 10_000 : false,
  });
  const ch = new Set(a.channels);
  const stat = (label: string, v: number, tone = '') => (
    <div className="bg-neutral-50 rounded-lg px-3 py-2">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`text-lg font-bold ${tone}`}>{v.toLocaleString('id-ID')}</div>
    </div>
  );
  return (
    <section className="bg-white border border-neutral-200 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-neutral-900">Laporan kirim</h2>
        <a href={a.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
          Halaman publik <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {stat('Penerima', a.recipientCount)}
        {ch.has('IN_APP') ? stat('Dibaca di app', a.stats.read) : null}
        {ch.has('WHATSAPP') ? stat('WA terkirim', a.stats.wa.sent, 'text-emerald-700') : null}
        {ch.has('WHATSAPP') && (a.stats.wa.failed || a.stats.wa.pending) ? stat(a.stats.wa.pending ? 'WA antre' : 'WA gagal', a.stats.wa.pending || a.stats.wa.failed, a.stats.wa.pending ? '' : 'text-red-600') : null}
        {ch.has('EMAIL') ? stat('Email terkirim', a.stats.email.sent, 'text-emerald-700') : null}
        {ch.has('EMAIL') && a.stats.email.failed ? stat('Email gagal', a.stats.email.failed, 'text-red-600') : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {a.channels.map((c) => (
          <button
            key={c}
            onClick={() => {
              setChannel(c);
              setStatus('');
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${channel === c ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-700'}`}
          >
            {c === 'IN_APP' ? 'In App' : c === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
          </button>
        ))}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-auto px-2 py-1 border border-neutral-300 rounded-lg text-xs">
          <option value="">Semua</option>
          {channel === 'IN_APP' ? <option value="READ">Sudah dibaca</option> : null}
          {channel !== 'IN_APP' ? (
            <>
              <option value="SENT">Terkirim</option>
              <option value="FAILED">Gagal</option>
              <option value="PENDING">Antre</option>
              <option value="SKIPPED">Dilewati (tanpa {channel === 'WHATSAPP' ? 'nomor' : 'email'})</option>
            </>
          ) : null}
        </select>
      </div>
      <div className="max-h-80 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100 text-sm">
        {list.isLoading ? (
          <div className="py-6 text-center">
            <Loader2 className="w-4 h-4 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : (list.data?.data ?? []).length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500">Tidak ada data.</div>
        ) : (
          list.data!.data.map((r: any) => {
            const st = channel === 'WHATSAPP' ? r.waStatus : channel === 'EMAIL' ? r.emailStatus : r.readAt ? 'READ' : r.inAppStatus;
            const err = channel === 'WHATSAPP' ? r.waError : channel === 'EMAIL' ? r.emailError : null;
            const tone =
              st === 'SENT' || st === 'READ' ? 'text-emerald-700' : st === 'FAILED' ? 'text-red-600' : st === 'SKIPPED' ? 'text-neutral-400' : 'text-amber-700';
            const label = { SENT: 'Terkirim', READ: 'Dibaca', FAILED: 'Gagal', PENDING: 'Antre', SENDING: 'Mengirim', SKIPPED: 'Dilewati' }[st as string] ?? st;
            return (
              <div key={r.id} className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate">{r.jemaat.nama}</span>
                  <span className="text-[11px] text-neutral-400">{r.jemaat.cabang}</span>
                  <span className={`text-[11px] font-semibold ${tone}`}>{label}</span>
                </div>
                {err ? <div className="text-[11px] text-red-500 truncate">{err}</div> : null}
              </div>
            );
          })
        )}
      </div>
      {list.data && list.data.meta.total > 200 ? <p className="text-[11px] text-neutral-500 mt-1">Menampilkan 200 dari {list.data.meta.total.toLocaleString('id-ID')}.</p> : null}
    </section>
  );
}
