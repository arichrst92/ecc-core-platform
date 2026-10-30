'use client';

/**
 * Compliance → SOP Kebocoran Data & Permintaan Hak atas Data per negara.
 * Konten markdown, bisa diedit & diunduh sebagai PDF (print view server).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileDown, Loader2, Save, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

type SopKey = 'SOP_BREACH' | 'SOP_DSR';
type Country = 'ID' | 'MY' | 'AU';

interface SopDoc {
  id: string;
  key: SopKey;
  country: Country;
  title: string;
  content: string;
  version: string;
  updatedAt: string;
}

const KEYS: { key: SopKey; label: string; hint: string }[] = [
  { key: 'SOP_BREACH', label: 'Kebocoran Data', hint: 'Langkah & batas waktu bila data jemaat bocor' },
  { key: 'SOP_DSR', label: 'Permintaan Data Jemaat', hint: 'Akses, salinan, koreksi, hapus, berhenti pesan' },
];
const COUNTRIES: { c: Country; label: string; deadline: Record<SopKey, string> }[] = [
  { c: 'ID', label: 'Indonesia', deadline: { SOP_BREACH: '3×24 jam', SOP_DSR: '3×24 jam' } },
  { c: 'MY', label: 'Malaysia', deadline: { SOP_BREACH: '72 jam', SOP_DSR: '21 hari' } },
  { c: 'AU', label: 'Australia', deadline: { SOP_BREACH: 'Secepatnya (≤30 hari menilai)', SOP_DSR: '30 hari' } },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ComplianceSopPage() {
  const [key, setKey] = useState<SopKey>('SOP_BREACH');
  const [country, setCountry] = useState<Country>('ID');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <ShieldAlert className="w-6 h-6" />
          SOP Compliance
        </h1>
        <p className="text-neutral-500 mt-1">
          Prosedur menangani kebocoran data & permintaan jemaat atas datanya, per negara. Edit sesuai tim Anda, lalu unduh
          sebagai PDF untuk dibagikan ke petugas.
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-neutral-200">
          {KEYS.map((k) => (
            <button
              key={k.key}
              onClick={() => setKey(k.key)}
              className={`flex-1 px-4 py-3 text-left border-b-2 transition ${
                key === k.key ? 'border-brand-500 bg-brand-50/30' : 'border-transparent hover:bg-neutral-50'
              }`}
            >
              <div className={`text-sm font-semibold ${key === k.key ? 'text-brand-700' : 'text-neutral-700'}`}>{k.label}</div>
              <div className="text-xs text-neutral-500">{k.hint}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-neutral-100 bg-neutral-50/50">
          <span className="text-xs text-neutral-500 mr-1">Negara:</span>
          {COUNTRIES.map((x) => (
            <button
              key={x.c}
              onClick={() => setCountry(x.c)}
              className={`px-3 py-1 text-xs font-medium rounded transition ${
                country === x.c ? 'bg-brand-500 text-white' : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {x.label}
              <span className="ml-1 opacity-75">· {x.deadline[key]}</span>
            </button>
          ))}
        </div>
        <SopEditor key={`${key}/${country}`} sopKey={key} country={country} />
      </div>
    </div>
  );
}

function SopEditor({ sopKey, country }: { sopKey: SopKey; country: Country }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['compliance-sop', sopKey, country],
    queryFn: async () => (await apiClient.get<{ data: SopDoc }>(`/admin/compliance/docs/${sopKey}/${country}`)).data.data,
    retry: false,
  });
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState(todayIso());
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data) {
      setTitle(q.data.title);
      setVersion(q.data.version);
      setContent(q.data.content);
      setDirty(false);
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () =>
      (await apiClient.put<{ data: SopDoc }>(`/admin/compliance/docs/${sopKey}/${country}`, { title, version, content })).data.data,
    onSuccess: (doc) => {
      toast.success('SOP tersimpan');
      qc.setQueryData(['compliance-sop', sopKey, country], doc);
      setDirty(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });

  async function downloadPdf() {
    if (dirty) {
      toast('Simpan dulu perubahan sebelum mengunduh PDF.');
      return;
    }
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get(`/admin/compliance/docs/${sopKey}/${country}/print`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch {
      win?.close();
      toast.error('Gagal membuka PDF');
    }
  }

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {q.isError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg">
          SOP ini belum ada. Isi lalu simpan untuk membuatnya.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Judul</label>
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Versi</label>
          <input
            value={version}
            onChange={(e) => { setVersion(e.target.value); setDirty(true); }}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono"
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-neutral-600">
            Isi SOP <span className="text-neutral-400">(markdown: # judul, **tebal**, - daftar, | tabel |)</span>
          </label>
          <span className="text-[11px] text-neutral-400">
            {q.data ? `Terakhir disimpan ${new Date(q.data.updatedAt).toLocaleString('id-ID')}` : ''}
          </span>
        </div>
        <textarea
          value={content}
          onChange={(e) => { setContent(e.target.value); setDirty(true); }}
          rows={26}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-[13px] font-mono leading-5"
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-neutral-100">
        <button
          onClick={downloadPdf}
          disabled={!q.data}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-rose-700 border border-rose-200 hover:bg-rose-50 rounded-lg disabled:opacity-40"
        >
          <FileDown className="w-4 h-4" />
          Unduh PDF
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending || title.trim().length < 3 || content.trim().length < 10}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-40"
        >
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan
        </button>
      </div>
    </div>
  );
}
