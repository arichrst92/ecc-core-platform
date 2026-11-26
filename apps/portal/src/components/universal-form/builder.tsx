'use client';

/**
 * Penyusun field Universal Form (2026-12): jenis field di kiri, susunan di
 * tengah (seret / tombol naik-turun), pengaturan field terpilih di kanan.
 */
import { useState } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  Calendar,
  CalendarClock,
  CalendarRange,
  CheckSquare,
  ChevronDown,
  CircleDot,
  EyeOff,
  GripVertical,
  Hash,
  Heading,
  Info,
  Link2,
  Lock,
  Mail,
  Paperclip,
  PenLine,
  Phone,
  Plus,
  ToggleLeft,
  Trash2,
  Type,
  WholeWord,
} from 'lucide-react';
import {
  UF_AUTOFILL_GROUPS,
  ufAutofillFor,
  UF_AUTOFILL_LABEL,
  UF_FIELD_LABEL,
  UF_FILE_ACCEPT,
  UF_FILE_ACCEPT_LABEL,
  UF_INFO_STYLES,
  UF_INFO_STYLE_LABEL,
  UF_MAX_FILES,
  UF_MAX_FILE_MB,
  UF_OPTION_TYPES,
  type UfFieldType,
} from '@ecc/shared-types';
import { newKey, type UfField } from './types';

export const FIELD_ICON: Record<UfFieldType, React.ComponentType<{ className?: string }>> = {
  TEXT: Type,
  TEXTAREA: AlignLeft,
  RICHTEXT: WholeWord,
  FILE: Paperclip,
  EMAIL: Mail,
  URL: Link2,
  PHONE: Phone,
  DATE: Calendar,
  DATE_RANGE: CalendarRange,
  DATETIME: CalendarClock,
  SELECT: ChevronDown,
  RADIO: CircleDot,
  CHECKBOX: CheckSquare,
  NUMBER: Hash,
  BOOLEAN: ToggleLeft,
  SIGNATURE: PenLine,
  INFO: Info,
};

const GROUPS: { label: string; types: UfFieldType[] }[] = [
  { label: 'Teks', types: ['TEXT', 'TEXTAREA', 'RICHTEXT'] },
  { label: 'Kontak', types: ['EMAIL', 'PHONE', 'URL'] },
  { label: 'Pilihan', types: ['SELECT', 'RADIO', 'CHECKBOX', 'BOOLEAN', 'NUMBER'] },
  { label: 'Tanggal', types: ['DATE', 'DATE_RANGE', 'DATETIME'] },
  { label: 'Lainnya', types: ['FILE', 'SIGNATURE'] },
];

function blank(tipe: UfFieldType, gaya?: UfField['gaya']): UfField {
  return {
    key: newKey(),
    tipe,
    label: tipe === 'INFO' ? (gaya === 'HEADING' ? 'Bagian baru' : '') : tipe === 'SIGNATURE' ? 'Tanda tangan' : '',
    petunjuk: null,
    wajib: tipe === 'SIGNATURE',
    opsi: UF_OPTION_TYPES.includes(tipe) ? ['Pilihan 1', 'Pilihan 2'] : [],
    validasi: tipe === 'FILE' ? { maxFiles: 1, maxSizeMb: 10, accept: ['image', 'pdf'] } : {},
    autofill: null,
    gaya: tipe === 'INFO' ? gaya ?? 'TEXT' : null,
    isi: tipe === 'SIGNATURE' ? 'Saya menyatakan data yang saya isi di atas benar.' : tipe === 'INFO' ? '' : null,
    hidden: false,
  };
}

export function FieldBuilder({
  fields,
  onChange,
  anonim,
  hasResponses,
}: {
  fields: UfField[];
  onChange: (f: UfField[]) => void;
  anonim: boolean;
  hasResponses: boolean;
}) {
  const [sel, setSel] = useState<string | null>(fields[0]?.key ?? null);
  const [drag, setDrag] = useState<string | null>(null);
  const current = fields.find((f) => f.key === sel) ?? null;

  const add = (f: UfField) => {
    const i = current ? fields.findIndex((x) => x.key === current.key) + 1 : fields.length;
    onChange([...fields.slice(0, i), f, ...fields.slice(i)]);
    setSel(f.key);
  };
  const patch = (key: string, p: Partial<UfField>) => onChange(fields.map((f) => (f.key === key ? { ...f, ...p } : f)));
  const move = (key: string, d: -1 | 1) => {
    const i = fields.findIndex((f) => f.key === key);
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const a = [...fields];
    [a[i], a[j]] = [a[j]!, a[i]!];
    onChange(a);
  };
  const remove = (f: UfField) => {
    if (f.hasAnswers) {
      patch(f.key, { hidden: true });
      return;
    }
    onChange(fields.filter((x) => x.key !== f.key));
    if (sel === f.key) setSel(null);
  };
  const dropOn = (target: string) => {
    if (!drag || drag === target) return;
    const a = fields.filter((f) => f.key !== drag);
    const moving = fields.find((f) => f.key === drag)!;
    const i = a.findIndex((f) => f.key === target);
    a.splice(i, 0, moving);
    onChange(a);
    setDrag(null);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[190px_minmax(0,1fr)_300px] gap-4">
      {/* jenis field */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 h-fit lg:sticky lg:top-4">
        <div className="text-xs font-semibold text-neutral-500 mb-2">Tambah field</div>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-1">
          {GROUPS.map((g) => (
            <div key={g.label} className="contents">
              <div className="col-span-2 lg:col-span-1 text-[10px] uppercase tracking-wider text-neutral-400 mt-2">{g.label}</div>
              {g.types.map((t) => {
                const Icon = FIELD_ICON[t];
                const off = anonim && t === 'SIGNATURE';
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={off}
                    title={off ? 'Form anonim tidak boleh memakai tanda tangan' : undefined}
                    onClick={() => add(blank(t))}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-neutral-700 hover:bg-brand-50 hover:text-brand-700 text-left disabled:opacity-40"
                  >
                    <Icon className="w-4 h-4 shrink-0" /> {UF_FIELD_LABEL[t].replace(' (banyak pilihan)', '')}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="col-span-2 lg:col-span-1 text-[10px] uppercase tracking-wider text-neutral-400 mt-2">Informasi (bukan isian)</div>
          {UF_INFO_STYLES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => add(blank('INFO', g))}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-neutral-700 hover:bg-brand-50 hover:text-brand-700 text-left"
            >
              {g === 'HEADING' ? <Heading className="w-4 h-4" /> : <Info className="w-4 h-4" />} {UF_INFO_STYLE_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      {/* susunan */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 space-y-2 min-h-[300px]">
        {fields.length === 0 ? (
          <div className="py-16 text-center text-sm text-neutral-500">Pilih jenis field di kiri untuk mulai menyusun form.</div>
        ) : null}
        {fields.map((f, i) => {
          const Icon = FIELD_ICON[f.tipe];
          const on = f.key === sel;
          return (
            <div
              key={f.key}
              draggable
              onDragStart={() => setDrag(f.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(f.key)}
              onClick={() => setSel(f.key)}
              className={`rounded-lg border bg-white p-3 cursor-pointer ${on ? 'border-brand-400 ring-2 ring-brand-100' : 'border-neutral-200 hover:border-neutral-300'} ${f.hidden ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-2">
                <GripVertical className="w-4 h-4 text-neutral-300 mt-0.5 shrink-0 cursor-grab" />
                <Icon className="w-4 h-4 text-brand-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  {f.tipe === 'INFO' ? (
                    <InfoPreview f={f} />
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-neutral-900 break-words">
                        {f.label || <span className="text-neutral-400">(tanpa label)</span>}
                        {f.wajib ? <span className="text-red-600"> *</span> : null}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="text-[11px] text-neutral-500">{UF_FIELD_LABEL[f.tipe]}</span>
                        {f.autofill ? (
                          <span className="inline-flex items-center gap-1 px-1.5 rounded bg-sky-50 text-sky-700 text-[11px]">
                            <Lock className="w-3 h-3" /> {UF_AUTOFILL_LABEL[f.autofill]}
                          </span>
                        ) : null}
                        {UF_OPTION_TYPES.includes(f.tipe) ? <span className="text-[11px] text-neutral-400">· {f.opsi.join(', ')}</span> : null}
                        {f.tipe === 'FILE' ? <span className="text-[11px] text-neutral-400">· maks {f.validasi.maxFiles ?? 1} file</span> : null}
                        {f.hidden ? (
                          <span className="inline-flex items-center gap-1 px-1.5 rounded bg-neutral-100 text-neutral-600 text-[11px]">
                            <EyeOff className="w-3 h-3" /> disembunyikan
                          </span>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => move(f.key, -1)} disabled={i === 0} className="p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30" title="Naik">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => move(f.key, 1)} disabled={i === fields.length - 1} className="p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-30" title="Turun">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => remove(f)} className="p-1 text-neutral-400 hover:text-red-600" title={f.hasAnswers ? 'Sudah ada jawaban — disembunyikan' : 'Hapus'}>
                    {f.hasAnswers ? <EyeOff className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        {fields.length ? (
          <button type="button" onClick={() => add(blank('TEXT'))} className="w-full border border-dashed border-neutral-300 rounded-lg py-2 text-sm text-neutral-500 hover:border-brand-300 hover:text-brand-600 inline-flex items-center justify-center gap-1">
            <Plus className="w-4 h-4" /> Tambah teks pendek
          </button>
        ) : null}
      </div>

      {/* pengaturan field */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 h-fit lg:sticky lg:top-4">
        {current ? (
          <FieldSettings key={current.key} f={current} set={(p) => patch(current.key, p)} anonim={anonim} locked={hasResponses && !!current.hasAnswers} />
        ) : (
          <p className="text-sm text-neutral-500">Klik field untuk mengatur label, wajib, validasi, dan autofill.</p>
        )}
      </div>
    </div>
  );
}

function InfoPreview({ f }: { f: UfField }) {
  const tone =
    f.gaya === 'INFO' ? 'bg-sky-50 text-sky-800 border-sky-100' : f.gaya === 'WARNING' ? 'bg-amber-50 text-amber-800 border-amber-100' : 'text-neutral-700 border-transparent';
  if (f.gaya === 'HEADING')
    return (
      <div>
        <div className="text-base font-bold text-neutral-900">{f.label || 'Judul bagian'}</div>
        {f.isi ? <div className="text-xs text-neutral-500 mt-0.5 whitespace-pre-line">{f.isi}</div> : null}
      </div>
    );
  return (
    <div className={`rounded-md border px-2 py-1.5 text-xs whitespace-pre-line ${tone}`}>
      {f.label ? <b className="block">{f.label}</b> : null}
      {f.isi || <span className="text-neutral-400">(isi kosong)</span>}
    </div>
  );
}

const inputCls = 'mt-0.5 w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500';

function Num({ label, value, onChange, min, max }: { label: string; value?: number; onChange: (v?: number) => void; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="text-xs text-neutral-600">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className={inputCls}
      />
    </label>
  );
}

function Check({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm text-neutral-700 ${disabled ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-brand-500" /> {label}
    </label>
  );
}

function FieldSettings({ f, set, anonim, locked }: { f: UfField; set: (p: Partial<UfField>) => void; anonim: boolean; locked: boolean }) {
  const v = f.validasi;
  const setV = (p: Partial<UfField['validasi']>) => set({ validasi: { ...v, ...p } });
  const isText = f.tipe === 'TEXT' || f.tipe === 'TEXTAREA' || f.tipe === 'RICHTEXT';
  const isDate = f.tipe === 'DATE' || f.tipe === 'DATE_RANGE' || f.tipe === 'DATETIME';
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-neutral-500 flex items-center gap-1">
        {UF_FIELD_LABEL[f.tipe]}
        {locked ? <span className="text-amber-700">· sudah ada jawaban (jenis terkunci)</span> : null}
      </div>
      {f.tipe === 'INFO' ? (
        <label className="block">
          <span className="text-xs text-neutral-600">Gaya</span>
          <select value={f.gaya ?? 'TEXT'} onChange={(e) => set({ gaya: e.target.value as UfField['gaya'] })} className={inputCls}>
            {UF_INFO_STYLES.map((g) => (
              <option key={g} value={g}>
                {UF_INFO_STYLE_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="text-xs text-neutral-600">{f.tipe === 'INFO' ? 'Judul (opsional)' : 'Label / pertanyaan'}</span>
        <input value={f.label} onChange={(e) => set({ label: e.target.value })} maxLength={300} className={inputCls} />
      </label>
      {f.tipe === 'INFO' || f.tipe === 'SIGNATURE' ? (
        <label className="block">
          <span className="text-xs text-neutral-600">{f.tipe === 'SIGNATURE' ? 'Pernyataan yang disetujui' : 'Isi'}</span>
          <textarea rows={5} value={f.isi ?? ''} onChange={(e) => set({ isi: e.target.value })} maxLength={5000} className={inputCls} />
          <span className="text-[11px] text-neutral-400">Mendukung **tebal**, _miring_, daftar (- ), dan link. {'{nama_peserta}'} & {'{event}'} diganti otomatis.</span>
        </label>
      ) : (
        <label className="block">
          <span className="text-xs text-neutral-600">Petunjuk (opsional)</span>
          <input value={f.petunjuk ?? ''} onChange={(e) => set({ petunjuk: e.target.value || null })} maxLength={1000} className={inputCls} />
        </label>
      )}
      {f.tipe !== 'INFO' ? (
        <Check label={f.autofill ? 'Wajib diisi bila data profil kosong' : 'Wajib diisi'} checked={f.wajib} onChange={(w) => set({ wajib: w })} />
      ) : null}

      {ufAutofillFor(f.tipe).length ? (
        <label className="block">
          <span className="text-xs text-neutral-600">Autofill dari data jemaat</span>
          <select
            value={f.autofill ?? ''}
            disabled={anonim}
            onChange={(e) => set({ autofill: (e.target.value || null) as UfField['autofill'] })}
            className={inputCls}
          >
            <option value="">Tidak — jemaat mengisi sendiri</option>
            {UF_AUTOFILL_GROUPS.map((g) => {
              const keys = g.keys.filter((k) => ufAutofillFor(f.tipe).includes(k));
              return keys.length ? (
                <optgroup key={g.label} label={g.label}>
                  {keys.map((a) => (
                    <option key={a} value={a}>
                      {UF_AUTOFILL_LABEL[a]}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
          <span className="text-[11px] text-neutral-400">
            {anonim
              ? 'Form anonim tidak memakai autofill.'
              : 'Tampil terkunci di app, diambil dari data peserta saat dikirim. Bila datanya belum ada (mis. belum punya pasangan di menu Keluarga), jemaat mengisi manual. Data pasangan & orang tua/wali dibaca dari menu Keluarga peserta.'}
          </span>
        </label>
      ) : null}

      {UF_OPTION_TYPES.includes(f.tipe) ? (
        <label className="block">
          <span className="text-xs text-neutral-600">Pilihan (satu per baris)</span>
          <textarea
            rows={5}
            value={f.opsi.join('\n')}
            onChange={(e) => set({ opsi: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 100) })}
            className={inputCls}
          />
        </label>
      ) : null}
      {f.tipe === 'CHECKBOX' ? (
        <div className="grid grid-cols-2 gap-2">
          <Num label="Pilih minimal" value={v.minSelect} onChange={(n) => setV({ minSelect: n })} min={0} />
          <Num label="Pilih maksimal" value={v.maxSelect} onChange={(n) => setV({ maxSelect: n })} min={1} />
        </div>
      ) : null}

      {isText && !f.autofill ? (
        <div className="grid grid-cols-2 gap-2">
          <Num label="Min. karakter" value={v.minLength} onChange={(n) => setV({ minLength: n })} min={0} />
          <Num label="Maks. karakter" value={v.maxLength} onChange={(n) => setV({ maxLength: n })} min={1} />
        </div>
      ) : null}
      {f.tipe === 'NUMBER' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Nilai minimal" value={v.min} onChange={(n) => setV({ min: n })} />
            <Num label="Nilai maksimal" value={v.max} onChange={(n) => setV({ max: n })} />
          </div>
          <Check label="Bilangan bulat saja" checked={!!v.integer} onChange={(b) => setV({ integer: b })} />
        </>
      ) : null}
      {f.tipe === 'EMAIL' || f.tipe === 'URL' ? (
        <label className="block">
          <span className="text-xs text-neutral-600">Hanya domain (opsional, pisahkan koma)</span>
          <input
            value={(v.domains ?? []).join(', ')}
            onChange={(e) => setV({ domains: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })}
            placeholder={f.tipe === 'EMAIL' ? 'gmail.com, eccchurch.global' : 'instagram.com'}
            className={inputCls}
          />
        </label>
      ) : null}
      {isDate ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-neutral-600">Paling cepat</span>
              <input type="date" value={v.minDate ?? ''} onChange={(e) => setV({ minDate: e.target.value || undefined })} className={inputCls} />
            </label>
            <label className="block">
              <span className="text-xs text-neutral-600">Paling lambat</span>
              <input type="date" value={v.maxDate ?? ''} onChange={(e) => setV({ maxDate: e.target.value || undefined })} className={inputCls} />
            </label>
          </div>
          <Check label="Tidak boleh sebelum hari ini" checked={!!v.notPast} onChange={(b) => setV({ notPast: b })} />
          <Check label="Tidak boleh setelah hari ini" checked={!!v.notFuture} onChange={(b) => setV({ notFuture: b })} />
          {f.tipe === 'DATE_RANGE' ? <Num label="Rentang maksimal (hari)" value={v.maxDays} onChange={(n) => setV({ maxDays: n })} min={1} /> : null}
        </>
      ) : null}
      {f.tipe === 'FILE' ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Num label={`Jumlah file maks (1–${UF_MAX_FILES})`} value={v.maxFiles} onChange={(n) => setV({ maxFiles: n })} min={1} max={UF_MAX_FILES} />
            <Num label={`Ukuran per file (MB, ≤${UF_MAX_FILE_MB})`} value={v.maxSizeMb} onChange={(n) => setV({ maxSizeMb: n })} min={1} max={UF_MAX_FILE_MB} />
          </div>
          <div>
            <span className="text-xs text-neutral-600">Jenis file diterima</span>
            <div className="mt-1 space-y-1">
              {UF_FILE_ACCEPT.map((a) => (
                <Check
                  key={a}
                  label={UF_FILE_ACCEPT_LABEL[a]}
                  checked={(v.accept ?? []).includes(a)}
                  onChange={(b) => setV({ accept: b ? [...(v.accept ?? []), a] : (v.accept ?? []).filter((x) => x !== a) })}
                />
              ))}
            </div>
            <span className="text-[11px] text-neutral-400">Tidak ada yang dicentang = semua jenis di atas.</span>
          </div>
        </>
      ) : null}
      {f.tipe === 'SIGNATURE' ? (
        <p className="text-[11px] text-neutral-500 leading-relaxed">
          Ditandatangani oleh akun yang mengisi. Bukti (waktu, perangkat, hash isi jawaban) disimpan. Jawaban diubah → wajib tanda tangan ulang.
        </p>
      ) : null}
      {f.tipe !== 'INFO' ? <Check label="Sembunyikan dari app" checked={f.hidden} onChange={(b) => set({ hidden: b })} /> : null}
    </div>
  );
}
