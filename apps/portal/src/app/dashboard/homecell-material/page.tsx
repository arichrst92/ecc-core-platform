'use client';

/**
 * Community → Homecell Material.
 * Materi pertemuan homecell yang diunduh di app oleh Pastor zona, Zone Leader,
 * PIC homecell, dan Asisten (kartu homecell / zona di Beranda).
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudUpload, Download, ExternalLink, Library, Loader2, Pencil, Search, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { hasMenuAccess } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useDebounce } from '@/lib/use-debounce';
import { usePersistentState } from '@/lib/use-persistent-state';
import { resolveMediaUrl } from '@/lib/media-url';
import { selectCls, useCabangOptions } from '@/components/report/report-ui';
import { todayYmd } from '@/lib/dates';

type Status = 'DRAFT' | 'TERJADWAL' | 'TERBIT';
interface Material {
  id: string;
  judul: string;
  keterangan: string | null;
  fileUrl: string;
  fileMime: string;
  fileName: string | null;
  fileSize: number;
  berlakuMulai: string;
  berlakuSampai: string | null;
  isPublished: boolean;
  notifyLeaders: boolean;
  notifiedAt: string | null;
  status: Status;
  cabangs: { id: string; nama: string }[];
  semuaCabang: boolean;
  downloads: number;
  createdBy: { id: string; namaLengkap: string } | null;
}

const STATUS_STYLE: Record<Status, { label: string; cls: string }> = {
  TERBIT: { label: 'Terbit', cls: 'bg-emerald-100 text-emerald-800' },
  TERJADWAL: { label: 'Terjadwal', cls: 'bg-amber-100 text-amber-800' },
  DRAFT: { label: 'Draft', cls: 'bg-neutral-100 text-neutral-600' },
};
const ACCEPT = '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.txt';
const MAX_MB = 20;

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const fmtTgl = (ymd: string) => new Date(`${ymd}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
function fileTag(m: { fileMime: string; fileName: string | null }): { t: string; cls: string } {
  const ext = (m.fileName?.split('.').pop() ?? '').toLowerCase();
  if (m.fileMime === 'application/pdf' || ext === 'pdf') return { t: 'PDF', cls: 'bg-red-50 text-red-700' };
  if (ext.startsWith('ppt') || m.fileMime.includes('presentation') || m.fileMime.includes('powerpoint')) return { t: 'PPT', cls: 'bg-orange-50 text-orange-700' };
  if (ext.startsWith('doc') || m.fileMime.includes('word')) return { t: 'DOC', cls: 'bg-blue-50 text-blue-700' };
  if (ext.startsWith('xls') || m.fileMime.includes('sheet') || m.fileMime.includes('excel')) return { t: 'XLS', cls: 'bg-emerald-50 text-emerald-700' };
  if (m.fileMime.startsWith('image/')) return { t: 'IMG', cls: 'bg-violet-50 text-violet-700' };
  return { t: 'FILE', cls: 'bg-neutral-100 text-neutral-600' };
}
const errMsg = (e: any, fb: string) => e?.response?.data?.error?.message ?? fb;

export default function HomecellMaterialPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const can = (lvl: 'write' | 'delete') => !!user && (user.isFulltimer || hasMenuAccess(user.menuAccess ?? {}, 'homecell-material', lvl));
  const [cabangId, setCabangId] = usePersistentState('hcmat:cabang', '');
  const [bulan, setBulan] = usePersistentState('hcmat:bulan', '');
  const [status, setStatus] = usePersistentState<Status | ''>('hcmat:status', '');
  const [search, setSearch] = useState('');
  const s = useDebounce(search, 300);
  const cabangQ = useCabangOptions();
  const [form, setForm] = useState<Material | 'new' | null>(null);

  const q = useQuery({
    queryKey: ['homecell-material', cabangId, bulan, status, s],
    queryFn: async () =>
      (
        await apiClient.get<{ data: Material[] }>('/admin/homecell-material', {
          params: { cabangId: cabangId || undefined, bulan: bulan || undefined, status: status || undefined, search: s || undefined },
        })
      ).data.data,
    placeholderData: (p) => p,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/homecell-material/${id}`),
    onSuccess: () => {
      toast.success('Materi dihapus');
      qc.invalidateQueries({ queryKey: ['homecell-material'] });
    },
    onError: (e: any) => toast.error(errMsg(e, 'Gagal menghapus')),
  });

  const rows = q.data ?? [];
  // 12 bulan terakhir + 3 bulan ke depan untuk filter.
  const months = Array.from({ length: 15 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + 3 - i);
    return { v: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, l: d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Library className="w-6 h-6 text-brand-500" />
            Homecell Material
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">
            Materi pertemuan untuk Pastor zona, Zone Leader, PIC, dan Asisten homecell — diunduh dari kartu homecell / zona di app.
          </p>
        </div>
        {can('write') && (
          <button
            onClick={() => setForm('new')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold"
          >
            <Upload className="w-4 h-4" /> Upload material
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={`${selectCls} !w-44`}>
          <option value="">Semua cabang</option>
          {(cabangQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>
        <select value={bulan} onChange={(e) => setBulan(e.target.value)} className={`${selectCls} !w-44`}>
          <option value="">Semua bulan</option>
          {months.map((m) => (
            <option key={m.v} value={m.v}>
              {m.l}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')} className={`${selectCls} !w-36`}>
          <option value="">Semua status</option>
          <option value="TERBIT">Terbit</option>
          <option value="TERJADWAL">Terjadwal</option>
          <option value="DRAFT">Draft</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul materi"
            className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {q.isLoading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-neutral-500">
            <Library className="w-8 h-8 mx-auto text-neutral-300 mb-2" />
            Belum ada materi{bulan || status || s || cabangId ? ' untuk filter ini' : ''}.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {rows.map((m) => {
              const tag = fileTag(m);
              const st = STATUS_STYLE[m.status];
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-10 h-11 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${tag.cls}`}>{tag.t}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">{m.judul}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {m.status === 'TERJADWAL' ? 'Tampil mulai ' : 'Berlaku '}
                      {fmtTgl(m.berlakuMulai)}
                      {m.berlakuSampai ? ` – ${fmtTgl(m.berlakuSampai)}` : ''} ·{' '}
                      {m.semuaCabang ? 'Semua cabang' : m.cabangs.map((c) => c.nama).join(', ')} · {fmtSize(m.fileSize)}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                  <span className="text-xs text-neutral-500 w-20 text-right whitespace-nowrap" title="Pemimpin yang sudah mengunduh">
                    <Download className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                    {m.downloads}
                  </span>
                  <a
                    href={resolveMediaUrl(m.fileUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded text-neutral-400 hover:text-brand-600 hover:bg-neutral-100"
                    title="Buka file"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  {can('write') && (
                    <button onClick={() => setForm(m)} className="p-1.5 rounded text-neutral-400 hover:text-brand-600 hover:bg-neutral-100" title="Ubah">
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {can('delete') && (
                    <button
                      onClick={() => confirm(`Hapus materi "${m.judul}"? File ikut terhapus dan tidak bisa diunduh lagi di app.`) && remove.mutate(m.id)}
                      className="p-1.5 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {form && (
        <MaterialForm
          initial={form === 'new' ? null : form}
          cabangOptions={cabangQ.data ?? []}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            qc.invalidateQueries({ queryKey: ['homecell-material'] });
          }}
        />
      )}
    </div>
  );
}

function MaterialForm({
  initial,
  cabangOptions,
  onClose,
  onSaved,
}: {
  initial: Material | null;
  cabangOptions: { id: string; nama: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [judul, setJudul] = useState(initial?.judul ?? '');
  const [keterangan, setKeterangan] = useState(initial?.keterangan ?? '');
  const [mulai, setMulai] = useState(initial?.berlakuMulai ?? todayYmd());
  const [sampai, setSampai] = useState(initial?.berlakuSampai ?? '');
  const [semua, setSemua] = useState(initial ? initial.semuaCabang : true);
  const [cabangIds, setCabangIds] = useState<string[]>(initial?.cabangs.map((c) => c.id) ?? []);
  const [publish, setPublish] = useState(initial ? initial.isPublished : true);
  const [notify, setNotify] = useState(initial ? initial.notifyLeaders : true);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) return setErr(`File terlalu besar. Maksimal ${MAX_MB} MB.`);
    setErr(null);
    setFile(f);
  }

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('judul', judul.trim());
      fd.append('keterangan', keterangan.trim());
      fd.append('berlakuMulai', mulai);
      fd.append('berlakuSampai', sampai);
      fd.append('cabangIds', JSON.stringify(semua ? [] : cabangIds));
      fd.append('isPublished', String(publish));
      fd.append('notifyLeaders', String(notify));
      if (file) fd.append('file', file);
      const cfg = { headers: { 'Content-Type': 'multipart/form-data' } };
      return initial ? apiClient.patch(`/admin/homecell-material/${initial.id}`, fd, cfg) : apiClient.post('/admin/homecell-material', fd, cfg);
    },
    onSuccess: () => {
      toast.success(initial ? 'Materi diperbarui' : 'Materi diupload');
      onSaved();
    },
    onError: (e: any) => setErr(errMsg(e, 'Gagal menyimpan materi')),
  });

  function submit() {
    if (judul.trim().length < 3) return setErr('Judul minimal 3 karakter.');
    if (!initial && !file) return setErr('Pilih file materi dulu.');
    if (!mulai) return setErr('Isi tanggal berlaku mulai.');
    if (sampai && sampai < mulai) return setErr('Tanggal "sampai" tidak boleh sebelum tanggal mulai.');
    if (!semua && cabangIds.length === 0) return setErr('Pilih minimal satu cabang, atau pilih Semua cabang.');
    setErr(null);
    save.mutate();
  }

  const inputCls = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500';
  const scheduled = publish && mulai > todayYmd();

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={save.isPending ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900">{initial ? 'Ubah material' : 'Upload material'}</h2>
            <button onClick={onClose} disabled={save.isPending} className="p-1.5 hover:bg-neutral-100 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4 overflow-y-auto">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Judul</span>
              <input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={200} placeholder="Minggu ke-3 · Iman yang bertumbuh" className={inputCls} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Keterangan (opsional)</span>
              <textarea value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={2} maxLength={2000} placeholder="Bahan diskusi, ayat hafalan, pertanyaan pendalaman." className={inputCls} />
            </label>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer ${drag ? 'border-brand-400 bg-brand-50' : 'border-neutral-300 hover:bg-neutral-50'}`}
            >
              <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => pickFile(e.target.files?.[0])} />
              <CloudUpload className="w-6 h-6 mx-auto text-brand-500" />
              {file ? (
                <p className="text-sm mt-1 font-medium text-neutral-800">
                  {file.name} <span className="text-neutral-500 font-normal">· {fmtSize(file.size)}</span>
                </p>
              ) : initial ? (
                <p className="text-sm mt-1 text-neutral-700">
                  File sekarang: <span className="font-medium">{initial.fileName ?? 'materi'}</span> — klik untuk ganti
                </p>
              ) : (
                <p className="text-sm mt-1 text-neutral-700">
                  Seret file ke sini atau <span className="text-brand-600 font-medium">pilih file</span>
                </p>
              )}
              <p className="text-xs text-neutral-500 mt-0.5">PDF, PowerPoint, Word, Excel, gambar · maks {MAX_MB} MB</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Berlaku mulai</span>
                <input type="date" value={mulai} onChange={(e) => setMulai(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Sampai (opsional)</span>
                <input type="date" value={sampai} min={mulai} onChange={(e) => setSampai(e.target.value)} className={inputCls} />
              </label>
            </div>
            <p className="text-xs text-neutral-500 -mt-2">
              Tampil di app mulai tanggal ini sebagai &quot;Materi minggu ini&quot;. Setelah lewat, pindah ke &quot;Sebelumnya&quot; dan tetap bisa diunduh.
            </p>

            <div>
              <span className="text-sm font-medium text-neutral-700">Cabang</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => setSemua(true)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${semua ? 'bg-brand-100 border-brand-300 text-brand-800' : 'border-neutral-300 text-neutral-600'}`}
                >
                  Semua cabang
                </button>
                {cabangOptions.map((c) => {
                  const on = !semua && cabangIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSemua(false);
                        setCabangIds((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]));
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${on ? 'bg-brand-100 border-brand-300 text-brand-800' : 'border-neutral-300 text-neutral-600'}`}
                    >
                      {c.nama}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-500" />
              <span>
                Terbitkan
                <span className="block text-xs text-neutral-500">
                  {publish ? (scheduled ? `Terjadwal — tampil di app mulai ${fmtTgl(mulai)}.` : 'Langsung tampil di app.') : 'Disimpan sebagai draft, belum tampil di app.'}
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="mt-0.5 w-4 h-4 accent-brand-500" />
              <span>
                Kirim notifikasi in-app ke pemimpin homecell
                <span className="block text-xs text-neutral-500">
                  {initial?.notifiedAt ? 'Notifikasi sudah terkirim untuk materi ini.' : 'Dikirim sekali saat materi mulai tampil.'}
                </span>
              </span>
            </label>

            {err && <p className="text-sm text-red-600">{err}</p>}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutral-100">
            <button onClick={onClose} disabled={save.isPending} className="px-4 py-2 text-sm rounded-lg border border-neutral-300">
              Batal
            </button>
            <button onClick={submit} disabled={save.isPending} className="px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold disabled:opacity-60 inline-flex items-center gap-2">
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
