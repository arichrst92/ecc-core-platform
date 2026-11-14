'use client';

/**
 * Editor khusus section "about.pastors" (Konten Website → About Page):
 * daftar tim pastoral untuk halaman Tentang Kami eccchurch.global.
 * Tiap orang: Foto (persegi, wajib crop dulu), Nama, Jabatan, Cabang. Urutan = urutan tampil.
 * Disimpan sebagai JSON array {nama, jabatan, cabang, fotoUrl}.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Camera, ImageOff, Loader2, Pencil, Plus, Save, Trash2, UserRound, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { CoverCropper } from '@/components/worship/cover-cropper';

export interface PastorItem {
  nama: string;
  jabatan: string;
  cabang: string | null;
  fotoUrl: string | null;
}

const API = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
const fotoSrc = (u: string | null) => (!u ? null : /^https?:\/\//.test(u) ? u : `${API}${u}`);

function parse(content: string): PastorItem[] {
  try {
    const v = JSON.parse(content);
    if (!Array.isArray(v)) return [];
    return v.map((p: any) => ({
      nama: String(p?.nama ?? ''),
      jabatan: String(p?.jabatan ?? p?.posisi ?? ''),
      cabang: p?.cabang ? String(p.cabang) : null,
      fotoUrl: p?.fotoUrl ? String(p.fotoUrl) : null,
    }));
  } catch {
    return [];
  }
}

export function PastorEditor({
  section,
  onClose,
  onSaved,
}: {
  section: { id: string; title: string; content: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<PastorItem[]>(() => parse(section.content));
  const [form, setForm] = useState<{ index: number | null; data: PastorItem } | null>(null);
  const dirty = useMemo(() => JSON.stringify(items) !== JSON.stringify(parse(section.content)), [items, section.content]);

  const cabangQ = useQuery({
    queryKey: ['cabang', 'active-lite'],
    queryFn: async () => {
      const body = (await apiClient.get('/auth/cabang', { params: { isActive: true } })).data as any;
      return ((body?.data ?? body) as { id: string; nama: string }[]).map((c) => c.nama).sort();
    },
    staleTime: 300_000,
  });

  const save = useMutation({
    mutationFn: async () =>
      apiClient.put(`/admin/website-content/${section.id}`, {
        content: JSON.stringify(items.map((p) => ({ nama: p.nama.trim(), jabatan: p.jabatan.trim(), cabang: p.cabang || null, fotoUrl: p.fotoUrl }))),
      }),
    onSuccess: () => {
      toast.success('Tim pastoral disimpan — tampil di website dalam ±10 menit');
      onSaved();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });

  const move = (i: number, d: -1 | 1) =>
    setItems((arr) => {
      const j = i + d;
      if (j < 0 || j >= arr.length) return arr;
      const n = [...arr];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  const jabatanSuggest = useMemo(() => [...new Set(items.map((p) => p.jabatan).filter(Boolean))], [items]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => !save.isPending && onClose()} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <div>
              <h2 className="font-semibold text-neutral-900">{section.title}</h2>
              <p className="text-xs text-neutral-500">Foto persegi, nama, jabatan, cabang. Urutan di sini = urutan tampil di halaman Tentang Kami.</p>
            </div>
            <button onClick={onClose} disabled={save.isPending} className="p-1 rounded hover:bg-neutral-100">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-6">
            {items.length === 0 ? (
              <div className="text-center py-10 text-sm text-neutral-500">
                <UserRound className="w-10 h-10 mx-auto mb-2 text-neutral-300" />
                Belum ada tim pastoral. Klik <b>Tambah pastor</b>.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 border border-neutral-200 rounded-xl p-2.5">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-neutral-100 shrink-0 flex items-center justify-center">
                      {fotoSrc(p.fotoUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={fotoSrc(p.fotoUrl)!} alt={p.nama} className="w-full h-full object-cover" />
                      ) : (
                        <ImageOff className="w-5 h-5 text-neutral-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-neutral-900 truncate">{p.nama || '—'}</div>
                      <div className="text-xs text-brand-700 font-medium truncate">{p.jabatan || '—'}</div>
                      <div className="text-xs text-neutral-500 truncate">{p.cabang || 'Semua cabang'}</div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30" title="Naik">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30" title="Turun">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => setForm({ index: i, data: { ...p } })} className="p-1 rounded hover:bg-neutral-100" title="Ubah">
                        <Pencil className="w-3.5 h-3.5 text-neutral-600" />
                      </button>
                      <button
                        onClick={() => window.confirm(`Hapus ${p.nama} dari tim pastoral?`) && setItems((arr) => arr.filter((_, k) => k !== i))}
                        className="p-1 rounded hover:bg-red-50"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setForm({ index: null, data: { nama: '', jabatan: '', cabang: null, fotoUrl: null } })}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-brand-200 text-brand-700 text-sm font-semibold hover:bg-brand-50"
            >
              <Plus className="w-4 h-4" /> Tambah pastor
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl">
            <span className="text-xs text-neutral-500">{items.length} orang{dirty ? ' · belum disimpan' : ''}</span>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={save.isPending} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg">
                Batal
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={!dirty || save.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
              >
                {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Simpan
              </button>
            </div>
          </div>
        </div>
      </div>

      {form && (
        <PastorForm
          initial={form.data}
          isNew={form.index === null}
          cabangOptions={cabangQ.data ?? []}
          jabatanSuggest={jabatanSuggest}
          onCancel={() => setForm(null)}
          onDone={(d) => {
            setItems((arr) => (form.index === null ? [...arr, d] : arr.map((p, k) => (k === form.index ? d : p))));
            setForm(null);
          }}
        />
      )}
    </>
  );
}

function PastorForm({
  initial,
  isNew,
  cabangOptions,
  jabatanSuggest,
  onCancel,
  onDone,
}: {
  initial: PastorItem;
  isNew: boolean;
  cabangOptions: string[];
  jabatanSuggest: string[];
  onCancel: () => void;
  onDone: (d: PastorItem) => void;
}) {
  const [d, setD] = useState<PastorItem>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const valid = d.nama.trim().length >= 2 && d.jabatan.trim().length >= 2 && !!d.fotoUrl;

  async function upload(blob: Blob) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, 'pastor.jpg');
      const res = await apiClient.post<{ data: { url: string } }>('/admin/website-content/pastor-photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setD((x) => ({ ...x, fotoUrl: res.data.data.url }));
      setFile(null);
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message ?? 'Gagal mengunggah foto');
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onCancel} />
      <div className="fixed inset-0 z-[61] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100 font-semibold text-neutral-900">{isNew ? 'Tambah pastor' : 'Ubah pastor'}</div>
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-neutral-100 flex items-center justify-center shrink-0">
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
                ) : fotoSrc(d.fotoUrl) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoSrc(d.fotoUrl)!} alt="" className="w-full h-full object-cover" />
                ) : (
                  <UserRound className="w-8 h-8 text-neutral-300" />
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                >
                  <Camera className="w-4 h-4" /> {d.fotoUrl ? 'Ganti foto' : 'Pilih foto'}
                </button>
                <p className="text-xs text-neutral-500 mt-1.5">Foto wajib. Setelah dipilih, atur crop persegi dulu.</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setFile(f);
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama</span>
              <input
                value={d.nama}
                onChange={(e) => setD({ ...d, nama: e.target.value })}
                placeholder="mis. Ps. Nala Widya"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Jabatan</span>
              <input
                value={d.jabatan}
                onChange={(e) => setD({ ...d, jabatan: e.target.value })}
                list="pastor-jabatan"
                placeholder="mis. Senior Pastor"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
              <datalist id="pastor-jabatan">
                {[...new Set([...jabatanSuggest, 'Senior Pastor', 'Executive Pastor', 'Pastor', 'Associate Pastor'])].map((j) => (
                  <option key={j} value={j} />
                ))}
              </datalist>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Cabang</span>
              <select
                value={d.cabang ?? ''}
                onChange={(e) => setD({ ...d, cabang: e.target.value || null })}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
              >
                <option value="">— Semua cabang / tidak ditampilkan —</option>
                {d.cabang && !cabangOptions.includes(d.cabang) ? <option value={d.cabang}>{d.cabang}</option> : null}
                {cabangOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl">
            <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg">
              Batal
            </button>
            <button
              onClick={() => onDone({ ...d, nama: d.nama.trim(), jabatan: d.jabatan.trim() })}
              disabled={!valid || uploading}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {isNew ? 'Tambahkan' : 'Terapkan'}
            </button>
          </div>
        </div>
      </div>

      {file && (
        <div className="relative z-[70]">
          <CoverCropper file={file} title="Crop foto pastor (persegi)" saveLabel="Pakai foto ini" variant="avatar" onCancel={() => setFile(null)} onDone={upload} />
        </div>
      )}
    </>
  );
}
