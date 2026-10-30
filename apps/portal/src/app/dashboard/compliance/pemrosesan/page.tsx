'use client';

/**
 * Compliance → Catatan Pemrosesan & Penilaian Risiko (RoPA + DPIA ringkas).
 * Daftar kegiatan yang memproses data pribadi jemaat, bisa ditambah/diedit,
 * dan diunduh sebagai PDF.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, FileDown, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

type Level = 'RENDAH' | 'SEDANG' | 'TINGGI';
type Country = 'ID' | 'MY' | 'AU';

interface Activity {
  id: string;
  kode: string;
  nama: string;
  tujuan: string;
  subjekData: string;
  kategoriData: string;
  dataSensitif: boolean;
  dasarHukum: string;
  penerima: string;
  transferLuarNegeri: string;
  retensi: string;
  keamanan: string;
  pemilik: string;
  negara: Country[];
  risikoKemungkinan: number;
  risikoDampak: number;
  risiko: string;
  mitigasi: string;
  risikoSisa: Level;
  tinjauBerikutnya: string | null;
  urutan: number;
  updatedAt: string;
}
type Form = Omit<Activity, 'id' | 'updatedAt'>;

const riskLevel = (l: number, d: number): Level => (l * d >= 6 ? 'TINGGI' : l * d >= 3 ? 'SEDANG' : 'RENDAH');
const LEVEL_CLS: Record<Level, string> = {
  RENDAH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SEDANG: 'bg-amber-50 text-amber-700 border-amber-200',
  TINGGI: 'bg-red-50 text-red-700 border-red-200',
};

const EMPTY: Form = {
  kode: '', nama: '', tujuan: '', subjekData: '', kategoriData: '', dataSensitif: false, dasarHukum: '',
  penerima: '', transferLuarNegeri: 'Tidak ada', retensi: '', keamanan: '', pemilik: '', negara: ['ID', 'MY', 'AU'],
  risikoKemungkinan: 1, risikoDampak: 1, risiko: '', mitigasi: '', risikoSisa: 'RENDAH', tinjauBerikutnya: null, urutan: 0,
};

const TEXT_FIELDS: { k: keyof Form; label: string; hint?: string; rows?: number }[] = [
  { k: 'tujuan', label: 'Tujuan pemrosesan' },
  { k: 'subjekData', label: 'Subjek data', hint: 'Siapa pemilik datanya' },
  { k: 'kategoriData', label: 'Kategori data' },
  { k: 'dasarHukum', label: 'Dasar hukum', hint: 'Persetujuan / pelaksanaan layanan / kepentingan sah / kewajiban hukum' },
  { k: 'penerima', label: 'Penerima / pemroses (vendor)' },
  { k: 'transferLuarNegeri', label: 'Transfer ke luar negeri' },
  { k: 'retensi', label: 'Lama simpan' },
  { k: 'keamanan', label: 'Pengamanan' },
];

export default function ProcessingPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['compliance-processing'],
    queryFn: async () => (await apiClient.get<{ data: Activity[] }>('/admin/compliance/processing')).data.data,
  });
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);

  const save = useMutation({
    mutationFn: async ({ id, form }: { id: string | null; form: Form }) => {
      const body = { ...form, tinjauBerikutnya: form.tinjauBerikutnya || null };
      return id ? apiClient.put(`/admin/compliance/processing/${id}`, body) : apiClient.post('/admin/compliance/processing', body);
    },
    onSuccess: () => {
      toast.success('Tersimpan');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['compliance-processing'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan — lengkapi semua kolom'),
  });
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/compliance/processing/${id}`),
    onSuccess: () => {
      toast.success('Dihapus');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: ['compliance-processing'] });
    },
  });

  async function downloadPdf() {
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get('/admin/compliance/processing/print', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch {
      win?.close();
      toast.error('Gagal membuka PDF');
    }
  }

  const rows = q.data ?? [];
  const count = (l: Level) => rows.filter((r) => r.risikoSisa === l).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6" />
            Catatan Pemrosesan & Penilaian Risiko
          </h1>
          <p className="text-neutral-500 mt-1 max-w-3xl">
            Daftar kegiatan Els App yang memproses data pribadi jemaat (RoPA) beserta penilaian risikonya (DPIA). Tinjau minimal
            tiap 6 bulan atau saat ada fitur baru.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPdf} className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-rose-700 border border-rose-200 hover:bg-rose-50 rounded-lg">
            <FileDown className="w-4 h-4" /> Unduh PDF
          </button>
          <button
            onClick={() => setEditing({ id: null, form: { ...EMPTY, kode: `P-${String(rows.length + 1).padStart(2, '0')}`, urutan: rows.length + 1 } })}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Tambah aktivitas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Stat label="Aktivitas" value={rows.length} />
        <Stat label="Memuat data sensitif" value={rows.filter((r) => r.dataSensitif).length} />
        <Stat label="Risiko sisa sedang" value={count('SEDANG')} tone="amber" />
        <Stat label="Risiko sisa tinggi" value={count('TINGGI')} tone="red" />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        {q.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Kode</th>
                <th className="text-left px-4 py-2.5">Aktivitas</th>
                <th className="text-left px-4 py-2.5">Pemilik</th>
                <th className="text-left px-4 py-2.5">Luar negeri</th>
                <th className="text-left px-4 py-2.5">Risiko awal</th>
                <th className="text-left px-4 py-2.5">Risiko sisa</th>
                <th className="text-left px-4 py-2.5">Tinjau</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const awal = riskLevel(r.risikoKemungkinan, r.risikoDampak);
                return (
                  <tr key={r.id} className="border-t border-neutral-100 align-top">
                    <td className="px-4 py-2.5 font-mono text-xs">{r.kode}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-neutral-900">{r.nama}</div>
                      <div className="text-xs text-neutral-500 line-clamp-2">{r.tujuan}</div>
                      <div className="flex gap-1 mt-1">
                        {r.dataSensitif && <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-50 text-pink-700">Data sensitif</span>}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">{r.negara.join(' · ')}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700">{r.pemilik}</td>
                    <td className="px-4 py-2.5 text-xs text-neutral-600 max-w-[180px]">{r.transferLuarNegeri}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${LEVEL_CLS[awal]}`}>{awal}</span>
                      <div className="text-[10px] text-neutral-400 mt-0.5">{r.risikoKemungkinan} × {r.risikoDampak}</div>
                    </td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${LEVEL_CLS[r.risikoSisa]}`}>{r.risikoSisa}</span></td>
                    <td className="px-4 py-2.5 text-xs text-neutral-600">
                      {r.tinjauBerikutnya ? new Date(r.tinjauBerikutnya).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-right">
                      <button
                        onClick={() => {
                          const { id, updatedAt, ...form } = r;
                          void updatedAt;
                          setEditing({ id, form: { ...form, tinjauBerikutnya: r.tinjauBerikutnya?.slice(0, 10) ?? null } });
                        }}
                        className="p-1.5 text-neutral-500 hover:text-brand-600"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleting(r)} className="p-1.5 text-neutral-500 hover:text-red-600" title="Hapus">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="text-center text-neutral-400 py-10">Belum ada aktivitas.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditModal
          value={editing.form}
          isNew={!editing.id}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(form) => save.mutate({ id: editing.id, form })}
        />
      )}
      <ConfirmDelete
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="Hapus aktivitas ini?"
        itemName={deleting ? `${deleting.kode} ${deleting.nama}` : ''}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' | 'red' }) {
  const cls = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-neutral-900';
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function EditModal({ value, isNew, saving, onClose, onSave }: { value: Form; isNew: boolean; saving: boolean; onClose: () => void; onSave: (f: Form) => void }) {
  const [f, setF] = useState<Form>(value);
  const set = (p: Partial<Form>) => setF({ ...f, ...p });
  const awal = riskLevel(f.risikoKemungkinan, f.risikoDampak);
  const input = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <h2 className="text-lg font-bold">{isNew ? 'Tambah aktivitas' : `Edit ${value.kode}`}</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <label className="text-xs font-medium text-neutral-600 md:col-span-1">Kode<input className={input} value={f.kode} onChange={(e) => set({ kode: e.target.value })} /></label>
            <label className="text-xs font-medium text-neutral-600 md:col-span-3">Nama aktivitas<input className={input} value={f.nama} onChange={(e) => set({ nama: e.target.value })} /></label>
            <label className="text-xs font-medium text-neutral-600 md:col-span-2">Pemilik proses<input className={input} value={f.pemilik} onChange={(e) => set({ pemilik: e.target.value })} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="accent-orange-500" checked={f.dataSensitif} onChange={(e) => set({ dataSensitif: e.target.checked })} /> Memuat data sensitif (agama, anak, keuangan, kesehatan)</label>
            <span className="text-xs text-neutral-500">Negara:</span>
            {(['ID', 'MY', 'AU'] as Country[]).map((c) => (
              <label key={c} className="flex items-center gap-1">
                <input type="checkbox" className="accent-orange-500" checked={f.negara.includes(c)} onChange={(e) => set({ negara: e.target.checked ? [...f.negara, c] : f.negara.filter((x) => x !== c) })} />
                {c}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {TEXT_FIELDS.map((t) => (
              <label key={t.k} className="text-xs font-medium text-neutral-600">
                {t.label}
                {t.hint && <span className="text-neutral-400 font-normal"> — {t.hint}</span>}
                <textarea rows={3} className={input} value={String(f[t.k] ?? '')} onChange={(e) => set({ [t.k]: e.target.value } as Partial<Form>)} />
              </label>
            ))}
          </div>
          <div className="rounded-lg border border-orange-100 bg-orange-50/40 p-4 space-y-3">
            <div className="text-sm font-semibold text-neutral-900">Penilaian risiko</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <label className="text-xs font-medium text-neutral-600">Kemungkinan
                <select className={input} value={f.risikoKemungkinan} onChange={(e) => set({ risikoKemungkinan: Number(e.target.value) })}>
                  <option value={1}>1 — Jarang</option><option value={2}>2 — Mungkin</option><option value={3}>3 — Sering</option>
                </select>
              </label>
              <label className="text-xs font-medium text-neutral-600">Dampak
                <select className={input} value={f.risikoDampak} onChange={(e) => set({ risikoDampak: Number(e.target.value) })}>
                  <option value={1}>1 — Kecil</option><option value={2}>2 — Sedang</option><option value={3}>3 — Berat</option>
                </select>
              </label>
              <div className="text-xs text-neutral-600">Risiko awal<div className={`mt-1 text-center text-sm px-2 py-2 rounded-lg border font-semibold ${LEVEL_CLS[awal]}`}>{awal}</div></div>
              <label className="text-xs font-medium text-neutral-600">Risiko sisa (setelah mitigasi)
                <select className={input} value={f.risikoSisa} onChange={(e) => set({ risikoSisa: e.target.value as Level })}>
                  <option>RENDAH</option><option>SEDANG</option><option>TINGGI</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-xs font-medium text-neutral-600">Risiko utama<textarea rows={3} className={input} value={f.risiko} onChange={(e) => set({ risiko: e.target.value })} /></label>
              <label className="text-xs font-medium text-neutral-600">Mitigasi<textarea rows={3} className={input} value={f.mitigasi} onChange={(e) => set({ mitigasi: e.target.value })} /></label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <label className="text-xs font-medium text-neutral-600">Tinjau berikutnya<input type="date" className={input} value={f.tinjauBerikutnya ?? ''} onChange={(e) => set({ tinjauBerikutnya: e.target.value || null })} /></label>
              <label className="text-xs font-medium text-neutral-600">Urutan<input type="number" className={input} value={f.urutan} onChange={(e) => set({ urutan: Number(e.target.value) })} /></label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-100">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-neutral-100">Batal</button>
          <button onClick={() => onSave(f)} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-40">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
