'use client';

/**
 * Data Anak (CKids) — anak di bawah 13 tahun. Hanya data untuk pelayanan
 * anak: QR, foto, usia, ulang tahun, orang tua/wali, jumlah hadir ibadah anak.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import Link from 'next/link';
import { Baby, Cake, ChevronLeft, ChevronRight, FileText, Loader2, QrCode, Search, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { resolveMediaUrl } from '@/lib/media-url';
import { usePersistentState } from '@/lib/use-persistent-state';

interface Anak {
  id: string;
  namaLengkap: string;
  kode: string | null;
  fotoUrl: string | null;
  jenisKelamin: 'L' | 'P' | null;
  isTamu: boolean;
  cabang: { id: string; nama: string } | null;
  tanggalLahir: string | null;
  usia: number | null;
  orangTua: { id: string; nama: string; hubungan: string }[];
  jumlahHadir: number;
}
interface Meta {
  page: number;
  total: number;
  totalPages: number;
  dari: string;
  sampai: string;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const PRESET = [
  { v: '30', l: '30 hari' },
  { v: '90', l: '3 bulan' },
  { v: 'tahun', l: 'Tahun ini' },
  { v: 'custom', l: 'Pilih tanggal' },
] as const;
type Preset = (typeof PRESET)[number]['v'];

function rangeOf(p: Preset, dari: string, sampai: string): { dari: string; sampai: string } {
  const now = new Date();
  if (p === 'custom') return { dari, sampai };
  if (p === 'tahun') return { dari: `${now.getFullYear()}-01-01`, sampai: ymd(now) };
  const d = new Date(now);
  d.setDate(d.getDate() - (Number(p) - 1));
  return { dari: ymd(d), sampai: ymd(now) };
}
const fmtUltah = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' }) : '—';
const fmtTgl = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const qrSrc = (kode: string, size: number) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=4&data=${encodeURIComponent(kode)}`;

export default function DataAnakPage() {
  // Filter & halaman disimpan (sessionStorage) — tetap sama saat pindah menu lalu kembali.
  const [cabangId, setCabangId] = usePersistentState('data-anak:cabang', '');
  const [searchIn, setSearchIn] = usePersistentState('data-anak:search', '');
  const [search, setSearch] = useState(searchIn.trim());
  const [preset, setPreset] = usePersistentState<Preset>('data-anak:preset', '90');
  const [cDari, setCDari] = usePersistentState('data-anak:dari', rangeOf('90', '', '').dari);
  const [cSampai, setCSampai] = usePersistentState('data-anak:sampai', ymd(new Date()));
  const [page, setPage] = usePersistentState('data-anak:page', 1);
  const [qrOf, setQrOf] = useState<Anak | null>(null);
  const [opening, setOpening] = useState<'pdf' | 'qr' | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchIn.trim()), 300);
    return () => clearTimeout(t);
  }, [searchIn]);
  // Filter berubah → kembali ke halaman 1 (bukan saat halaman pertama kali dibuka).
  const filterKey = JSON.stringify([cabangId, search, preset, cDari, cSampai]);
  const lastKey = useRef(filterKey);
  useEffect(() => {
    if (lastKey.current !== filterKey) {
      lastKey.current = filterKey;
      setPage(1);
    }
  }, [filterKey, setPage]);

  const range = rangeOf(preset, cDari, cSampai);

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () =>
      (await apiClient.get<{ data: { id: string; nama: string }[] }>('/admin/cabang', {
        params: { limit: 100, sortBy: 'nama', sortOrder: 'asc' },
      })).data.data,
    staleTime: 300_000,
  });

  const q = useQuery({
    queryKey: ['data-anak', cabangId, search, range.dari, range.sampai, page],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (
        await apiClient.get<{ data: Anak[]; meta: Meta }>('/admin/data-anak', {
          params: { cabangId: cabangId || undefined, search: search || undefined, dari: range.dari, sampai: range.sampai, page, limit: 25 },
        })
      ).data,
  });
  const rows = q.data?.data ?? [];

  // Laporan PDF / lembar QR: semua hasil filter (bukan hanya halaman ini).
  async function openPrint(kind: 'pdf' | 'qr') {
    const win = window.open('', '_blank'); // buka sinkron supaya tidak diblok popup blocker
    setOpening(kind);
    try {
      const res = await apiClient.get(kind === 'pdf' ? '/admin/data-anak/export' : '/admin/data-anak/qr', {
        params: { cabangId: cabangId || undefined, search: search || undefined, dari: range.dari, sampai: range.sampai },
        responseType: 'blob',
        timeout: 120_000,
      });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      if (win) win.close();
      alert(kind === 'pdf' ? 'Gagal membuat laporan. Coba lagi.' : 'Gagal membuat lembar QR. Coba lagi.');
    } finally {
      setOpening(null);
    }
  }
  const meta = q.data?.meta;
  const sel = 'h-9 rounded-lg border border-neutral-300 bg-white px-2.5 text-sm';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center">
            <Baby className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Data Anak</h1>
            <p className="text-sm text-neutral-500">
              Anak di bawah 13 tahun · jumlah hadir dihitung dari check-in di ibadah anak dalam periode.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openPrint('qr')}
            disabled={!!opening || !meta?.total}
            title="Lembar A4 berisi QR 3×3 cm + nama anak, dengan garis potong. Mengikuti filter."
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
          >
            {opening === 'qr' ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
            Cetak QR
          </button>
          <button
            onClick={() => openPrint('pdf')}
            disabled={!!opening}
            title="Laporan sesuai filter. Pilih “Save as PDF” saat dialog cetak terbuka."
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-rose-200 bg-white text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
          >
            {opening === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Export PDF
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 bg-white border border-neutral-200 rounded-xl p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchIn}
            onChange={(e) => setSearchIn(e.target.value)}
            placeholder="Cari nama atau kode anak…"
            className="w-full h-9 pl-9 pr-3 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={sel}>
          <option value="">Semua cabang</option>
          {(cabangQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
          {PRESET.map((p) => (
            <button
              key={p.v}
              onClick={() => setPreset(p.v)}
              className={`px-2.5 h-8 text-sm rounded-md ${preset === p.v ? 'bg-brand-500 text-white font-medium' : 'text-neutral-600 hover:bg-neutral-50'}`}
            >
              {p.l}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="flex items-center gap-1 text-sm text-neutral-500">
            <input type="date" value={cDari} max={cSampai} onChange={(e) => setCDari(e.target.value)} className={sel} />–
            <input type="date" value={cSampai} min={cDari} onChange={(e) => setCSampai(e.target.value)} className={sel} />
          </div>
        ) : null}
      </div>

      <div className="text-xs text-neutral-500">
        {meta ? (
          <>
            <strong className="text-neutral-800">{meta.total.toLocaleString('id-ID')}</strong> anak · periode hadir{' '}
            {fmtTgl(meta.dari)} – {fmtTgl(meta.sampai)}
          </>
        ) : null}
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-3 py-2.5 text-left w-16">QR</th>
              <th className="px-3 py-2.5 text-left">Anak</th>
              <th className="px-3 py-2.5 text-left w-20">Usia</th>
              <th className="px-3 py-2.5 text-left w-36">Ulang tahun</th>
              <th className="px-3 py-2.5 text-left">Orang tua / Wali</th>
              <th className="px-3 py-2.5 text-right w-28">Hadir ibadah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {q.isLoading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <Loader2 className="w-5 h-5 animate-spin text-neutral-400 inline" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-neutral-400">
                  Tidak ada anak yang cocok.
                </td>
              </tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    {a.kode ? (
                      <button onClick={() => setQrOf(a)} title="Perbesar QR" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrSrc(a.kode, 96)} alt={`QR ${a.kode}`} className="w-11 h-11 rounded border border-neutral-200" loading="lazy" />
                      </button>
                    ) : (
                      <span className="text-neutral-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {a.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveMediaUrl(a.fotoUrl)} alt="" className="w-10 h-10 rounded-full object-cover border border-neutral-200 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-pink-100 text-pink-700 flex items-center justify-center font-semibold shrink-0">
                          {a.namaLengkap.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link href={`/dashboard/jemaat/${a.id}`} className="font-medium text-brand-600 hover:underline truncate block">
                          {a.namaLengkap}
                        </Link>
                        <div className="text-[11px] text-neutral-500 truncate">
                          {[a.kode, a.cabang?.nama].filter(Boolean).join(' · ')}
                          {a.isTamu ? <span className="ml-1 px-1 rounded bg-violet-100 text-violet-700">Tamu</span> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-neutral-800">{a.usia != null ? `${a.usia} th` : '—'}</td>
                  <td className="px-3 py-2 text-neutral-800">
                    <span className="inline-flex items-center gap-1">
                      <Cake className="w-3.5 h-3.5 text-pink-400" />
                      {fmtUltah(a.tanggalLahir)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {a.orangTua.length === 0 ? (
                      <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Belum terhubung</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {a.orangTua.map((o) => (
                          <Link
                            key={o.id}
                            href={`/dashboard/jemaat/${o.id}`}
                            className="text-xs bg-neutral-100 hover:bg-neutral-200 text-neutral-800 px-2 py-0.5 rounded-full"
                          >
                            {o.nama} <span className="text-neutral-500">· {o.hubungan}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-bold ${a.jumlahHadir > 0 ? 'text-pink-700' : 'text-neutral-300'}`}>{a.jumlahHadir}×</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-neutral-300 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-neutral-600">
            {page} / {meta.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            disabled={page >= meta.totalPages}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-neutral-300 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      ) : null}

      {qrOf?.kode ? (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setQrOf(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-xs text-center pointer-events-auto relative">
              <button onClick={() => setQrOf(null)} className="absolute right-3 top-3 p-1 rounded hover:bg-neutral-100">
                <X className="w-4 h-4" />
              </button>
              <div className="font-semibold text-neutral-900 pr-6">{qrOf.namaLengkap}</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc(qrOf.kode, 300)} alt={`QR ${qrOf.kode}`} className="w-56 h-56 mx-auto my-3" />
              <div className="font-mono tracking-widest text-lg font-bold">{qrOf.kode}</div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
