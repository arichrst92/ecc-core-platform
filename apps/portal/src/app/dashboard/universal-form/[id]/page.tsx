'use client';

/**
 * Universal Form — editor (2026-12). `/dashboard/universal-form/new` = form baru.
 * Tab: Susun field · Pengaturan · Disematkan di · Hasil.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, ClipboardList, Eye, Loader2, Lock, Save, X } from 'lucide-react';
import {
  UF_AUTOFILL_LABEL,
  UF_FORM_STATUS,
  UF_FORM_STATUS_LABEL,
  UF_OPTION_TYPES,
  UF_SOURCE_LABEL,
  ufFormInputSchema,
} from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { FieldBuilder } from '@/components/universal-form/builder';
import { ResultsTab } from '@/components/universal-form/results';
import {
  SOURCE_BADGE,
  SOURCE_HREF,
  STATUS_BADGE,
  errMsg,
  fmtWib,
  isoToWibInput,
  newKey,
  wibInputToIso,
  type UfField,
  type UfFormDetail,
} from '@/components/universal-form/types';

type Tab = 'susun' | 'pengaturan' | 'sematan' | 'hasil';
type Settings = {
  judul: string;
  deskripsi: string;
  status: (typeof UF_FORM_STATUS)[number];
  anonim: boolean;
  bukaAt: string | null;
  tutupAt: string | null;
  multiResponse: boolean;
  allowEdit: boolean;
  kuota: string;
  pesanTerimaKasih: string;
};

const EMPTY: Settings = {
  judul: '',
  deskripsi: '',
  status: 'DRAFT',
  anonim: false,
  bukaAt: null,
  tutupAt: null,
  multiResponse: false,
  allowEdit: true,
  kuota: '',
  pesanTerimaKasih: '',
};

export default function Page() {
  return (
    <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-neutral-400" />}>
      <UniversalFormEditor />
    </Suspense>
  );
}

function UniversalFormEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === 'new';
  const sp = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>((sp.get('tab') as Tab) || 'susun');
  const [s, setS] = useState<Settings>(EMPTY);
  const [fields, setFields] = useState<UfField[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const det = useQuery({
    queryKey: ['uf-detail', id],
    enabled: !isNew,
    queryFn: async () => (await apiClient.get<{ data: UfFormDetail }>(`/admin/universal-form/${id}`)).data.data,
  });
  useEffect(() => {
    const d = det.data;
    if (!d || loaded) return;
    setS({
      judul: d.judul,
      deskripsi: d.deskripsi ?? '',
      status: d.status,
      anonim: d.anonim,
      bukaAt: d.bukaAt,
      tutupAt: d.tutupAt,
      multiResponse: d.multiResponse,
      allowEdit: d.allowEdit,
      kuota: d.kuota ? String(d.kuota) : '',
      pesanTerimaKasih: d.pesanTerimaKasih ?? '',
    });
    setFields(
      d.fields
        .filter((f) => !f.hidden || f.hasAnswers)
        .map((f) => ({
          ...f,
          key: f.id ?? newKey(),
          opsi: Array.isArray(f.opsi) ? f.opsi : [],
          validasi: (f.validasi ?? {}) as UfField['validasi'],
        })),
    );
    setLoaded(true);
  }, [det.data, loaded]);

  const hasResponses = (det.data?.responseCount ?? 0) > 0;

  async function save() {
    const payload = {
      judul: s.judul,
      deskripsi: s.deskripsi || null,
      status: s.status,
      anonim: s.anonim,
      bukaAt: s.bukaAt,
      tutupAt: s.tutupAt,
      multiResponse: s.multiResponse,
      allowEdit: s.allowEdit,
      kuota: s.kuota ? Number(s.kuota) : null,
      pesanTerimaKasih: s.pesanTerimaKasih || null,
      fields: fields.map(({ key: _k, hasAnswers: _h, ...f }) => f),
    };
    const chk = ufFormInputSchema.safeParse(payload);
    if (!chk.success) {
      const iss = chk.error.issues[0]!;
      const fi = iss.path[0] === 'fields' ? Number(iss.path[1]) : -1;
      const where = fi >= 0 ? `Field ${fi + 1} (${fields[fi]?.label || 'tanpa label'}): ` : '';
      toast.error(where + iss.message);
      if (fi >= 0) setTab('susun');
      else setTab(iss.path[0] === 'judul' || iss.path[0] === 'tutupAt' ? 'pengaturan' : tab);
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const r = await apiClient.post<{ data: { id: string } }>('/admin/universal-form', payload);
        toast.success('Form dibuat');
        qc.invalidateQueries({ queryKey: ['uf-list'] });
        router.replace(`/dashboard/universal-form/${r.data.data.id}`);
      } else {
        await apiClient.put(`/admin/universal-form/${id}`, payload);
        toast.success('Tersimpan');
        setLoaded(false);
        qc.invalidateQueries({ queryKey: ['uf-detail', id] });
        qc.invalidateQueries({ queryKey: ['uf-list'] });
        qc.invalidateQueries({ queryKey: ['uf-options'] });
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  if (!isNew && det.isLoading) return <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />;
  if (!isNew && det.isError) return <p className="text-sm text-red-600">{errMsg(det.error, 'Form tidak ditemukan')}</p>;

  const TABS: { key: Tab; label: string; off?: boolean }[] = [
    { key: 'susun', label: `Susun field (${fields.filter((f) => f.tipe !== 'INFO' && !f.hidden).length})` },
    { key: 'pengaturan', label: 'Pengaturan' },
    { key: 'sematan', label: `Disematkan di (${det.data?.embeds.length ?? 0})`, off: isNew },
    { key: 'hasil', label: `Hasil (${det.data?.responseCount ?? 0})`, off: isNew },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/dashboard/universal-form" className="p-2 rounded-lg hover:bg-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0 basis-56">
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2 truncate">
            <ClipboardList className="w-5 h-5 text-brand-500 shrink-0" />
            <span className="truncate">{s.judul || (isNew ? 'Form baru' : 'Form')}</span>
          </h1>
          <div className="text-xs text-neutral-500 flex flex-wrap gap-2 mt-0.5">
            <span className={`px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[s.status]}`}>{UF_FORM_STATUS_LABEL[s.status]}</span>
            {s.anonim ? <span className="text-violet-700">Anonim</span> : null}
            {det.data ? <span>{det.data.embeds.length} konten · {det.data.responseCount} respons</span> : null}
          </div>
        </div>
        <button onClick={() => setPreview(true)} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50">
          <Eye className="w-4 h-4" /> Pratinjau
        </button>
        {tab !== 'hasil' ? (
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
          </button>
        ) : null}
      </div>

      <div className="flex gap-1 border-b border-neutral-200 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            disabled={t.off}
            onClick={() => setTab(t.key)}
            title={t.off ? 'Simpan form dulu' : undefined}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key ? 'border-brand-500 text-brand-700' : 'border-transparent text-neutral-500 hover:text-neutral-800'
            } disabled:opacity-40`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'susun' ? <FieldBuilder fields={fields} onChange={setFields} anonim={s.anonim} hasResponses={hasResponses} /> : null}
      {tab === 'pengaturan' ? <SettingsTab s={s} set={(p) => setS((x) => ({ ...x, ...p }))} lockAnon={hasResponses} /> : null}
      {tab === 'sematan' && det.data ? <EmbedsTab d={det.data} /> : null}
      {tab === 'hasil' && !isNew ? (
        <ResultsTab formId={id} initialSource={{ sourceType: sp.get('sourceType') ?? undefined, sourceId: sp.get('sourceId') ?? undefined }} />
      ) : null}

      {preview ? <PreviewModal s={s} fields={fields} onClose={() => setPreview(false)} /> : null}
    </div>
  );
}

const inputCls = 'mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500';

function SettingsTab({ s, set, lockAnon }: { s: Settings; set: (p: Partial<Settings>) => void; lockAnon: boolean }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Judul form</span>
          <input value={s.judul} onChange={(e) => set({ judul: e.target.value })} maxLength={200} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Deskripsi (opsional)</span>
          <textarea rows={3} value={s.deskripsi} onChange={(e) => set({ deskripsi: e.target.value })} maxLength={5000} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Status</span>
          <select value={s.status} onChange={(e) => set({ status: e.target.value as Settings['status'] })} className={inputCls}>
            {UF_FORM_STATUS.map((x) => (
              <option key={x} value={x}>
                {UF_FORM_STATUS_LABEL[x]}
              </option>
            ))}
          </select>
          <span className="text-xs text-neutral-500">Hanya form <b>Dibuka</b> yang bisa diisi. Arsip = disembunyikan dari daftar & app.</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Pesan terima kasih</span>
          <textarea rows={2} value={s.pesanTerimaKasih} onChange={(e) => set({ pesanTerimaKasih: e.target.value })} placeholder="Terima kasih, data Anda sudah kami terima." maxLength={1000} className={inputCls} />
        </label>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Dibuka mulai (WIB)</span>
            <input type="datetime-local" value={isoToWibInput(s.bukaAt)} onChange={(e) => set({ bukaAt: wibInputToIso(e.target.value) })} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-neutral-700">Ditutup (WIB)</span>
            <input type="datetime-local" value={isoToWibInput(s.tutupAt)} onChange={(e) => set({ tutupAt: wibInputToIso(e.target.value) })} className={inputCls} />
          </label>
        </div>
        <p className="text-xs text-neutral-500 -mt-1">Batas per konten bisa diatur di bagian Formulir pada News / Event / Announcement.</p>
        <label className="block">
          <span className="text-sm font-medium text-neutral-700">Kuota respons (opsional)</span>
          <input type="number" min={1} value={s.kuota} onChange={(e) => set({ kuota: e.target.value })} className={inputCls} />
        </label>
        <Toggle
          label="Anonim"
          desc="Jemaat tetap login, tapi nama tidak terlihat di hasil. Tanpa autofill & tanda tangan."
          checked={s.anonim}
          disabled={lockAnon}
          note={lockAnon ? 'Tidak bisa diubah setelah ada respons.' : undefined}
          onChange={(v) => set({ anonim: v })}
        />
        <Toggle label="Boleh mengubah jawaban" desc="Jemaat bisa mengubah jawaban sampai form ditutup." checked={s.allowEdit} onChange={(v) => set({ allowEdit: v })} />
        <Toggle label="Boleh mengisi berkali-kali" desc="Satu orang bisa mengirim lebih dari satu respons (mis. laporan kegiatan)." checked={s.multiResponse} onChange={(v) => set({ multiResponse: v })} />
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange, disabled, note }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; note?: string }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? 'opacity-60' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-1 w-4 h-4 accent-brand-500" />
      <span>
        <span className="text-sm font-medium text-neutral-800">{label}</span>
        <span className="block text-xs text-neutral-500">{desc}</span>
        {note ? <span className="block text-xs text-amber-700">{note}</span> : null}
      </span>
    </label>
  );
}

function EmbedsTab({ d }: { d: UfFormDetail }) {
  if (!d.embeds.length)
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center text-sm text-neutral-500">
        Form ini belum disematkan. Buka News, Event, atau Announcement → bagian <b>Formulir</b> → pilih form ini.
      </div>
    );
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-neutral-50 text-xs text-neutral-500">
          <tr>
            <th className="text-left font-medium px-4 py-2">Konten</th>
            <th className="text-left font-medium px-4 py-2">Batas pengisian</th>
            <th className="text-left font-medium px-4 py-2">Batal otomatis</th>
            <th className="text-right font-medium px-4 py-2">Respons</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {d.embeds.map((e) => (
            <tr key={e.id}>
              <td className="px-4 py-2">
                <span className={`px-1.5 rounded text-[11px] font-semibold mr-2 ${SOURCE_BADGE[e.sourceType] ?? ''}`}>{UF_SOURCE_LABEL[e.sourceType as keyof typeof UF_SOURCE_LABEL] ?? e.sourceType}</span>
                <Link href={SOURCE_HREF[e.sourceType]?.(e.sourceId) ?? '#'} className="font-medium text-neutral-900 hover:text-brand-600 hover:underline">
                  {e.judul}
                </Link>
              </td>
              <td className="px-4 py-2 text-xs text-neutral-600">{e.batasAt ? fmtWib(e.batasAt) : `Tutup form (${fmtWib(d.tutupAt)})`}</td>
              <td className="px-4 py-2 text-xs">{e.sourceType === 'EVENT' ? (e.autoCancel ? 'Aktif' : 'Tidak') : '—'}</td>
              <td className="px-4 py-2 text-right">
                <Link href={`?tab=hasil&sourceType=${e.sourceType}&sourceId=${e.sourceId}`} className="font-semibold text-brand-700 hover:underline">
                  {e.responseCount}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pratinjau kasar tampilan di HP. */
function PreviewModal({ s, fields, onClose }: { s: Settings; fields: UfField[]; onClose: () => void }) {
  const shown = useMemo(() => fields.filter((f) => !f.hidden), [fields]);
  const auto = shown.filter((f) => f.autofill);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-[360px] max-w-full max-h-[90vh] bg-neutral-900 rounded-[2.2rem] p-2.5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="bg-neutral-50 rounded-[1.8rem] h-[78vh] max-h-[720px] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center gap-2 rounded-t-[1.8rem]">
            <button onClick={onClose}>
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">{s.judul || 'Judul form'}</div>
              <div className="text-[11px] text-neutral-500">Pratinjau</div>
            </div>
          </div>
          <div className="p-3 space-y-3 text-sm">
            {s.deskripsi ? <p className="text-neutral-600 text-xs whitespace-pre-line">{s.deskripsi}</p> : null}
            {s.anonim ? <div className="rounded-xl bg-violet-50 text-violet-800 text-xs p-2.5">Anonim — nama Anda tidak terlihat oleh pengelola form.</div> : null}
            {auto.length ? (
              <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-2.5 text-xs">
                <div className="font-semibold text-neutral-600 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Terisi dari profil
                </div>
                {auto.map((f) => (
                  <div key={f.key} className="mt-1">
                    <span className="text-neutral-400">{f.label}</span> <b>({UF_AUTOFILL_LABEL[f.autofill!]})</b>
                  </div>
                ))}
              </div>
            ) : null}
            {shown
              .filter((f) => !f.autofill)
              .map((f) =>
                f.tipe === 'INFO' ? (
                  f.gaya === 'HEADING' ? (
                    <div key={f.key} className="pt-1">
                      <div className="font-bold">{f.label}</div>
                      {f.isi ? <div className="text-xs text-neutral-500 whitespace-pre-line">{f.isi}</div> : null}
                    </div>
                  ) : (
                    <div
                      key={f.key}
                      className={`rounded-xl p-2.5 text-xs whitespace-pre-line ${f.gaya === 'INFO' ? 'bg-sky-50 text-sky-800' : f.gaya === 'WARNING' ? 'bg-amber-50 text-amber-800' : 'text-neutral-700'}`}
                    >
                      {f.label ? <b className="block">{f.label}</b> : null}
                      {f.isi}
                    </div>
                  )
                ) : (
                  <div key={f.key}>
                    <div className="text-xs font-semibold text-neutral-800">
                      {f.label}
                      {f.wajib ? <span className="text-red-600"> *</span> : null}
                    </div>
                    {f.petunjuk ? <div className="text-[11px] text-neutral-500">{f.petunjuk}</div> : null}
                    {UF_OPTION_TYPES.includes(f.tipe) ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {f.opsi.map((o) => (
                          <span key={o} className="px-2 py-1 rounded-full border border-neutral-200 bg-white text-xs">
                            {o}
                          </span>
                        ))}
                      </div>
                    ) : f.tipe === 'BOOLEAN' ? (
                      <div className="mt-1 flex gap-1">
                        <span className="px-3 py-1 rounded-full border border-neutral-200 bg-white text-xs">Ya</span>
                        <span className="px-3 py-1 rounded-full border border-neutral-200 bg-white text-xs">Tidak</span>
                      </div>
                    ) : f.tipe === 'SIGNATURE' ? (
                      <div className="mt-1">
                        {f.isi ? <div className="rounded-lg bg-brand-50 p-2 text-xs mb-1 whitespace-pre-line">{f.isi}</div> : null}
                        <div className="h-16 rounded-xl border border-dashed border-brand-300 bg-white flex items-center justify-center text-xs text-brand-600">Ketuk untuk tanda tangan</div>
                      </div>
                    ) : f.tipe === 'FILE' ? (
                      <div className="mt-1 h-10 rounded-xl border border-dashed border-neutral-300 bg-white flex items-center justify-center text-xs text-neutral-500">
                        Kamera / galeri / file · maks {f.validasi.maxFiles ?? 1}
                      </div>
                    ) : (
                      <div className={`mt-1 rounded-xl border border-neutral-200 bg-white ${f.tipe === 'TEXTAREA' || f.tipe === 'RICHTEXT' ? 'h-16' : 'h-9'}`} />
                    )}
                  </div>
                ),
              )}
            <div className="rounded-xl bg-brand-500 text-white text-center font-bold py-2.5">Kirim</div>
          </div>
        </div>
      </div>
    </div>
  );
}
