'use client';

/**
 * Tab Hasil Universal Form (2026-12): ringkasan per channel, saringan, tabel
 * respons, peserta event belum isi / perlu tindak lanjut, detail + tindakan admin.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Ban, CheckCircle2, Download, FileText, Loader2, Lock, RotateCcw, Search, Undo2, Wrench, X, XCircle } from 'lucide-react';
import { UF_FIX_DEFAULT_HOURS, UF_RESPONSE_STATUS_LABEL, UF_SOURCE_LABEL } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';
import { ExportButtons } from '@/components/report/report-ui';
import { RESP_BADGE, SOURCE_BADGE, SOURCE_HREF, errMsg, fmtWib, isoToWibInput, wibInputToIso } from './types';

type Channel = { sourceType: string | null; sourceId: string | null; judul: string; total: number; needsFix: number };
type Row = {
  id: string;
  status: string;
  statusAlasan: string | null;
  perbaikiSebelum: string | null;
  submittedAt: string;
  clientKind: string;
  appVersion: string | null;
  channel: { sourceType: string; sourceId: string; judul: string } | null;
  pengisi: { id: string; namaLengkap: string } | null;
  subjek: { id: string; namaLengkap: string; kode: string | null } | null;
  cabang: string | null;
  answers: Record<string, string>;
  files: { id: string; originalName: string; kind: string; mime: string; fieldId: string }[];
};
type Missing = {
  eventId: string;
  participationId: string;
  jemaatId: string;
  namaLengkap: string;
  kode: string | null;
  state: 'BELUM_ISI' | 'PERLU_DIPERBAIKI';
  paid: boolean;
  deadline: string | null;
  tindakLanjut: boolean;
};
type ResultData = {
  form: { id: string; judul: string; anonim: boolean };
  fields: { id: string; tipe: string; label: string; autofill: string | null; hidden: boolean }[];
  summary: { total: number; needsFix: number; rejected: number; missing: number; tindakLanjut: number; channels: Channel[] };
  missing: Missing[];
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
};

const srcLabel = (t?: string | null) => (t ? UF_SOURCE_LABEL[t as keyof typeof UF_SOURCE_LABEL] ?? t : 'Langsung');

export function ResultsTab({ formId, initialSource }: { formId: string; initialSource?: { sourceType?: string; sourceId?: string } }) {
  const [channel, setChannel] = useState(initialSource?.sourceId ? `${initialSource.sourceType}:${initialSource.sourceId}` : '');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const [sourceType, sourceId] = channel ? channel.split(':') : [undefined, undefined];
  const params = { sourceType, sourceId, status: status || undefined, q: dq || undefined };

  const res = useQuery({
    queryKey: ['uf-results', formId, channel, status, dq, page],
    queryFn: async () => (await apiClient.get<{ data: ResultData }>(`/admin/universal-form/${formId}/responses`, { params: { ...params, page } })).data.data,
    placeholderData: (p) => p,
  });
  useEffect(() => setPage(1), [channel, status, dq]);
  const d = res.data;
  const cols = (d?.fields ?? []).filter((f) => f.tipe !== 'INFO').slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Stat label="Respons" value={d?.summary.total} />
        <Stat label="Perlu diperbaiki" value={d?.summary.needsFix} tone="amber" onClick={() => setStatus('NEEDS_FIX')} />
        <Stat label="Ditolak" value={d?.summary.rejected} tone="red" onClick={() => setStatus('REJECTED')} />
        <Stat label="Peserta belum isi" value={d?.summary.missing} tone="sky" onClick={() => setShowMissing(true)} />
        <Stat label="Perlu tindak lanjut" value={d?.summary.tindakLanjut} tone="red" onClick={() => setShowMissing(true)} />
      </div>

      {d?.summary.channels.length ? (
        <div className="flex flex-wrap gap-2">
          {d.summary.channels.map((c) => {
            const k = `${c.sourceType}:${c.sourceId}`;
            const on = channel === k;
            return (
              <button
                key={k}
                onClick={() => setChannel(on ? '' : k)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm ${on ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'}`}
              >
                <span className={`px-1.5 rounded text-[11px] font-semibold ${SOURCE_BADGE[c.sourceType ?? ''] ?? 'bg-neutral-100'}`}>{srcLabel(c.sourceType)}</span>
                <span className="font-medium max-w-[220px] truncate">{c.judul}</span>
                <b>{c.total}</b>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-1 min-w-[180px] items-center gap-2 px-3 h-9 border border-neutral-300 rounded-lg bg-white">
          <Search className="w-4 h-4 text-neutral-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, kode, atau jawaban" className="text-sm outline-none w-full" />
        </label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 px-2 border border-neutral-300 rounded-lg text-sm bg-white">
          <option value="">Semua status</option>
          {Object.entries(UF_RESPONSE_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <ExportButtons endpoint={`/admin/universal-form/${formId}/export`} params={params} filename={`form-${formId.slice(0, 8)}`} />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {res.isLoading ? (
          <div className="py-14 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : !d?.rows.length ? (
          <div className="py-14 text-center text-sm text-neutral-500">Belum ada respons{channel || status || dq ? ' yang cocok dengan saringan' : ''}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500">
                <tr>
                  <th className="text-left font-medium px-3 py-2">{d.form.anonim ? 'Responden' : 'Peserta'}</th>
                  <th className="text-left font-medium px-3 py-2">Channel</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  {cols.map((c) => (
                    <th key={c.id} className="text-left font-medium px-3 py-2 max-w-[180px] truncate">
                      {c.label}
                    </th>
                  ))}
                  <th className="text-left font-medium px-3 py-2">Dikirim</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {d.rows.map((r) => (
                  <tr key={r.id} onClick={() => setOpen(r.id)} className="hover:bg-brand-50/40 cursor-pointer">
                    <td className="px-3 py-2">
                      {r.subjek ? (
                        <>
                          <div className="font-semibold text-neutral-900">{r.subjek.namaLengkap}</div>
                          <div className="text-[11px] text-neutral-500">
                            {[r.subjek.kode, r.cabang, r.pengisi && r.pengisi.id !== r.subjek.id ? `diisi ${r.pengisi.namaLengkap}` : null].filter(Boolean).join(' · ')}
                          </div>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-violet-700">
                          <Lock className="w-3 h-3" /> Anonim
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 rounded text-[11px] font-semibold ${SOURCE_BADGE[r.channel?.sourceType ?? ''] ?? 'bg-neutral-100'}`}>{srcLabel(r.channel?.sourceType)}</span>
                      <div className="text-[11px] text-neutral-500 max-w-[160px] truncate">
                        {r.channel?.judul ?? ''} · {r.clientKind === 'web' ? 'web' : 'app'}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${RESP_BADGE[r.status] ?? ''}`}>
                        {UF_RESPONSE_STATUS_LABEL[r.status as keyof typeof UF_RESPONSE_STATUS_LABEL] ?? r.status}
                      </span>
                    </td>
                    {cols.map((c) => (
                      <td key={c.id} className="px-3 py-2 text-neutral-700 max-w-[180px] truncate">
                        {r.answers[c.id] || <span className="text-neutral-300">—</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-xs text-neutral-500 whitespace-nowrap">{fmtWib(r.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d && d.total > d.pageSize ? (
          <div className="flex items-center justify-between px-3 py-2 border-t border-neutral-100 text-xs text-neutral-500">
            <span>
              {(d.page - 1) * d.pageSize + 1}–{Math.min(d.total, d.page * d.pageSize)} dari {d.total}
            </span>
            <div className="flex gap-1">
              <button disabled={d.page <= 1} onClick={() => setPage(d.page - 1)} className="px-2 py-1 rounded border border-neutral-200 disabled:opacity-40">
                Sebelumnya
              </button>
              <button disabled={d.page * d.pageSize >= d.total} onClick={() => setPage(d.page + 1)} className="px-2 py-1 rounded border border-neutral-200 disabled:opacity-40">
                Berikutnya
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {d?.missing.length ? (
        <div className="bg-white border border-neutral-200 rounded-xl">
          <button onClick={() => setShowMissing((x) => !x)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="font-semibold text-sm flex-1">
              Peserta event belum mengisi / belum memperbaiki ({d.missing.length})
              {d.summary.tindakLanjut ? <span className="text-red-600"> · {d.summary.tindakLanjut} perlu tindak lanjut</span> : null}
            </span>
            <span className="text-xs text-brand-600">{showMissing ? 'Sembunyikan' : 'Lihat'}</span>
          </button>
          {showMissing ? (
            <div className="border-t border-neutral-100 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Peserta</th>
                    <th className="text-left font-medium px-4 py-2">Keadaan</th>
                    <th className="text-left font-medium px-4 py-2">Batas</th>
                    <th className="text-left font-medium px-4 py-2">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {d.missing.map((m) => (
                    <tr key={m.participationId}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{m.namaLengkap}</div>
                        <div className="text-[11px] text-neutral-500">{m.kode}</div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.state === 'BELUM_ISI' ? 'bg-neutral-100 text-neutral-600' : 'bg-amber-50 text-amber-700'}`}>
                          {m.state === 'BELUM_ISI' ? 'Belum isi' : 'Perlu diperbaiki'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-600">{fmtWib(m.deadline)}</td>
                      <td className="px-4 py-2 text-xs">
                        {m.tindakLanjut ? (
                          <span className="text-red-700 font-semibold">
                            Perlu tindak lanjut — event berbayar, lewat batas.{' '}
                            <Link href={`/dashboard/event/${m.eventId}`} className="underline">
                              Buka event
                            </Link>
                          </span>
                        ) : m.paid ? (
                          <span className="text-neutral-500">Event berbayar — tidak dibatalkan otomatis</span>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {open ? <ResponseDrawer formId={formId} rid={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value?: number; tone?: 'amber' | 'red' | 'sky'; onClick?: () => void }) {
  const c = tone === 'amber' ? 'text-amber-700' : tone === 'red' ? 'text-red-700' : tone === 'sky' ? 'text-sky-700' : 'text-neutral-900';
  return (
    <button onClick={onClick} disabled={!onClick} className="text-left bg-white border border-neutral-200 rounded-xl px-3 py-2.5 hover:border-brand-200 disabled:hover:border-neutral-200">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className={`text-xl font-bold ${c}`}>{value ?? '–'}</div>
    </button>
  );
}

// ------------------------------------------------------------------ detail

type Detail = {
  id: string;
  status: string;
  statusLabel: string;
  statusAlasan: string | null;
  perbaikiSebelum: string | null;
  submittedAt: string;
  updatedAt: string;
  editCount: number;
  clientKind: string;
  appVersion: string | null;
  jawabanHash: string;
  channel: { sourceType: string; sourceId: string; judul: string } | null;
  anonim: boolean;
  pengisi: { id: string; namaLengkap: string; kode: string | null; cabang: { nama: string } | null } | null;
  subjek: { id: string; namaLengkap: string; kode: string | null; cabang: { nama: string } | null } | null;
  participation: { id: string; status: string; payment: string } | null;
  items: {
    fieldId: string;
    tipe: string;
    label: string;
    gaya: string | null;
    isi: string | null;
    autofill: string | null;
    autofillLabel: string | null;
    text: string;
    files: { id: string; originalName: string; mime: string; sizeBytes: number; kind: string; meta: Record<string, unknown> | null }[];
  }[];
};

async function fileBlob(id: string) {
  const r = await apiClient.get(`/admin/universal-form/files/${id}`, { responseType: 'blob', params: { inline: 1 } });
  return URL.createObjectURL(r.data as Blob);
}

function FileThumb({ f }: { f: Detail['items'][number]['files'][number] }) {
  const [url, setUrl] = useState<string | null>(null);
  const img = f.mime.startsWith('image/') && !/heic|heif/.test(f.mime);
  useEffect(() => {
    let u: string | null = null;
    if (img) void fileBlob(f.id).then((x) => setUrl((u = x)), () => {});
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [f.id, img]);
  async function download() {
    try {
      const u = await fileBlob(f.id);
      const a = document.createElement('a');
      a.href = u;
      a.download = f.originalName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 20_000);
    } catch (e) {
      toast.error(errMsg(e, 'File tidak bisa diunduh'));
    }
  }
  return (
    <div className="flex items-center gap-2 border border-neutral-200 rounded-lg p-2 bg-white">
      {img && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={f.kind === 'SIGNATURE' ? 'h-16 w-auto bg-white' : 'h-14 w-14 object-cover rounded'} />
      ) : (
        <FileText className="w-8 h-8 text-neutral-400" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">{f.kind === 'SIGNATURE' ? 'Tanda tangan' : f.originalName}</div>
        <div className="text-[11px] text-neutral-500">{(f.sizeBytes / 1024).toFixed(0)} KB</div>
        {f.kind === 'SIGNATURE' && f.meta ? (
          <div className="text-[10px] text-neutral-500">
            {String(f.meta.signerName ?? '')} · {fmtWib(String(f.meta.signedAt ?? ''))}
          </div>
        ) : null}
      </div>
      <button onClick={download} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500" title="Unduh">
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
}

function ResponseDrawer({ formId, rid, onClose }: { formId: string; rid: string; onClose: () => void }) {
  const qc = useQueryClient();
  const det = useQuery({
    queryKey: ['uf-response', rid],
    queryFn: async () => (await apiClient.get<{ data: Detail }>(`/admin/universal-form/${formId}/responses/${rid}`)).data.data,
  });
  const [action, setAction] = useState<null | 'NEEDS_FIX' | 'REJECT' | 'CANCEL_REGISTRATION'>(null);
  const [alasan, setAlasan] = useState('');
  const [sebelum, setSebelum] = useState(isoToWibInput(new Date(Date.now() + UF_FIX_DEFAULT_HOURS * 3600_000).toISOString()));
  const review = useMutation({
    mutationFn: async (a: 'NEEDS_FIX' | 'REJECT' | 'CANCEL_REGISTRATION' | 'RESTORE') =>
      apiClient.post(`/admin/universal-form/${formId}/responses/${rid}/review`, {
        action: a,
        alasan: a === 'RESTORE' ? null : alasan,
        perbaikiSebelum: a === 'NEEDS_FIX' ? wibInputToIso(sebelum) : null,
      }),
    onSuccess: (_r, a) => {
      toast.success(a === 'RESTORE' ? 'Dipulihkan' : a === 'NEEDS_FIX' ? 'Permintaan perbaikan dikirim' : a === 'REJECT' ? 'Jawaban ditolak' : 'Pendaftaran dibatalkan');
      setAction(null);
      setAlasan('');
      qc.invalidateQueries({ queryKey: ['uf-response', rid] });
      qc.invalidateQueries({ queryKey: ['uf-results', formId] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const d = det.data;
  const isEvent = d?.channel?.sourceType === 'EVENT';
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-neutral-100 px-4 py-3 flex items-center gap-2 z-10">
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-neutral-900 truncate">{d ? (d.subjek?.namaLengkap ?? 'Responden anonim') : 'Memuat…'}</div>
            {d ? (
              <div className="text-xs text-neutral-500">
                {srcLabel(d.channel?.sourceType)}: {d.channel?.judul ?? '—'} · {fmtWib(d.submittedAt)}
                {d.editCount ? ` · diubah ${d.editCount}×` : ''}
              </div>
            ) : null}
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
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${RESP_BADGE[d.status] ?? ''}`}>{d.statusLabel}</span>
              {d.pengisi && d.subjek && d.pengisi.id !== d.subjek.id ? <span className="text-xs text-neutral-500">Diisi oleh {d.pengisi.namaLengkap}</span> : null}
              {d.participation ? (
                <span className="text-xs text-neutral-500">
                  Pendaftaran: {d.participation.status} · {d.participation.payment === 'LUNAS' ? 'Lunas' : d.participation.payment === 'GRATIS' ? 'Gratis' : d.participation.payment}
                </span>
              ) : null}
              {d.channel ? (
                <Link href={SOURCE_HREF[d.channel.sourceType]?.(d.channel.sourceId) ?? '#'} className="text-xs text-brand-600 hover:underline">
                  Buka konten
                </Link>
              ) : null}
            </div>
            {d.statusAlasan ? (
              <div className={`rounded-lg p-3 text-sm ${d.status === 'NEEDS_FIX' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-900'}`}>
                <b>Alasan:</b> {d.statusAlasan}
                {d.perbaikiSebelum ? <div className="text-xs mt-0.5">Perbaiki sebelum {fmtWib(d.perbaikiSebelum)}</div> : null}
              </div>
            ) : null}

            <div className="space-y-3">
              {d.items.map((it) =>
                it.tipe === 'INFO' ? null : (
                  <div key={it.fieldId} className="border-b border-neutral-100 pb-2">
                    <div className="text-xs text-neutral-500 flex items-center gap-1">
                      {it.label}
                      {it.autofill ? (
                        <span className="inline-flex items-center gap-0.5 text-sky-700">
                          <Lock className="w-3 h-3" /> {it.autofillLabel}
                        </span>
                      ) : null}
                    </div>
                    {it.files.length ? (
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {it.files.map((f) => (
                          <FileThumb key={f.id} f={f} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-neutral-900 whitespace-pre-wrap break-words">{it.text || <span className="text-neutral-300">—</span>}</div>
                    )}
                    {it.tipe === 'SIGNATURE' && it.isi ? <div className="text-[11px] text-neutral-500 mt-1 italic">Pernyataan: {it.isi}</div> : null}
                  </div>
                ),
              )}
            </div>

            <div className="text-[11px] text-neutral-400 break-all">
              Lewat {d.clientKind === 'web' ? 'Els App web' : `app ${d.appVersion ?? ''}`} · Sidik isi (SHA-256): {d.jawabanHash}
            </div>

            {/* tindakan */}
            <div className="border-t border-neutral-100 pt-3 space-y-2">
              <div className="text-xs font-semibold text-neutral-500">Tindakan</div>
              {action ? (
                <div className="space-y-2 bg-neutral-50 rounded-lg p-3">
                  <div className="text-sm font-semibold">
                    {action === 'NEEDS_FIX' ? 'Minta perbaiki' : action === 'REJECT' ? 'Tolak jawaban' : 'Batalkan pendaftaran event'}
                  </div>
                  {action === 'CANCEL_REGISTRATION' && d.participation?.payment === 'LUNAS' ? (
                    <p className="text-xs text-red-700">Peserta ini sudah lunas — urus pengembalian dana sesuai kebijakan event.</p>
                  ) : null}
                  <textarea
                    rows={3}
                    value={alasan}
                    onChange={(e) => setAlasan(e.target.value)}
                    placeholder="Alasan (dikirim ke jemaat)"
                    className="w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm"
                  />
                  {action === 'NEEDS_FIX' ? (
                    <label className="block">
                      <span className="text-xs text-neutral-600">Perbaiki sebelum (WIB)</span>
                      <input type="datetime-local" value={sebelum} onChange={(e) => setSebelum(e.target.value)} className="mt-0.5 w-full px-2 py-1.5 border border-neutral-300 rounded-lg text-sm" />
                      <span className="text-[11px] text-neutral-400">Tidak melewati batas pengisian. Lewat batas & belum diperbaiki → pendaftaran dibatalkan bila batal otomatis aktif.</span>
                    </label>
                  ) : null}
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setAction(null)} className="px-3 py-1.5 text-sm rounded-lg hover:bg-neutral-100">
                      Batal
                    </button>
                    <button
                      disabled={alasan.trim().length < 3 || review.isPending}
                      onClick={() => review.mutate(action)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50 ${action === 'NEEDS_FIX' ? 'bg-amber-600' : 'bg-red-600'}`}
                    >
                      {review.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Kirim
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {d.status !== 'NEEDS_FIX' ? (
                    <button onClick={() => setAction('NEEDS_FIX')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 text-sm font-semibold hover:bg-amber-50">
                      <Wrench className="w-4 h-4" /> Minta perbaiki
                    </button>
                  ) : null}
                  {d.status !== 'REJECTED' ? (
                    <button onClick={() => setAction('REJECT')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50">
                      <XCircle className="w-4 h-4" /> Tolak
                    </button>
                  ) : null}
                  {isEvent && d.participation && d.participation.status !== 'BATAL' ? (
                    <button onClick={() => setAction('CANCEL_REGISTRATION')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 text-red-800 text-sm font-semibold hover:bg-red-50">
                      <Ban className="w-4 h-4" /> Batalkan pendaftaran
                    </button>
                  ) : null}
                  {d.status !== 'SUBMITTED' ? (
                    <button
                      onClick={() => review.mutate('RESTORE')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 text-sm font-semibold hover:bg-emerald-50"
                    >
                      <Undo2 className="w-4 h-4" /> Pulihkan
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Diterima
                    </span>
                  )}
                </div>
              )}
              {d.participation?.status === 'BATAL' ? (
                <p className="text-xs text-red-700 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Pendaftaran event peserta ini sudah dibatalkan.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
