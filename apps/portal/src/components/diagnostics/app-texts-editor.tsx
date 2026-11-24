'use client';

/**
 * Tulisan di Els App — ubah label app tanpa update app (build setelah 2.5.0).
 *
 * Alur untuk admin: cari tulisan yang ingin diubah (ketik kata yang terlihat di
 * app, mis. "15 menit") → isi tulisan baru Bahasa Indonesia &/atau English →
 * Simpan. Kosong = app memakai tulisan bawaan. Berlaku di HP jemaat saat app
 * dibuka berikutnya (paling lama ±1 jam).
 *
 * Daftar tulisan bawaan = salinan file bahasa app (`lib/app-text-catalog.json`,
 * diperbarui dengan `scripts/sync-app-text-catalog.py`).
 * API: GET/PATCH /admin/diagnostics/app-config (`appTextOverrides`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Info, Loader2, RotateCcw, Search, Sparkles } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type Lang = 'id' | 'en';
type TextMap = Record<string, string>;
type Catalog = Record<string, [string, string]>;
interface AppTextConfig {
  appTextOverrides?: { id?: TextMap; en?: TextMap } | null;
  appRules?: Record<string, number>;
  ruleTexts?: { id: TextMap; en: TextMap };
  updatedAt?: string;
}

/** Nama bagian app (awalan kunci) yang mudah dipahami. */
const SECTION: Record<string, string> = {
  ibadah: 'Ibadah',
  reservasi: 'Reservasi ibadah',
  deadline: 'Batas reservasi / pendaftaran',
  event: 'Event',
  tiket: 'Tiket',
  hcj: 'Homecell (pemimpin)',
  homecell: 'Homecell',
  hcg: 'Homecell (tamu)',
  hcmat: 'Materi homecell',
  area: 'Zona',
  group: 'Group',
  gc: 'Group (konten)',
  scanner: 'Scanner petugas',
  ckids: 'CKids',
  kids: 'CKids (jemput)',
  visit: 'Kunjungan',
  my_reservasi: 'Reservasi saya',
  signup: 'Daftar akun',
  auth: 'Masuk / login',
  home: 'Beranda',
  calendar: 'Kalender',
  tamu: 'Tamu',
  ministry: 'Pelayanan',
  service: 'Jadwal pelayanan',
};
const FEATURED = ['ibadah', 'reservasi', 'deadline', 'event', 'tiket', 'homecell', 'hcj', 'area', 'group', 'scanner', 'ckids'];

const RULE_LABEL: Record<string, string> = {
  selfCheckinOpenBeforeMin: 'Self check-in dibuka … menit sebelum mulai',
  selfCheckinCloseAfterMin: 'Self check-in ditutup … menit setelah selesai',
  scanBeforeMin: 'Scan petugas dibuka … menit sebelum mulai',
  scanAfterMin: 'Scan reservasi ditutup … menit setelah mulai',
  cancelCheckinAfterMin: 'Batal self check-in s.d. … menit setelah selesai',
  visitCancelMin: 'Hapus kunjungan dalam … menit',
  kidsMaxAge: 'Ibadah anak untuk usia … tahun ke bawah',
  signupWindowMin: 'Waktu isi data pendaftaran (menit)',
  homecellOkDays: 'Homecell: hadir terakhir hijau bila ≤ … hari',
  homecellWarnDays: 'Homecell: kuning bila ≤ … hari',
  zoneMetDays: 'Zona: bertemu dalam … hari',
  zoneNotMetDays: 'Zona: belum bertemu lebih dari … hari',
};

const sectionOf = (key: string) => key.split('.')[0] ?? '';
const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, ''));
/** Penanda {{…}} di tulisan bawaan yang hilang di tulisan baru. */
const missingMarks = (orig: string, next: string) => {
  if (!next.trim()) return [];
  const have = new Set(placeholders(next));
  return [...new Set(placeholders(orig))].filter((p) => !have.has(p));
};

export function AppTextsEditor() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['diagnostics', 'app-config'],
    queryFn: async () => (await apiClient.get<{ data: AppTextConfig }>('/admin/diagnostics/app-config')).data.data,
  });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    void import('@/lib/app-text-catalog.json').then((m) => setCatalog((m.default ?? m) as unknown as Catalog));
  }, []);

  const [q, setQ] = useState('');
  const [section, setSection] = useState<string>('changed');
  /** Draf yang belum disimpan: key → { id, en }. */
  const [draft, setDraft] = useState<Record<string, { id: string; en: string }>>({});

  const saved = useMemo(() => data?.appTextOverrides ?? {}, [data]);
  const ruleTexts = data?.ruleTexts;
  const valueOf = (key: string, lang: Lang) => draft[key]?.[lang] ?? saved[lang]?.[key] ?? '';
  /** Tulisan yang sekarang tampil di app (tanpa ubahan Portal): aturan server, kalau tidak bawaan app. */
  const baseOf = (key: string, lang: Lang) => ruleTexts?.[lang]?.[key] ?? catalog?.[key]?.[lang === 'id' ? 0 : 1] ?? '';
  const changedKeys = useMemo(
    () => [...new Set([...Object.keys(saved.id ?? {}), ...Object.keys(saved.en ?? {})])].sort(),
    [saved],
  );

  const results = useMemo(() => {
    if (!catalog) return [] as string[];
    const term = q.trim().toLowerCase();
    let keys: string[];
    if (section === 'changed' && !term) keys = changedKeys;
    else if (section === 'rules' && !term) keys = Object.keys(ruleTexts?.id ?? {});
    else keys = Object.keys(catalog).filter((k) => section === 'all' || section === 'changed' || section === 'rules' || sectionOf(k) === section);
    if (term) {
      keys = keys.filter((k) => {
        const [id, en] = catalog[k] ?? ['', ''];
        return (
          id.toLowerCase().includes(term) ||
          en.toLowerCase().includes(term) ||
          k.toLowerCase().includes(term) ||
          (saved.id?.[k] ?? '').toLowerCase().includes(term)
        );
      });
    }
    return keys.slice(0, 60);
  }, [catalog, q, section, changedKeys, ruleTexts, saved]);

  const dirtyKeys = Object.keys(draft).filter(
    (k) => (draft[k]!.id ?? '') !== (saved.id?.[k] ?? '') || (draft[k]!.en ?? '') !== (saved.en?.[k] ?? ''),
  );
  const problems = dirtyKeys.flatMap((k) =>
    (['id', 'en'] as const).flatMap((l) => (missingMarks(baseOf(k, l), valueOf(k, l)).length ? [`${k}:${l}`] : [])),
  );

  const save = useMutation({
    mutationFn: async () => {
      const next: { id: TextMap; en: TextMap } = { id: { ...(saved.id ?? {}) }, en: { ...(saved.en ?? {}) } };
      for (const k of dirtyKeys) {
        for (const l of ['id', 'en'] as const) {
          const v = valueOf(k, l).trim();
          if (v) next[l][k] = v;
          else delete next[l][k];
        }
      }
      return (await apiClient.patch('/admin/diagnostics/app-config', { appTextOverrides: next })).data.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['diagnostics', 'app-config'] });
      setDraft({});
    },
  });

  const setVal = (key: string, lang: Lang, v: string) =>
    setDraft((d) => ({ ...d, [key]: { id: d[key]?.id ?? saved.id?.[key] ?? '', en: d[key]?.en ?? saved.en?.[key] ?? '', [lang]: v } }));
  const resetKey = (key: string) => setDraft((d) => ({ ...d, [key]: { id: '', en: '' } }));

  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-neutral-400" /></div>;

  const sections = [
    { v: 'changed', l: `Sudah diubah (${changedKeys.length})` },
    { v: 'rules', l: 'Ikut aturan server' },
    ...FEATURED.map((s) => ({ v: s, l: SECTION[s] ?? s })),
    { v: 'all', l: 'Semua bagian' },
  ];

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Cara pakai */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 space-y-2">
        <div className="font-semibold flex items-center gap-2"><Info className="w-4 h-4" /> Ubah tulisan di Els App tanpa update app</div>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Ketik kata yang terlihat di app pada kotak cari, mis. <b>15 menit</b> atau <b>Reservasi ditutup</b>.</li>
          <li>Isi <b>tulisan baru</b> untuk Bahasa Indonesia dan/atau English. Kolom yang dikosongkan memakai tulisan bawaan.</li>
          <li>Tekan <b>Simpan</b>. HP jemaat memakai tulisan baru saat app dibuka berikutnya (paling lama ±1 jam).</li>
        </ol>
        <div className="text-xs text-blue-800">
          <b>Bahasa:</b> jemaat melihat Bahasa Indonesia atau English sesuai pilihan bahasa di app (Profil → Bahasa). Ubah keduanya supaya sama.
          Tulisan bertanda <code className="bg-white/60 px-1 rounded">{'{{…}}'}</code> (mis. <code className="bg-white/60 px-1 rounded">{'{{time}}'}</code>) akan diganti app dengan jam/nama/angka — jangan dihapus.
          Hanya berlaku untuk Els App versi <b>setelah 2.5.0</b>.
        </div>
      </div>

      {/* Cari */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari tulisan di app, mis. 15 menit"
            className="w-full pl-9 pr-3 py-2.5 border border-neutral-200 rounded-xl text-sm"
          />
        </div>
        <select value={section} onChange={(e) => setSection(e.target.value)} className="border border-neutral-200 rounded-xl px-3 py-2.5 text-sm bg-white">
          {sections.map((s) => (
            <option key={s.v} value={s.v}>{s.l}</option>
          ))}
        </select>
      </div>

      {/* Hasil */}
      {!catalog ? (
        <div className="text-sm text-neutral-400">Memuat daftar tulisan…</div>
      ) : results.length === 0 ? (
        <div className="text-sm text-neutral-500 bg-neutral-50 border border-neutral-100 rounded-xl p-4 sm:p-6 text-center">
          {section === 'changed' && !q ? 'Belum ada tulisan yang diubah. Cari tulisan di atas untuk mulai.' : 'Tidak ada tulisan yang cocok.'}
        </div>
      ) : (
        <div className="space-y-3">
          {results.map((key) => {
            const isRule = !!ruleTexts?.id?.[key];
            const changed = !!(saved.id?.[key] || saved.en?.[key]);
            return (
              <div key={key} className={`bg-white border rounded-xl p-4 ${changed ? 'border-brand-200' : 'border-neutral-200'}`}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">{SECTION[sectionOf(key)] ?? sectionOf(key)}</span>
                  {isRule ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Angkanya otomatis ikut aturan server
                    </span>
                  ) : null}
                  {changed ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">Sudah diubah</span> : null}
                  <code className="text-[11px] text-neutral-400 ml-auto">{key}</code>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {(['id', 'en'] as const).map((l) => {
                    const base = baseOf(key, l);
                    const val = valueOf(key, l);
                    const miss = missingMarks(base, val);
                    return (
                      <div key={l}>
                        <div className="text-xs font-semibold text-neutral-500 mb-1">{l === 'id' ? 'Bahasa Indonesia' : 'English'}</div>
                        <div className="text-xs text-neutral-500 bg-neutral-50 rounded-lg px-2.5 py-1.5 mb-1.5">
                          <span className="text-neutral-400">Sekarang di app: </span>{base || '—'}
                        </div>
                        <textarea
                          value={val}
                          onChange={(e) => setVal(key, l, e.target.value)}
                          rows={2}
                          placeholder="Tulisan baru (kosong = pakai tulisan di atas)"
                          className={`w-full border rounded-lg px-2.5 py-1.5 text-sm ${miss.length ? 'border-red-400' : 'border-neutral-200'}`}
                        />
                        {miss.length ? (
                          <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Tambahkan {miss.join(', ')} — app mengisinya otomatis.
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {changed || draft[key] ? (
                  <button type="button" onClick={() => resetKey(key)} className="mt-2 text-xs text-neutral-500 hover:text-neutral-800 inline-flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Kembalikan ke tulisan bawaan
                  </button>
                ) : null}
              </div>
            );
          })}
          {results.length === 60 ? <div className="text-xs text-neutral-400">Menampilkan 60 hasil pertama — perjelas kata pencarian.</div> : null}
        </div>
      )}

      {/* Simpan */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-neutral-100 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={dirtyKeys.length === 0 || problems.length > 0 || save.isPending}
          className="px-4 py-2 bg-brand-500 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-brand-600 transition"
        >
          {save.isPending ? 'Menyimpan…' : `Simpan${dirtyKeys.length ? ` (${dirtyKeys.length})` : ''}`}
        </button>
        {dirtyKeys.length ? (
          <button type="button" onClick={() => setDraft({})} className="text-sm text-neutral-500 hover:text-neutral-700">Batal</button>
        ) : null}
        {problems.length ? <span className="text-sm text-red-600">Lengkapi tanda {'{{…}}'} yang hilang dulu.</span> : null}
        {save.isError ? <span className="text-sm text-red-600">Gagal menyimpan. Coba lagi.</span> : null}
        {save.isSuccess && dirtyKeys.length === 0 ? (
          <span className="text-sm text-green-600 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Tersimpan</span>
        ) : null}
      </div>

      {/* Aturan */}
      {data?.appRules ? (
        <details className="bg-white border border-neutral-200 rounded-xl p-4">
          <summary className="cursor-pointer text-sm font-semibold text-neutral-800">Angka aturan yang dikirim ke app (otomatis dari server)</summary>
          <p className="text-xs text-neutral-500 mt-2 mb-3">
            Tidak perlu diubah di sini — angka ini mengikuti aturan server. Tulisan bertanda “otomatis ikut aturan server” ikut berubah bila aturannya berubah.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {Object.entries(data.appRules).map(([k, v]) => (
              <div key={k} className="flex flex-wrap justify-between gap-3 border-b border-neutral-100 py-1">
                <span className="text-neutral-600">{RULE_LABEL[k] ?? k}</span>
                <span className="font-semibold tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
