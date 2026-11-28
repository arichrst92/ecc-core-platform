'use client';

/**
 * Detail satu halaman (klik baris di tab Halaman): kapan halaman ini ramai / sepi,
 * ringkasan dalam kalimat, per hari dalam seminggu, platform, pembanding seluruh
 * app, grafik jam ramai, serta pengunjung harian & retensi kohort.
 */
import { useEffect } from 'react';
import { CalendarDays, Clock, Eye, Lightbulb, RotateCcw, Smartphone, Users, X } from 'lucide-react';
import { usePageHours } from '@/lib/analytics/use-analytics';
import type { AnalyticsFilter, PageRow } from '@/lib/analytics/types';
import { pageLabel } from '@/lib/analytics/labels';
import { Kpi, PlatformBar, fmtDur, fmtNum, pctOrDash, retentionClass } from './ui';
import { PrimeHourCard } from './prime-hour';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HARI_ORDER = [1, 2, 3, 4, 5, 6, 0];
const jam = (h: number) => `${String(h).padStart(2, '0')}.00`;

export function PageHourModal({
  row,
  filter,
  onClose,
  detail,
}: {
  row: PageRow;
  filter: AnalyticsFilter;
  onClose: () => void;
  /** Pengunjung harian & kohort (komponen yang sudah ada). */
  detail: React.ReactNode;
}) {
  const q = usePageHours(filter, row.route);
  const d = q.data;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  // Ringkasan dalam kalimat (mudah dibaca admin non-IT).
  const kalimat: string[] = [];
  if (d && d.total > 0) {
    if (d.ramai) kalimat.push(`Paling ramai pukul ${jam(d.ramai.dari)}–${jam(d.ramai.sampai)} WIB (${d.ramai.persen}% kunjungan halaman ini).`);
    if (d.puncak) kalimat.push(`Puncaknya ${jam(d.puncak.jam)}–${jam((d.puncak.jam + 1) % 24)}.`);
    if (d.hariTeramai != null) kalimat.push(`Hari teramai: ${HARI[d.hariTeramai]}${d.porsiMinggu ? ` · ${d.porsiMinggu}% kunjungan terjadi hari Minggu` : ''}.`);
    if (d.appPuncak != null && d.puncak) {
      const diff = d.puncak.jam - d.appPuncak;
      kalimat.push(
        diff === 0
          ? `Sama dengan jam puncak seluruh app (${jam(d.appPuncak)}).`
          : `${Math.abs(diff)} jam ${diff < 0 ? 'lebih awal' : 'lebih lambat'} dari jam puncak seluruh app (${jam(d.appPuncak)}).`,
      );
    }
    if (d.tersepi) kalimat.push(`Paling sepi (05–24): ${jam(d.tersepi.jam)}–${jam((d.tersepi.jam + 1) % 24)}.`);
  }
  const saran =
    d?.ramai != null
      ? `Kirim pengumuman / notifikasi yang mengarah ke halaman ini sekitar ${jam((d.ramai.dari + 23) % 24).replace('.00', '.30')}, sebelum jam ramai dimulai.`
      : null;
  const perHariMax = Math.max(1, ...(d?.perHari ?? [0]));
  const pf = d?.platform ?? null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start justify-center p-3 sm:p-6 pointer-events-none overflow-y-auto">
        <div className="bg-neutral-50 rounded-2xl shadow-xl w-full max-w-5xl pointer-events-auto">
          <div className="sticky top-0 z-10 flex items-start gap-3 px-4 sm:px-6 py-4 bg-white rounded-t-2xl border-b border-neutral-200">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-neutral-900 truncate">{pageLabel(row.route)}</h2>
              <p className="text-xs text-neutral-500 font-mono truncate">{row.route}</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100" aria-label="Tutup">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            {/* Angka halaman */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Kpi icon={Eye} color="#f97316" label="Dibuka" value={fmtNum(row.views)} sub={`${(row.views / Math.max(1, row.visitors)).toFixed(1)}× per pengunjung`} />
              <Kpi icon={Users} color="#2563eb" label="Pengunjung" value={fmtNum(row.visitors)} sub="perangkat unik" />
              <Kpi icon={Clock} color="#8b5cf6" label="Durasi" value={fmtDur(row.avgDurationSec)} sub="rata-rata per buka" />
              <Kpi icon={RotateCcw} color="#16a34a" label="Kembali 7 hari" value={pctOrDash(row.return7, 0)} valueClass={retentionClass(row.return7)} sub={`30 hari: ${pctOrDash(row.return30, 0)}`} />
              <Kpi icon={Smartphone} color="#0ea5e9" label="Aktif sekarang" value={fmtNum(row.activeNow)} sub="sedang membuka" />
            </div>

            {/* Ringkasan kalimat */}
            <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-brand-800 mb-1.5">
                <Lightbulb className="w-4 h-4" /> Kapan halaman ini ramai?
              </div>
              {q.isPending ? (
                <p className="text-sm text-neutral-500">Memuat…</p>
              ) : kalimat.length ? (
                <>
                  <ul className="text-sm text-neutral-800 space-y-0.5 list-disc pl-5">
                    {kalimat.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                  {saran ? <p className="text-xs text-brand-800 mt-2">Saran: {saran}</p> : null}
                </>
              ) : (
                <p className="text-sm text-neutral-500">Belum ada data per jam untuk halaman ini di periode ini.</p>
              )}
            </div>

            {/* Grafik jam ramai halaman ini */}
            <PrimeHourCard filter={filter} route={row.route} />

            {d && d.total > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Per hari dalam seminggu */}
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 mb-3">
                    <CalendarDays className="w-4 h-4 text-brand-600" /> Per hari dalam seminggu
                  </div>
                  <div className="space-y-1.5">
                    {HARI_ORDER.map((i) => {
                      const v = d.perHari[i] ?? 0;
                      const top = i === d.hariTeramai;
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`w-14 ${top ? 'font-semibold text-neutral-900' : 'text-neutral-600'}`}>{HARI[i]}</span>
                          <span className="flex-1 h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                            <span className={`block h-full rounded-full ${top ? 'bg-brand-600' : 'bg-brand-300'}`} style={{ width: `${(v / perHariMax) * 100}%` }} />
                          </span>
                          <span className="w-16 text-right tabular-nums text-neutral-700">
                            {fmtNum(v)} <span className="text-neutral-400">{d.total ? `${Math.round((v / d.total) * 100)}%` : ''}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Platform */}
                <div className="bg-white border border-neutral-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900 mb-3">
                    <Smartphone className="w-4 h-4 text-brand-600" /> Dibuka dari
                  </div>
                  {pf ? <PlatformBar android={pf.android ?? 0} ios={pf.ios ?? 0} web={pf.web ?? 0} /> : <p className="text-xs text-neutral-500">—</p>}
                  <p className="text-[11px] text-neutral-500 mt-3">
                    Top 3 jam:{' '}
                    {d.top3.map((t) => `${jam(t.jam)} (${t.persen}%)`).join(' · ') || '—'}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Pengunjung harian & kohort (sudah ada sebelumnya) */}
            {detail}
          </div>
        </div>
      </div>
    </>
  );
}
