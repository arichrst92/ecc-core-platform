'use client';

/**
 * Konsolidasi sheet STRUKTUR HOMECELL (mis. "leaders bridge 2026.xlsx") —
 * satu baris = satu homecell, bukan daftar jemaat.
 *
 *   ZONA          → Area di Els (PIC = Zone Leader, Pastor = Area/Zone Pastor,
 *                   deskripsi = nama AREA di sheet)
 *   NAMA HOMECELL → Homecell (PIC = Home Leader, usia dari JENIS HOMECELL)
 *
 * Leader dicocokkan dengan nama persis; bila tidak ada, ditawarkan jemaat
 * dengan nama mirip (persentase kemiripan). Backend:
 * /admin/jemaat-consolidation/structure-{preview,apply}.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Network, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface Person {
  id: string;
  kode: string | null;
  namaLengkap: string;
  cabang: string;
  cabangSama: boolean;
  score?: number;
}
interface Match {
  candidates: Person[];
  similar: Person[];
}
interface AreaPlan {
  nama: string;
  areaSheet: string | null;
  existingId: string | null;
  existingDeskripsi: string | null;
  existingPicJemaatId: string | null;
  existingPastorIds: string[];
  leaderNama: string | null;
  leaderCandidates: Person[];
  leaderSimilar: Person[];
  pastors: { nama: string; candidates: Person[]; similar: Person[] }[];
  memberCount: number;
}
interface HcPlan {
  rowNo: number;
  nama: string;
  areaNama: string;
  hcCode: string | null;
  existingId: string | null;
  movedFromArea: string | null;
  existingPicJemaatId: string | null;
  existingUsiaMin: number | null;
  existingUsiaMax: number | null;
  usiaMin: number | null;
  usiaMax: number | null;
  leaderNama: string | null;
  leaderCandidates: Person[];
  leaderSimilar: Person[];
}
interface StructurePreview {
  sheetNames: string[];
  sheet: string;
  rowCount: number;
  cabangOptions: { id: string; nama: string }[];
  cabangGuessed: boolean;
  cabang: { id: string; nama: string } | null;
  areas: AreaPlan[];
  homecells: HcPlan[];
}
interface StructureSummary {
  areasCreated: number;
  homecellsCreated: number;
  homecellsMoved: number;
  picSet: number;
  pastorsAdded: number;
  usiaSet: number;
  penggembalaanAdded: number;
}

const label = (p: Person) => `${p.score != null ? `${Math.round(p.score * 100)}% · ` : ''}${p.namaLengkap}${p.kode ? ` · ${p.kode}` : ''} · ${p.cabang}`;

/**
 * Pilihan otomatis (sheet = data terbaru): nama persis (cabang sama dulu), atau
 * kemiripan ≥ 90% yang jelas unggul; bila tidak ada → PIC yang sekarang.
 */
function autoPick(m: Match, existing?: string | null): string | null {
  const exact = m.candidates.find((c) => c.cabangSama) ?? m.candidates[0];
  if (exact) return exact.id;
  const [a, b] = m.similar;
  if (a && (a.score ?? 0) >= 0.9 && !(b && (b.score ?? 0) > (a.score ?? 0) - 0.05)) return a.id;
  return existing ?? null;
}

function PersonSelect({
  nama,
  match,
  value,
  existingId,
  onChange,
}: {
  nama: string | null;
  match: Match;
  value: string | null;
  existingId?: string | null;
  onChange: (v: string | null) => void;
}) {
  const chosenSimilar = match.similar.find((c) => c.id === value);
  return (
    <div>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="border border-neutral-300 rounded-lg px-2 py-1 text-sm w-full max-w-xs bg-white"
      >
        <option value="">— Kosong —</option>
        {existingId && ![...match.candidates, ...match.similar].some((c) => c.id === existingId) && (
          <option value={existingId}>(PIC saat ini)</option>
        )}
        {match.candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {label(c)}
          </option>
        ))}
        {match.candidates.length === 0 && match.similar.length > 0 && (
          <optgroup label={`Kemiripan dengan “${nama}”`}>
            {match.similar.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {nama && match.candidates.length === 0 && (
        <div className="text-[11px] text-amber-700 mt-0.5">
          {chosenSimilar
            ? `Dipilih dari kemiripan (${Math.round((chosenSimilar.score ?? 0) * 100)}%) — pastikan orangnya benar`
            : match.similar.length
              ? `Tidak ada nama persis — ${match.similar.length} nama mirip di pilihan`
              : 'Tidak ditemukan di database'}
        </div>
      )}
    </div>
  );
}

export function HomecellStructureImport({ file, sheet }: { file: File; sheet?: string }) {
  const [cabangId, setCabangId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<StructurePreview | null>(null);
  const [areaPic, setAreaPic] = useState<Record<string, string | null>>({});
  const [areaPastor, setAreaPastor] = useState<Record<string, string | null>>({}); // `${zona}|${pastorNama}`
  const [hcPic, setHcPic] = useState<Record<string, string | null>>({});
  const [useUsia, setUseUsia] = useState(true);
  const [summary, setSummary] = useState<StructureSummary | null>(null);

  const previewMut = useMutation({
    mutationFn: async (cid?: string) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiClient.post<{ data: StructurePreview }>('/admin/jemaat-consolidation/structure-preview', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { sheet, cabangId: cid },
        timeout: 120_000,
      });
      return res.data.data;
    },
    onSuccess: (p) => {
      setData(p);
      setSummary(null);
      if (p.cabang) setCabangId(p.cabang.id);
      setAreaPic(Object.fromEntries(p.areas.map((a) => [a.nama, autoPick({ candidates: a.leaderCandidates, similar: a.leaderSimilar }, a.existingPicJemaatId)])));
      setAreaPastor(
        Object.fromEntries(
          p.areas.flatMap((a) =>
            a.pastors.map((ps) => {
              const pick = autoPick(ps);
              // Pastor yang sudah terpasang di area → tetap (tidak dihapus).
              return [`${a.nama}|${ps.nama}`, pick];
            }),
          ),
        ),
      );
      setHcPic(
        Object.fromEntries(
          p.homecells.map((h) => [`${h.areaNama}|${h.nama}`, autoPick({ candidates: h.leaderCandidates, similar: h.leaderSimilar }, h.existingPicJemaatId)]),
        ),
      );
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal membaca struktur homecell'),
  });

  // Baca ulang saat file / sheet berganti.
  useEffect(() => {
    setCabangId(undefined);
    previewMut.mutate(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, sheet]);

  const applyMut = useMutation({
    mutationFn: async () => {
      if (!data?.cabang) throw new Error('Pilih cabang dulu');
      const res = await apiClient.post<{ data: { summary: StructureSummary } }>(
        '/admin/jemaat-consolidation/structure-apply',
        {
          cabangId: data.cabang.id,
          areas: data.areas.map((a) => ({
            nama: a.nama,
            deskripsi: a.areaSheet,
            picJemaatId: areaPic[a.nama] ?? null,
            pastorIds: a.pastors.map((ps) => areaPastor[`${a.nama}|${ps.nama}`]).filter((x): x is string => !!x),
          })),
          homecells: data.homecells.map((h) => ({
            nama: h.nama,
            areaNama: h.areaNama,
            picJemaatId: hcPic[`${h.areaNama}|${h.nama}`] ?? null,
            usiaMin: useUsia ? h.usiaMin : null,
            usiaMax: useUsia ? h.usiaMax : null,
          })),
        },
        { timeout: 180_000 },
      );
      return res.data.data.summary;
    },
    onSuccess: (s) => {
      setSummary(s);
      toast.success('Struktur homecell diterapkan');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? err.message ?? 'Gagal menerapkan'),
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const unresolved =
      data.areas.filter((a) => a.leaderNama && !areaPic[a.nama]).length +
      data.homecells.filter((h) => h.leaderNama && !hcPic[`${h.areaNama}|${h.nama}`]).length;
    return {
      areasNew: data.areas.filter((a) => !a.existingId).length,
      hcNew: data.homecells.filter((h) => !h.existingId).length,
      hcMoved: data.homecells.filter((h) => h.movedFromArea).length,
      unresolved,
    };
  }, [data, areaPic, hcPic]);

  if (previewMut.isPending && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500 py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Membaca struktur homecell…
      </div>
    );
  }
  if (!data) return null;

  if (summary) {
    return (
      <div className="bg-white border border-green-200 rounded-xl p-6">
        <h2 className="text-lg font-bold text-green-700 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" /> Struktur homecell diterapkan — {data.cabang?.nama}
        </h2>
        <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-neutral-700">
          <li>Area (zona) baru: <b>{summary.areasCreated}</b></li>
          <li>Homecell baru: <b>{summary.homecellsCreated}</b></li>
          <li>Homecell dipindah ke zona sheet: <b>{summary.homecellsMoved}</b></li>
          <li>PIC di-set: <b>{summary.picSet}</b></li>
          <li>Pastor ditambahkan: <b>{summary.pastorsAdded}</b></li>
          <li>Rentang usia di-set: <b>{summary.usiaSet}</b></li>
          <li>Ditambahkan ke Penggembalaan: <b>{summary.penggembalaanAdded}</b></li>
        </ul>
        <button
          onClick={() => previewMut.mutate(data.cabang?.id)}
          className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 border border-neutral-300 rounded-lg text-sm"
        >
          <RotateCcw className="w-4 h-4" /> Baca ulang
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
        <p className="font-semibold flex items-center gap-2">
          <Network className="w-4 h-4" /> Sheet struktur homecell terdeteksi ({data.rowCount} homecell)
        </p>
        <p className="mt-1 text-blue-800">
          Tiap <b>ZONA</b> menjadi Area di Els (PIC = Zone Leader, Pastor = Area Pastor, nama AREA sheet disimpan di
          deskripsi). Tiap <b>NAMA HOMECELL</b> menjadi homecell dengan PIC = Home Leader. Leader yang namanya tidak sama
          persis ditawarkan dari <b>kemiripan nama</b>. Pemimpin otomatis ditambahkan ke pelayanan Penggembalaan.
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-neutral-700 flex items-center gap-2">
          Cabang
          <select
            value={cabangId ?? ''}
            onChange={(e) => {
              const v = e.target.value || undefined;
              setCabangId(v);
              if (v) previewMut.mutate(v);
            }}
            className="border border-neutral-300 rounded-lg px-2 py-1 text-sm bg-white"
          >
            <option value="">— Pilih cabang —</option>
            {data.cabangOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </label>
        {data.cabang && data.cabangGuessed && (
          <span className="text-xs text-neutral-500">Ditebak dari nama area/homecell yang sudah ada — ganti bila salah.</span>
        )}
        {previewMut.isPending && <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />}
      </div>

      {!data.cabang ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          Sheet ini tidak punya kolom Cabang — pilih cabang tujuan untuk melanjutkan.
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <MiniStat label="Zona → Area" value={data.areas.length} sub={`${stats.areasNew} baru`} />
              <MiniStat label="Homecell" value={data.homecells.length} sub={`${stats.hcNew} baru`} />
              <MiniStat label="Pindah zona" value={stats.hcMoved} />
              <MiniStat label="Leader belum dipilih" value={stats.unresolved} warn={stats.unresolved > 0} />
              <MiniStat label="Cabang" value={data.cabang.nama} />
            </div>
          )}

          {/* Area / Zona */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-neutral-50 text-sm font-semibold">Zona → Area ({data.areas.length})</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Zona</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Zone Leader (PIC)</th>
                    <th className="px-3 py-2 text-left">Pastor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 align-top">
                  {data.areas.map((a) => (
                    <tr key={a.nama}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{a.nama}</div>
                        <div className="text-xs text-neutral-500">
                          {a.areaSheet ?? '-'} · {a.memberCount} homecell
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {a.existingId ? (
                          <span className="text-xs text-neutral-600">sudah ada</span>
                        ) : (
                          <span className="text-xs text-blue-700 font-medium">baru</span>
                        )}
                      </td>
                      <td className="px-3 py-2 min-w-[240px]">
                        <div className="text-xs text-neutral-500 mb-1">{a.leaderNama ?? <i>(kosong di sheet)</i>}</div>
                        <PersonSelect
                          nama={a.leaderNama}
                          match={{ candidates: a.leaderCandidates, similar: a.leaderSimilar }}
                          value={areaPic[a.nama] ?? null}
                          existingId={a.existingPicJemaatId}
                          onChange={(v) => setAreaPic((p) => ({ ...p, [a.nama]: v }))}
                        />
                      </td>
                      <td className="px-3 py-2 min-w-[240px] space-y-2">
                        {a.pastors.length === 0 ? (
                          <span className="text-xs text-neutral-400 italic">—</span>
                        ) : (
                          a.pastors.map((ps) => (
                            <div key={ps.nama}>
                              <div className="text-xs text-neutral-500 mb-1">{ps.nama}</div>
                              <PersonSelect
                                nama={ps.nama}
                                match={ps}
                                value={areaPastor[`${a.nama}|${ps.nama}`] ?? null}
                                onChange={(v) => setAreaPastor((p) => ({ ...p, [`${a.nama}|${ps.nama}`]: v }))}
                              />
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Homecell */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-neutral-50 text-sm font-semibold flex items-center justify-between gap-3">
              <span>Homecell ({data.homecells.length})</span>
              <label className="text-xs font-normal text-neutral-600 flex items-center gap-1.5">
                <input type="checkbox" checked={useUsia} onChange={(e) => setUseUsia(e.target.checked)} />
                Terapkan rentang usia dari kolom JENIS HOMECELL
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Homecell</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Usia</th>
                    <th className="px-3 py-2 text-left">Home Leader (PIC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 align-top">
                  {data.homecells.map((h) => {
                    const k = `${h.areaNama}|${h.nama}`;
                    return (
                      <tr key={`${k}|${h.rowNo}`}>
                        <td className="px-3 py-2">
                          <div className="font-medium">{h.nama}</div>
                          <div className="text-xs text-neutral-500">{h.areaNama}</div>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {!h.existingId ? (
                            <span className="text-blue-700 font-medium">baru</span>
                          ) : h.movedFromArea ? (
                            <span className="text-amber-700">pindah dari {h.movedFromArea}</span>
                          ) : (
                            <span className="text-neutral-600">sudah ada</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-neutral-600 whitespace-nowrap">
                          {h.usiaMin != null || h.usiaMax != null ? (
                            <>
                              {h.usiaMin ?? '?'}–{h.usiaMax ?? '…'} th
                              {h.existingId && (h.existingUsiaMin != null || h.existingUsiaMax != null) && (
                                <div className="text-neutral-400">
                                  saat ini {h.existingUsiaMin ?? '?'}–{h.existingUsiaMax ?? '…'}
                                </div>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 min-w-[240px]">
                          <div className="text-xs text-neutral-500 mb-1">{h.leaderNama ?? <i>(kosong di sheet)</i>}</div>
                          <PersonSelect
                            nama={h.leaderNama}
                            match={{ candidates: h.leaderCandidates, similar: h.leaderSimilar }}
                            value={hcPic[k] ?? null}
                            existingId={h.existingPicJemaatId}
                            onChange={(v) => setHcPic((p) => ({ ...p, [k]: v }))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-neutral-500 max-w-2xl">
              Yang ditulis: area & homecell baru, PIC yang dipilih, pastor area (ditambahkan, pastor lama tidak dihapus),
              homecell yang ada di zona lain dipindah ke zona sesuai sheet, dan rentang usia (bila dicentang). Anggota
              homecell tidak diubah.
            </p>
            <button
              onClick={() => applyMut.mutate()}
              disabled={applyMut.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              {applyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Terapkan struktur homecell
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MiniStat({ label, value, sub, warn }: { label: string; value: number | string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-white'}`}>
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className={`text-lg font-bold truncate ${warn ? 'text-amber-700' : 'text-neutral-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}
