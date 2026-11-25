'use client';

/**
 * Sematan Universal Form di News / Event / Announcement (2026-12).
 *
 *  - `useFormEmbeds(type, id)` — muat sematan yang ada + simpan (dipakai form
 *    buat/ubah: setelah konten tersimpan, panggil `save(idBaru)`).
 *  - `<FormEmbedEditor>` — pilih form, batas pengisian (WIB), batal otomatis (event).
 *  - `<FormEmbedPanel>` — untuk halaman detail: lihat + atur + simpan langsung.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, ClipboardList, ExternalLink, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { UF_FORM_STATUS_LABEL } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { STATUS_BADGE, errMsg, fmtWib, isoToWibInput, wibInputToIso } from './types';
import { ResultsTab } from './results';

export type UfSourceType = 'NEWS' | 'EVENT' | 'ANNOUNCEMENT';
export type EmbedDraft = { formId: string; batasAt: string | null; autoCancel: boolean };
type EmbedRow = EmbedDraft & {
  id: string;
  responseCount: number;
  needsFixCount: number;
  form: { judul: string; status: string; anonim: boolean; tutupAt: string | null };
};
type FormOption = { id: string; judul: string; status: string; anonim: boolean; tutupAt: string | null };

export function useFormEmbeds(sourceType: UfSourceType, sourceId?: string | null) {
  const q = useQuery({
    queryKey: ['uf-embeds', sourceType, sourceId],
    enabled: !!sourceId,
    queryFn: async () => (await apiClient.get<{ data: EmbedRow[] }>(`/admin/universal-form/embeds/${sourceType}/${sourceId}`)).data.data,
  });
  const [draft, setDraft] = useState<EmbedDraft[] | null>(null);
  // Ganti konten (mis. modal dipakai untuk event lain) → muat ulang dari server.
  useEffect(() => setDraft(null), [sourceType, sourceId]);
  useEffect(() => {
    if (q.data && draft === null) setDraft(q.data.map((e) => ({ formId: e.formId, batasAt: e.batasAt, autoCancel: e.autoCancel })));
  }, [q.data, draft]);
  const value = draft ?? [];
  const initial = JSON.stringify((q.data ?? []).map((e) => ({ formId: e.formId, batasAt: e.batasAt, autoCancel: e.autoCancel })));
  const dirty = JSON.stringify(value) !== initial;
  const qc = useQueryClient();
  async function save(id: string | null | undefined = sourceId) {
    if (!id) return;
    if (!dirty && sourceId) return;
    if (!sourceId && !value.length) return;
    await apiClient.put(`/admin/universal-form/embeds/${sourceType}/${id}`, { forms: value });
    setDraft(null);
    qc.invalidateQueries({ queryKey: ['uf-embeds', sourceType] });
  }
  return { rows: q.data ?? [], loading: !!sourceId && q.isLoading, value, setValue: setDraft, dirty, save };
}

export function FormEmbedEditor({
  sourceType,
  value,
  onChange,
  rows = [],
}: {
  sourceType: UfSourceType;
  value: EmbedDraft[];
  onChange: (v: EmbedDraft[]) => void;
  rows?: EmbedRow[];
}) {
  const opts = useQuery({
    queryKey: ['uf-options'],
    queryFn: async () => (await apiClient.get<{ data: FormOption[] }>('/admin/universal-form/options')).data.data,
    staleTime: 30_000,
  });
  const byId = useMemo(() => new Map((opts.data ?? []).map((o) => [o.id, o])), [opts.data]);
  const [pick, setPick] = useState('');
  const available = (opts.data ?? []).filter((o) => !value.some((v) => v.formId === o.id));
  const set = (i: number, patch: Partial<EmbedDraft>) => onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  return (
    <div className="space-y-2">
      {value.length === 0 ? <p className="text-xs text-neutral-500">Belum ada formulir yang disematkan.</p> : null}
      {value.map((v, i) => {
        const o = byId.get(v.formId);
        const row = rows.find((r) => r.formId === v.formId);
        return (
          <div key={v.formId} className="border border-neutral-200 rounded-lg p-3 bg-white">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardList className="w-4 h-4 text-brand-500 shrink-0" />
              <span className="font-semibold text-sm text-neutral-900 flex-1 min-w-0 truncate">{o?.judul ?? row?.form.judul ?? 'Form'}</span>
              {o ? <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_BADGE[o.status] ?? ''}`}>{UF_FORM_STATUS_LABEL[o.status as keyof typeof UF_FORM_STATUS_LABEL] ?? o.status}</span> : null}
              {row ? <span className="text-xs text-neutral-500">{row.responseCount} respons</span> : null}
              <Link href={`/dashboard/universal-form/${v.formId}`} target="_blank" className="p-1 text-neutral-400 hover:text-brand-600" title="Buka form">
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="p-1 text-neutral-400 hover:text-red-600" title="Lepas">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-xs text-neutral-600">Batas pengisian (WIB)</span>
                <input
                  type="datetime-local"
                  value={isoToWibInput(v.batasAt)}
                  onChange={(e) => set(i, { batasAt: wibInputToIso(e.target.value) })}
                  className="mt-0.5 w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm"
                />
                <span className="text-[11px] text-neutral-400">Kosong = tanggal tutup form ({fmtWib(o?.tutupAt)})</span>
              </label>
              {sourceType === 'EVENT' ? (
                <label className="flex items-start gap-2 text-xs text-neutral-700 sm:pt-4">
                  <input type="checkbox" checked={v.autoCancel} onChange={(e) => set(i, { autoCancel: e.target.checked })} className="mt-0.5 accent-brand-500" />
                  <span>
                    Batalkan pendaftaran otomatis bila belum mengisi / belum melengkapi perbaikan saat batas lewat.
                    <span className="block text-neutral-400">Event wajib bayar tidak dibatalkan — ditandai "Perlu tindak lanjut".</span>
                  </span>
                </label>
              ) : null}
            </div>
            {o?.status === 'DRAFT' ? (
              <p className="mt-1.5 text-[11px] text-amber-700 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Form masih Draf — belum tampil di app sampai dibuka.
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 min-w-[180px] px-2 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white">
          <option value="">{opts.isLoading ? 'Memuat form…' : available.length ? 'Pilih form untuk disematkan…' : 'Tidak ada form lain'}</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.judul} · {UF_FORM_STATUS_LABEL[o.status as keyof typeof UF_FORM_STATUS_LABEL] ?? o.status}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pick}
          onClick={() => {
            onChange([...value, { formId: pick, batasAt: null, autoCancel: false }]);
            setPick('');
          }}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-brand-300 text-brand-700 text-sm font-semibold disabled:opacity-40"
        >
          <Plus className="w-3.5 h-3.5" /> Sematkan
        </button>
        <Link href="/dashboard/universal-form/new" target="_blank" className="text-xs font-semibold text-brand-600 hover:underline">
          + Buat form baru
        </Link>
      </div>
    </div>
  );
}

/** Bagian "Formulir" di form buat/ubah konten (simpan dipanggil induk). */
export function FormEmbedSection({ sourceType, ctl }: { sourceType: UfSourceType; ctl: ReturnType<typeof useFormEmbeds> }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardList className="w-4 h-4 text-brand-500" />
        <span className="text-sm font-semibold text-neutral-800">Formulir</span>
        <span className="text-xs text-neutral-500">Universal Form yang diisi jemaat dari halaman ini{sourceType === 'EVENT' ? ' (khusus peserta terdaftar, per peserta)' : ''}</span>
      </div>
      {ctl.loading ? <Loader2 className="w-4 h-4 animate-spin text-neutral-400" /> : <FormEmbedEditor sourceType={sourceType} value={ctl.value} onChange={ctl.setValue} rows={ctl.rows} />}
    </div>
  );
}

/** Halaman detail: lihat & atur sematan, simpan langsung. */
export function FormEmbedPanel({ sourceType, sourceId }: { sourceType: UfSourceType; sourceId: string }) {
  const ctl = useFormEmbeds(sourceType, sourceId);
  const [saving, setSaving] = useState(false);
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <ClipboardList className="w-5 h-5 text-brand-500" />
        <h3 className="font-semibold text-neutral-900 flex-1">Formulir</h3>
        {ctl.dirty ? (
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await ctl.save();
                toast.success('Sematan form disimpan');
              } catch (e) {
                toast.error(errMsg(e));
              } finally {
                setSaving(false);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
          </button>
        ) : null}
      </div>
      {ctl.rows.length ? (
        <div className="flex flex-wrap gap-2 mb-3">
          {ctl.rows.map((r) => (
            <Link
              key={r.id}
              href={`/dashboard/universal-form/${r.formId}?tab=hasil&sourceType=${sourceType}&sourceId=${sourceId}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-100 text-sm text-brand-800 hover:bg-brand-100"
            >
              <span className="font-semibold">{r.form.judul}</span>
              <span className="text-xs">{r.responseCount} respons</span>
              {r.needsFixCount ? <span className="text-xs text-amber-700">· {r.needsFixCount} perlu diperbaiki</span> : null}
              <ExternalLink className="w-3 h-3" />
            </Link>
          ))}
        </div>
      ) : null}
      {ctl.loading ? <Loader2 className="w-4 h-4 animate-spin text-neutral-400" /> : <FormEmbedEditor sourceType={sourceType} value={ctl.value} onChange={ctl.setValue} rows={ctl.rows} />}
    </div>
  );
}

/** Tab "Formulir" di detail event / announcement: sematan + hasil per form untuk konten ini. */
export function ContentFormsTab({ sourceType, sourceId }: { sourceType: UfSourceType; sourceId: string }) {
  const q = useQuery({
    queryKey: ['uf-embeds', sourceType, sourceId],
    queryFn: async () => (await apiClient.get<{ data: EmbedRow[] }>(`/admin/universal-form/embeds/${sourceType}/${sourceId}`)).data.data,
  });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <FormEmbedPanel sourceType={sourceType} sourceId={sourceId} />
      {(q.data ?? []).map((r) => (
        <div key={r.id} className="bg-white border border-neutral-200 rounded-xl">
          <button onClick={() => setOpen(open === r.formId ? null : r.formId)} className="w-full flex flex-wrap items-center gap-2 px-4 py-3 text-left">
            <ClipboardList className="w-4 h-4 text-brand-500" />
            <span className="font-semibold text-sm flex-1 min-w-0 truncate">Hasil: {r.form.judul}</span>
            <span className="text-xs text-neutral-500">{r.responseCount} respons</span>
            {r.needsFixCount ? <span className="text-xs text-amber-700">{r.needsFixCount} perlu diperbaiki</span> : null}
            <span className="text-xs text-brand-600">{open === r.formId ? 'Tutup' : 'Lihat'}</span>
          </button>
          {open === r.formId ? (
            <div className="border-t border-neutral-100 p-3">
              <ResultsTab formId={r.formId} initialSource={{ sourceType, sourceId }} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
