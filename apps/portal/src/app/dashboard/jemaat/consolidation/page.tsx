'use client';

/**
 * Konsolidasi data jemaat dari spreadsheet (rekap manual Shiftsoft).
 * Alur: upload .xlsx → preview (pencocokan ke DB + diff) → human check per
 * baris / field / homecell / ministry → Apply → laporan hasil.
 * Backend: /admin/jemaat-consolidation/{preview,apply} (Fulltimer only).
 */
import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

// ---------- Tipe respons ----------
type MatchStatus = 'MATCHED' | 'CONFLICT' | 'NAME_ONLY' | 'NOT_FOUND';
const FIELDS = ['noHp', 'email', 'alamat', 'statusPernikahan', 'tanggalBergabungGereja'] as const;
type Field = (typeof FIELDS)[number];
const FIELD_LABEL: Record<Field, string> = {
  noHp: 'No HP',
  email: 'Email',
  alamat: 'Alamat',
  statusPernikahan: 'Status Nikah',
  tanggalBergabungGereja: 'Bergabung Sejak',
};

interface Candidate {
  id: string;
  kode: string | null;
  namaLengkap: string;
  email: string | null;
  noHp: string | null;
  alamat: string | null;
  statusPernikahan: string | null;
  tanggalBergabungGereja: string | null;
  cabang: string;
  cabangSama: boolean;
  via?: string[];
}
interface Row {
  rowNo: number;
  kode: string | null;
  nama: string;
  noHp: string | null;
  email: string | null;
  alamat: string | null;
  area: string | null;
  homecell: string | null;
  ministry: string | null;
  statusPernikahan: string | null;
  tanggalBergabungGereja: string | null;
  match: { status: MatchStatus; jemaatId: string | null; candidates: Candidate[] };
}
interface LeaderPlan {
  nama: string;
  existingId: string | null;
  existingPicJemaatId: string | null;
  leaderNama: string | null;
  leaderCandidates: Candidate[];
  memberCount: number;
}
interface Preview {
  sheetNames: string[];
  sheet: string;
  missingColumns: string[];
  cabang: { id: string; nama: string } | null;
  rows: Row[];
  areas: LeaderPlan[];
  homecells: (LeaderPlan & { areaNama: string | null })[];
  ministries: { sheetNama: string; suggestedPelayananId: string | null; memberCount: number }[];
  pelayananOptions: { id: string; nama: string }[];
}
interface ApplyResult {
  summary: Record<string, number>;
  results: { rowNo: number; jemaatId: string; ok: boolean; changes: string[]; error?: string }[];
}

// ---------- Diff di client (kandidat bisa diganti admin) ----------
const norm = (f: Field, v: string | null) => {
  if (!v) return null;
  if (f === 'noHp') {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    return d || null;
  }
  if (f === 'tanggalBergabungGereja') return v.slice(0, 10);
  return v.trim().toLowerCase().replace(/\s+/g, ' ') || null;
};
type DiffState = 'same' | 'fill' | 'differ' | 'none';
function diff(f: Field, sheet: string | null, cur: string | null): DiffState {
  const a = norm(f, sheet);
  const b = norm(f, cur);
  if (!a) return 'none';
  if (!b) return 'fill';
  return a === b ? 'same' : 'differ';
}
const validSheetValue = (f: Field, v: string | null) =>
  !!v && (f !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) && (f !== 'noHp' || v.length >= 8);

interface RowChoice {
  jemaatId: string | null; // null = skip baris
  fields: Field[]; // field yang diambil dari sheet
}
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_STYLE: Record<MatchStatus, string> = {
  MATCHED: 'bg-green-100 text-green-700',
  CONFLICT: 'bg-red-100 text-red-700',
  NAME_ONLY: 'bg-amber-100 text-amber-700',
  NOT_FOUND: 'bg-neutral-200 text-neutral-600',
};

export default function JemaatConsolidationPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<Preview | null>(null);
  const [tab, setTab] = useState<'data' | 'homecell' | 'ministry' | 'apply'>('data');
  const [filter, setFilter] = useState<'all' | 'review' | 'changes'>('review');
  const [q, setQ] = useState('');
  const [choices, setChoices] = useState<Record<number, RowChoice>>({});
  const [areaPic, setAreaPic] = useState<Record<string, string | null>>({});
  const [hcPic, setHcPic] = useState<Record<string, string | null>>({});
  const [ministry, setMinistry] = useState<Record<string, string>>({}); // 'skip' | 'create:<nama>' | pelayananId
  const [result, setResult] = useState<ApplyResult | null>(null);

  const candById = useMemo(() => {
    const m = new Map<string, Candidate>();
    data?.rows.forEach((r) => r.match.candidates.forEach((c) => m.set(c.id, c)));
    return m;
  }, [data]);

  const hcKey = (area: string | null, nama: string) => `${area ?? ''}|${nama}`;

  function initDecisions(p: Preview) {
    const ch: Record<number, RowChoice> = {};
    for (const r of p.rows) {
      const target = r.match.status === 'MATCHED' ? r.match.candidates[0] : undefined;
      ch[r.rowNo] = {
        jemaatId: target?.id ?? null,
        // Default: isi field yang kosong di production; yang beda tetap production.
        fields: target ? FIELDS.filter((f) => diff(f, r[f], target[f]) === 'fill' && validSheetValue(f, r[f])) : [],
      };
    }
    setChoices(ch);
    const pick = (l: LeaderPlan) => l.existingPicJemaatId ?? l.leaderCandidates.find((c) => c.cabangSama)?.id ?? l.leaderCandidates[0]?.id ?? null;
    setAreaPic(Object.fromEntries(p.areas.map((a) => [a.nama, pick(a)])));
    setHcPic(Object.fromEntries(p.homecells.map((h) => [hcKey(h.areaNama, h.nama), pick(h)])));
    setMinistry(
      Object.fromEntries(
        p.ministries.map((m) => [m.sheetNama, m.suggestedPelayananId ?? `create:${titleCase(m.sheetNama)}`]),
      ),
    );
  }

  const previewMut = useMutation({
    mutationFn: async ({ f, sheet }: { f: File; sheet?: string }) => {
      const fd = new FormData();
      fd.append('file', f);
      const res = await apiClient.post<{ data: Preview }>('/admin/jemaat-consolidation/preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: sheet ? { sheet } : undefined,
        timeout: 120_000,
      });
      return res.data.data;
    },
    onSuccess: (p) => {
      setData(p);
      setResult(null);
      setTab('data');
      if (p.missingColumns.length) toast.error(`Kolom wajib tidak ada: ${p.missingColumns.join(', ')}`);
      else initDecisions(p);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal membaca file'),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!data?.cabang) throw new Error('Cabang tidak diketahui');
      const rows = data.rows
        .filter((r) => choices[r.rowNo]?.jemaatId)
        .map((r) => {
          const c = choices[r.rowNo]!;
          const updates: Record<string, string> = {};
          for (const f of c.fields) if (r[f]) updates[f] = r[f]!;
          return { rowNo: r.rowNo, jemaatId: c.jemaatId!, updates, area: r.area, homecell: r.homecell, ministry: r.ministry };
        });
      const ministryMap: Record<string, { pelayananId: string } | { createNama: string } | null> = {};
      for (const [k, v] of Object.entries(ministry)) {
        ministryMap[k] = v === 'skip' ? null : v.startsWith('create:') ? { createNama: v.slice(7).trim() } : { pelayananId: v };
      }
      const res = await apiClient.post<{ data: ApplyResult }>(
        '/admin/jemaat-consolidation/apply',
        {
          cabangId: data.cabang.id,
          rows,
          areas: data.areas.map((a) => ({ nama: a.nama, picJemaatId: areaPic[a.nama] ?? null })),
          homecells: data.homecells
            .filter((h) => h.areaNama)
            .map((h) => ({ nama: h.nama, areaNama: h.areaNama!, picJemaatId: hcPic[hcKey(h.areaNama, h.nama)] ?? null })),
          ministryMap,
        },
        { timeout: 300_000 },
      );
      return res.data.data;
    },
    onSuccess: (r) => {
      setResult(r);
      const failed = r.results.filter((x) => !x.ok).length;
      if (failed) toast.error(`${failed} baris gagal — lihat laporan`);
      else toast.success('Konsolidasi selesai');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? err.message ?? 'Gagal apply'),
  });

  // ---------- Ringkasan ----------
  const stats = useMemo(() => {
    const s = { total: 0, MATCHED: 0, CONFLICT: 0, NAME_ONLY: 0, NOT_FOUND: 0, included: 0, fieldChanges: 0 };
    if (!data) return s;
    for (const r of data.rows) {
      s.total++;
      s[r.match.status]++;
      const c = choices[r.rowNo];
      if (c?.jemaatId) {
        s.included++;
        s.fieldChanges += c.fields.length;
      }
    }
    return s;
  }, [data, choices]);

  const dupTargets = useMemo(() => {
    const seen = new Map<string, number>();
    Object.values(choices).forEach((c) => c.jemaatId && seen.set(c.jemaatId, (seen.get(c.jemaatId) ?? 0) + 1));
    return new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));
  }, [choices]);

  const visibleRows = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (needle && !`${r.nama} ${r.email ?? ''} ${r.noHp ?? ''}`.toLowerCase().includes(needle)) return false;
      if (filter === 'review') {
        const c = choices[r.rowNo];
        const target = c?.jemaatId ? candById.get(c.jemaatId) : undefined;
        return (
          r.match.status !== 'MATCHED' ||
          (target && !target.cabangSama) ||
          (target && FIELDS.some((f) => diff(f, r[f], target[f]) === 'differ'))
        );
      }
      if (filter === 'changes') return (choices[r.rowNo]?.fields.length ?? 0) > 0;
      return true;
    });
  }, [data, filter, q, choices, candById]);

  function setRow(rowNo: number, patch: Partial<RowChoice>) {
    setChoices((p) => ({ ...p, [rowNo]: { ...p[rowNo]!, ...patch } }));
  }
  function pickCandidate(r: Row, id: string | null) {
    const t = id ? candById.get(id) : undefined;
    setRow(r.rowNo, {
      jemaatId: id,
      fields: t ? FIELDS.filter((f) => diff(f, r[f], t[f]) === 'fill' && validSheetValue(f, r[f])) : [],
    });
  }
  function toggleField(rowNo: number, f: Field, useSheet: boolean) {
    const c = choices[rowNo]!;
    setRow(rowNo, { fields: useSheet ? [...new Set([...c.fields, f])] : c.fields.filter((x) => x !== f) });
  }

  // ====================================================================
  return (
    <div>
      <Link href="/dashboard/jemaat" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 mb-3">
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar jemaat
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-900">Konsolidasi Data Jemaat</h1>
        <p className="text-neutral-500 mt-1 text-sm">
          Cocokkan rekap spreadsheet dengan data production, cek perbedaan, lalu terapkan yang dipilih saja. Kolom Role
          diabaikan — semua jemaat yang di-apply dijadikan <b>Jemaat Tetap</b>.
        </p>
      </div>

      {/* Upload */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFile(f);
            previewMut.mutate({ f });
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={previewMut.isPending || applyMut.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
        >
          {previewMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {file ? 'Ganti File' : 'Pilih File .xlsx'}
        </button>
        {file && (
          <span className="inline-flex items-center gap-1 text-sm text-neutral-700">
            <FileSpreadsheet className="w-4 h-4 text-green-600" /> {file.name}
          </span>
        )}
        {data && (
          <label className="text-sm text-neutral-600 flex items-center gap-2">
            Sheet
            <select
              value={data.sheet}
              onChange={(e) => file && previewMut.mutate({ f: file, sheet: e.target.value })}
              className="border border-neutral-300 rounded-lg px-2 py-1 text-sm"
            >
              {data.sheetNames.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {data?.cabang && <span className="text-sm text-neutral-600">Cabang: <b>{data.cabang.nama}</b></span>}
      </div>

      {data && !data.missingColumns.length && !result && (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            <Stat label="Baris sheet" value={stats.total} />
            <Stat label="Cocok" value={stats.MATCHED} tone="green" />
            <Stat label="Konflik" value={stats.CONFLICT} tone="red" />
            <Stat label="Nama saja / tidak ada" value={stats.NAME_ONLY + stats.NOT_FOUND} tone="amber" />
            <Stat label="Akan di-apply" value={stats.included} tone="brand" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-neutral-200 mb-4 overflow-x-auto">
            {(
              [
                ['data', 'Data Pribadi'],
                ['homecell', `Homecell (${data.areas.length} area, ${data.homecells.length})`],
                ['ministry', `Ministry (${data.ministries.length})`],
                ['apply', 'Ringkasan & Apply'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
                  tab === k ? 'border-brand-500 text-brand-600' : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'data' && (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {(
                  [
                    ['review', 'Perlu dicek'],
                    ['changes', 'Ada perubahan'],
                    ['all', 'Semua'],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      filter === k ? 'bg-brand-500 text-white border-brand-500' : 'border-neutral-300 text-neutral-600'
                    }`}
                  >
                    {l}
                  </button>
                ))}
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Cari nama / email / HP"
                  className="ml-auto border border-neutral-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-64"
                />
              </div>
              <p className="text-xs text-neutral-500 mb-3">
                Default: field yang <span className="text-blue-700 font-medium">kosong di production</span> diisi dari sheet;
                field yang <span className="text-amber-700 font-medium">berbeda</span> tetap production — centang untuk
                menimpa. Baris yang tidak cocok otomatis di-skip sampai kandidat dipilih.
              </p>
              <div className="space-y-3">
                {visibleRows.length === 0 && <div className="text-sm text-neutral-500 p-6 text-center">Tidak ada baris.</div>}
                {visibleRows.map((r) => (
                  <RowCard
                    key={r.rowNo}
                    row={r}
                    choice={choices[r.rowNo]!}
                    target={choices[r.rowNo]?.jemaatId ? candById.get(choices[r.rowNo]!.jemaatId!) : undefined}
                    duplicate={!!choices[r.rowNo]?.jemaatId && dupTargets.has(choices[r.rowNo]!.jemaatId!)}
                    onPick={(id) => pickCandidate(r, id)}
                    onToggle={(f, v) => toggleField(r.rowNo, f, v)}
                  />
                ))}
              </div>
            </>
          )}

          {tab === 'homecell' && (
            <div className="space-y-4">
              <p className="text-xs text-neutral-500">
                Area & homecell yang belum ada akan dibuat di cabang {data.cabang?.nama}. PIC dipilih dari jemaat
                ber-nama sama dengan Zone/Home Leader di sheet, dan otomatis ditambahkan ke pelayanan Penggembalaan.
              </p>
              <LeaderTable
                title="Homecell Area"
                items={data.areas.map((a) => ({ key: a.nama, label: a.nama, sub: null, plan: a }))}
                value={areaPic}
                onChange={(k, v) => setAreaPic((p) => ({ ...p, [k]: v }))}
              />
              <LeaderTable
                title="Homecell"
                items={data.homecells.map((h) => ({ key: hcKey(h.areaNama, h.nama), label: h.nama, sub: h.areaNama, plan: h }))}
                value={hcPic}
                onChange={(k, v) => setHcPic((p) => ({ ...p, [k]: v }))}
              />
            </div>
          )}

          {tab === 'ministry' && (
            <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Ministry di sheet</th>
                    <th className="px-3 py-2 text-left">Anggota</th>
                    <th className="px-3 py-2 text-left">Pelayanan tujuan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.ministries.map((m) => {
                    const v = ministry[m.sheetNama] ?? 'skip';
                    const isCreate = v.startsWith('create:');
                    return (
                      <tr key={m.sheetNama}>
                        <td className="px-3 py-2 font-medium">{m.sheetNama}</td>
                        <td className="px-3 py-2">{m.memberCount}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            <select
                              value={isCreate ? '__create' : v}
                              onChange={(e) =>
                                setMinistry((p) => ({
                                  ...p,
                                  [m.sheetNama]: e.target.value === '__create' ? `create:${titleCase(m.sheetNama)}` : e.target.value,
                                }))
                              }
                              className="border border-neutral-300 rounded-lg px-2 py-1 text-sm"
                            >
                              <option value="skip">— Lewati —</option>
                              <option value="__create">+ Buat pelayanan baru</option>
                              {data.pelayananOptions.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.nama}
                                </option>
                              ))}
                            </select>
                            {isCreate && (
                              <input
                                value={v.slice(7)}
                                onChange={(e) => setMinistry((p) => ({ ...p, [m.sheetNama]: `create:${e.target.value}` }))}
                                className="border border-neutral-300 rounded-lg px-2 py-1 text-sm"
                                placeholder="Nama pelayanan baru"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-neutral-500 p-3 border-t border-neutral-100">
                Anggota ditambahkan dengan peran level terendah. Pelayanan baru dibuat dengan peran Leader & Anggota.
              </p>
            </div>
          )}

          {tab === 'apply' && (
            <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3 text-sm">
              <h2 className="font-semibold text-neutral-900">Yang akan dilakukan</h2>
              <ul className="list-disc pl-5 space-y-1 text-neutral-700">
                <li>{stats.included} jemaat diproses ({stats.total - stats.included} baris di-skip).</li>
                <li>{stats.fieldChanges} field data pribadi diperbarui dari sheet.</li>
                <li>Role jemaat dipastikan Jemaat → Jemaat Tetap (role lain tidak diubah).</li>
                <li>
                  Area baru: {data.areas.filter((a) => !a.existingId).length}, homecell baru:{' '}
                  {data.homecells.filter((h) => !h.existingId).length}; anggota homecell ditambahkan sesuai sheet.
                </li>
                <li>
                  Ministry: {Object.values(ministry).filter((v) => v.startsWith('create:')).length} pelayanan baru,{' '}
                  {Object.values(ministry).filter((v) => v === 'skip').length} dilewati.
                </li>
              </ul>
              {dupTargets.size > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 text-amber-800">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {dupTargets.size} jemaat dipilih oleh lebih dari satu baris sheet. Cek di tab Data Pribadi (ditandai
                  “dipakai baris lain”).
                </div>
              )}
              <button
                onClick={() => {
                  if (confirm(`Terapkan konsolidasi untuk ${stats.included} jemaat ke production?`)) applyMut.mutate();
                }}
                disabled={applyMut.isPending || stats.included === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg"
              >
                {applyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {applyMut.isPending ? 'Menerapkan…' : 'Apply ke Database'}
              </button>
            </div>
          )}
        </>
      )}

      {result && data && (
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-neutral-900">Hasil Konsolidasi</h2>
            <button
              onClick={() => file && previewMut.mutate({ f: file, sheet: data.sheet })}
              className="inline-flex items-center gap-1 text-sm text-brand-600"
            >
              <RotateCcw className="w-4 h-4" /> Preview ulang
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
            {Object.entries(result.summary).map(([k, v]) => (
              <Stat key={k} label={k} value={v} />
            ))}
          </div>
          {result.results.some((x) => !x.ok) && (
            <>
              <h3 className="text-sm font-semibold text-red-700 mb-2">Baris gagal</h3>
              <ul className="text-sm space-y-1 mb-4">
                {result.results
                  .filter((x) => !x.ok)
                  .map((x) => (
                    <li key={x.rowNo}>
                      Baris {x.rowNo} ({data.rows.find((r) => r.rowNo === x.rowNo)?.nama}): {x.error}
                    </li>
                  ))}
              </ul>
            </>
          )}
          <p className="text-sm text-neutral-600">
            {result.results.filter((x) => x.ok).length} baris berhasil,{' '}
            {result.results.filter((x) => x.ok && x.changes.length).length} ada perubahan.
          </p>
        </div>
      )}
    </div>
  );
}

// ====================================================================

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'red' | 'amber' | 'brand' }) {
  const c =
    tone === 'green' ? 'text-green-700' : tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : tone === 'brand' ? 'text-brand-600' : 'text-neutral-900';
  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-3 py-2">
      <div className={`text-xl font-bold ${c}`}>{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function candLabel(c: Candidate) {
  // Kandidat leader (tab Homecell) tidak punya `via` — jangan asumsikan ada.
  const via = c.via ?? [];
  return `${c.namaLengkap}${c.kode ? ` · ${c.kode}` : ''} · ${c.cabang}${via.length ? ` (via ${via.join(', ')})` : ''}`;
}

function RowCard({
  row,
  choice,
  target,
  duplicate,
  onPick,
  onToggle,
}: {
  row: Row;
  choice: RowChoice;
  target: Candidate | undefined;
  duplicate: boolean;
  onPick: (id: string | null) => void;
  onToggle: (f: Field, useSheet: boolean) => void;
}) {
  const skipped = !choice.jemaatId;
  return (
    <div className={`bg-white border rounded-xl p-3 ${skipped ? 'border-neutral-200 opacity-75' : 'border-neutral-300'}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <span className="text-xs text-neutral-400">#{row.rowNo}</span>
        <span className="font-semibold text-neutral-900">{row.nama}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[row.match.status]}`}>{row.match.status}</span>
        {target && !target.cabangSama && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">cabang: {target.cabang}</span>
        )}
        {duplicate && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">dipakai baris lain</span>}
        <span className="text-xs text-neutral-500 ml-auto">
          {[row.area, row.homecell, row.ministry].filter(Boolean).join(' · ')}
        </span>
      </div>

      <select
        value={choice.jemaatId ?? ''}
        onChange={(e) => onPick(e.target.value || null)}
        className="w-full sm:w-auto max-w-full border border-neutral-300 rounded-lg px-2 py-1 text-sm mb-2"
      >
        <option value="">— Skip baris ini —</option>
        {row.match.candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {candLabel(c)}
          </option>
        ))}
      </select>
      {row.match.status === 'NOT_FOUND' && (
        <p className="text-xs text-neutral-500">Tidak ditemukan di production — tambahkan lewat menu Jemaat bila perlu.</p>
      )}

      {target && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-neutral-500">
              <tr>
                <th className="text-left font-medium py-1 pr-2 w-28">Field</th>
                <th className="text-left font-medium py-1 pr-2">Production</th>
                <th className="text-left font-medium py-1 pr-2">Sheet</th>
                <th className="text-left font-medium py-1 w-24">Pakai sheet</th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((f) => {
                const st = diff(f, row[f], target[f]);
                if (st === 'none') return null;
                const color = st === 'same' ? 'text-neutral-400' : st === 'fill' ? 'text-blue-700' : 'text-amber-700';
                const ok = validSheetValue(f, row[f]);
                return (
                  <tr key={f} className="border-t border-neutral-100 align-top">
                    <td className="py-1 pr-2 text-neutral-600">{FIELD_LABEL[f]}</td>
                    <td className="py-1 pr-2 text-neutral-800 break-words">{target[f] ?? <i className="text-neutral-400">kosong</i>}</td>
                    <td className={`py-1 pr-2 break-words ${color}`}>{row[f]}</td>
                    <td className="py-1">
                      {st === 'same' ? (
                        <span className="text-neutral-400">sama</span>
                      ) : ok ? (
                        <input
                          type="checkbox"
                          checked={choice.fields.includes(f)}
                          onChange={(e) => onToggle(f, e.target.checked)}
                        />
                      ) : (
                        <span className="text-red-600">tidak valid</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LeaderTable({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: { key: string; label: string; sub: string | null; plan: LeaderPlan }[];
  value: Record<string, string | null>;
  onChange: (key: string, v: string | null) => void;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-neutral-50 text-sm font-semibold">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-neutral-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Nama</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Anggota</th>
              <th className="px-3 py-2 text-left">Leader di sheet</th>
              <th className="px-3 py-2 text-left">PIC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map(({ key, label, sub, plan }) => (
              <tr key={key}>
                <td className="px-3 py-2">
                  <div className="font-medium">{label}</div>
                  {sub && <div className="text-xs text-neutral-500">{sub}</div>}
                </td>
                <td className="px-3 py-2">
                  {plan.existingId ? (
                    <span className="text-xs text-neutral-600">sudah ada</span>
                  ) : (
                    <span className="text-xs text-blue-700">baru</span>
                  )}
                </td>
                <td className="px-3 py-2">{plan.memberCount}</td>
                <td className="px-3 py-2 text-neutral-700">{plan.leaderNama ?? <i className="text-neutral-400">(Vacant)</i>}</td>
                <td className="px-3 py-2">
                  <select
                    value={value[key] ?? ''}
                    onChange={(e) => onChange(key, e.target.value || null)}
                    className="border border-neutral-300 rounded-lg px-2 py-1 text-sm max-w-xs"
                  >
                    <option value="">— Kosong —</option>
                    {plan.existingPicJemaatId && !plan.leaderCandidates.some((c) => c.id === plan.existingPicJemaatId) && (
                      <option value={plan.existingPicJemaatId}>(PIC saat ini)</option>
                    )}
                    {plan.leaderCandidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {candLabel(c)}
                      </option>
                    ))}
                  </select>
                  {plan.leaderNama && plan.leaderCandidates.length === 0 && (
                    <div className="text-xs text-amber-700 mt-1">“{plan.leaderNama}” tidak ditemukan di database</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
