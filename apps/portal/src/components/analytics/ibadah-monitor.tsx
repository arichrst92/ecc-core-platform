'use client';

/**
 * Monitor Ibadah — layar command room. Latar gelap, angka besar, diperbarui
 * tiap 15 detik. `kiosk` = layar penuh (menutupi menu portal) untuk monitor
 * terpisah. Data: GET /admin/ibadah-monitor.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Baby,
  Expand,
  Info,
  Loader2,
  Minimize,
  QrCode,
  Radio,
  ScanLine,
  Server,
  Smartphone,
  UserPlus,
  Users,
  WifiOff,
} from 'lucide-react';
import { useCabangOptions } from '@/components/report/report-ui';
import { useIbadahMonitor, useIbadahMonitorOptions } from '@/lib/analytics/use-analytics';
import type { IbadahMonitorData } from '@/lib/analytics/types';
import { monitorText, type MonitorLang } from '@/lib/monitor-i18n';

const LS_CABANG = 'monitor-ibadah.cabangId';
const LS_IBADAH = 'monitor-ibadah.ibadahId';

export const fmt = (n: number) => Math.round(n).toLocaleString('id-ID');
export const METHOD_LABEL: Record<string, string> = {
  SELF: 'Self check-in (app)',
  SCAN: 'Scan QR petugas',
  WALK_IN: 'Walk-in (tamu)',
  MANUAL: 'Manual',
  LAINNYA: 'Lainnya',
};

function readLs(k: string) {
  try {
    return window.localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
}
function writeLs(k: string, v: string) {
  try {
    if (v) window.localStorage.setItem(k, v);
    else window.localStorage.removeItem(k);
  } catch {
    /* abaikan */
  }
}

export function IbadahMonitor({ kiosk = false, onToggleKiosk }: { kiosk?: boolean; onToggleKiosk?: () => void }) {
  const cabangQ = useCabangOptions();
  const [cabangId, setCabangId] = useState('');
  const [ibadahId, setIbadahId] = useState('');
  useEffect(() => {
    setCabangId(readLs(LS_CABANG));
    setIbadahId(readLs(LS_IBADAH));
  }, []);
  useEffect(() => {
    if (!cabangId && cabangQ.data?.[0]) setCabangId(cabangQ.data[0].id);
  }, [cabangId, cabangQ.data]);

  const opts = useIbadahMonitorOptions(cabangId);
  const q = useIbadahMonitor({ cabangId, ibadahId: ibadahId || undefined });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);

  const d = q.data && !q.data.empty ? q.data : null;
  const stale = q.isError || (q.dataUpdatedAt && now - q.dataUpdatedAt > 60_000);

  const shell = kiosk
    ? 'fixed inset-0 z-[100] overflow-auto bg-neutral-950 text-white p-5'
    : 'rounded-2xl bg-neutral-950 text-white p-5';

  return (
    <div className={shell}>
      {/* Baris kontrol */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={cabangId}
          onChange={(e) => {
            setCabangId(e.target.value);
            setIbadahId('');
            writeLs(LS_CABANG, e.target.value);
            writeLs(LS_IBADAH, '');
          }}
          className="select-dark h-9 rounded-lg px-3 text-sm"
        >
          {(cabangQ.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nama}
            </option>
          ))}
        </select>
        <select
          value={ibadahId}
          onChange={(e) => {
            setIbadahId(e.target.value);
            writeLs(LS_IBADAH, e.target.value);
          }}
          className="select-dark h-9 rounded-lg px-3 text-sm max-w-xs"
        >
          <option value="">Otomatis (sedang / akan berlangsung)</option>
          {(opts.data?.items ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.jamMulai} · {o.nama}
              {o.isKidsIbadah ? ' (anak)' : ''}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3 text-xs text-neutral-400">
          {stale ? (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <WifiOff className="w-3.5 h-3.5" /> Terakhir diperbarui{' '}
              {q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Langsung · tiap 15 detik
            </span>
          )}
          {onToggleKiosk ? (
            <button
              onClick={onToggleKiosk}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-neutral-700 text-neutral-200 hover:bg-neutral-800"
            >
              {kiosk ? <Minimize className="w-4 h-4" /> : <Expand className="w-4 h-4" />}
              {kiosk ? 'Keluar layar penuh' : 'Layar penuh'}
            </button>
          ) : null}
        </div>
      </div>

      {q.isPending && !q.data ? (
        <div className="flex items-center justify-center gap-2 py-24 text-neutral-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Memuat…
        </div>
      ) : q.data?.empty ? (
        <div className="py-24 text-center text-neutral-400">
          <div className="text-2xl font-semibold text-neutral-200">Tidak ada ibadah hari ini</div>
          <div className="mt-1">{q.data.cabang.nama}</div>
        </div>
      ) : !d ? (
        <div className="py-24 text-center text-red-400">Gagal memuat data monitor. Mencoba lagi otomatis…</div>
      ) : (
        <IbadahBoard d={d} now={now} />
      )}
    </div>
  );
}

export function Panel({ title, icon: Icon, children, className = '' }: { title: string; icon: typeof Users; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl bg-neutral-900 border border-neutral-800 p-4 ${className}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
        <Icon className="w-4 h-4" /> {title}
      </div>
      {children}
    </div>
  );
}

export function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-neutral-400 text-sm">{label}</span>
      <span className={`text-lg font-semibold tabular-nums ${tone ?? 'text-white'}`}>{value}</span>
    </div>
  );
}

export function IbadahBoard({ d, now, lang = 'id' }: { d: IbadahMonitorData; now: number; lang?: MonitorLang }) {
  const T = monitorText(lang);
  const start = new Date(d.startAt).getTime();
  const end = new Date(d.endAt).getTime();
  const status = now < start ? 'BELUM' : now <= end ? 'BERLANGSUNG' : 'SELESAI';
  const mmss = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
  };
  const clock = new Date(now).toLocaleTimeString(T.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: d.tz });
  const k = d.kehadiran;
  const cap = d.ibadah.kapasitasSeat;
  const capPct = cap ? Math.round((k.hadir / cap) * 100) : null;
  const vsLast = d.lastWeek && d.lastWeek.hadirSaatIni > 0 ? Math.round(((k.hadir - d.lastWeek.hadirSaatIni) / d.lastWeek.hadirSaatIni) * 100) : null;
  const methods = Object.entries(d.methods).sort((a, b) => b[1] - a[1]);
  const methodTot = Math.max(1, methods.reduce((a, [, v]) => a + v, 0));

  return (
    <div className="space-y-4">
      {/* Kepala */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-neutral-400 text-sm">
            {d.ibadah.cabang.nama}
            {d.ibadah.lokasi ? ` · ${d.ibadah.lokasi}` : ''}
          </div>
          <div className="text-3xl lg:text-4xl font-bold leading-tight">{d.ibadah.nama}</div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-neutral-300 text-lg tabular-nums">
              {d.ibadah.jamMulai}–{d.ibadah.jamSelesai}
            </span>
            {status === 'BELUM' ? (
              <span className="px-3 py-1 rounded-full bg-sky-500/15 text-sky-300 text-sm font-semibold">{T.startsIn(mmss(start - now))}</span>
            ) : status === 'BERLANGSUNG' ? (
              <span className="px-3 py-1 rounded-full bg-green-500/15 text-green-300 text-sm font-semibold inline-flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" /> {T.running(mmss(now - start))}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-neutral-700/50 text-neutral-300 text-sm font-semibold">{T.endedAgo(mmss(now - end))}</span>
            )}
          </div>
        </div>
        <div className="text-5xl lg:text-6xl font-bold tabular-nums tracking-tight">{clock}</div>
      </div>

      {/* Peringatan */}
      {d.alerts.length ? (
        <div className="space-y-2">
          {d.alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-base font-semibold ${
                a.level === 'danger' ? 'bg-red-500/15 text-red-300 border border-red-500/40' : a.level === 'warning' ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40' : 'bg-sky-500/10 text-sky-200 border border-sky-500/30'
              }`}
            >
              {a.level === 'info' ? <Info className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              {a.text}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Kehadiran */}
        <Panel title={T.attendance} icon={Users} className="lg:col-span-2">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-7xl font-bold tabular-nums leading-none">{fmt(k.hadir)}</div>
              <div className="text-neutral-400 mt-1">{T.present}</div>
            </div>
            <div className="flex-1 min-w-[220px]">
              {cap ? (
                <>
                  <div className="flex justify-between text-sm text-neutral-400 mb-1">
                    <span>{T.seatsFilled}</span>
                    <span className={`font-semibold ${capPct! >= 100 ? 'text-red-400' : capPct! >= 90 ? 'text-amber-300' : 'text-white'}`}>
                      {T.pctOf(capPct!, fmt(cap))}
                    </span>
                  </div>
                  <div className="h-4 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${capPct! >= 100 ? 'bg-red-500' : capPct! >= 90 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, capPct!)}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-sm text-neutral-500">{T.noCapacity}</div>
              )}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <Stat label={T.reservations} value={fmt(k.reservasi)} />
                <Stat label={T.notArrived} value={fmt(k.belumDatang)} />
                <Stat label={T.last15} value={`+${fmt(k.last15m)}`} />
              </div>
            </div>
          </div>
          {d.lastWeek ? (
            <div className="mt-3 text-sm text-neutral-400">
              {T.prevService(
                new Date(`${d.lastWeek.tanggal}T00:00:00Z`).toLocaleDateString(T.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
                fmt(d.lastWeek.hadirSaatIni),
                fmt(d.lastWeek.hadir),
              )}
              {vsLast != null ? (
                <span className={`ml-2 font-semibold ${vsLast >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {vsLast >= 0 ? '▲' : '▼'} {Math.abs(vsLast)}%
                </span>
              ) : null}
            </div>
          ) : null}
        </Panel>

        {/* Kurva kedatangan */}
        <Panel title={T.arrivals} icon={ScanLine} className="lg:col-span-2">
          <ArrivalChart data={d.arrival} startLabel={d.ibadah.jamMulai} lang={lang} />
        </Panel>

        {/* Cara check-in & petugas */}
        <Panel title={T.checkin} icon={QrCode}>
          <div className="space-y-2">
            {methods.length === 0 ? <div className="text-sm text-neutral-500">{T.noCheckin}</div> : null}
            {methods.map(([m, v]) => (
              <div key={m}>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-300">{T.method[m] ?? m}</span>
                  <span className="tabular-nums font-semibold">{fmt(v)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-neutral-800 mt-1">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${(v / methodTot) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          {d.scanners.length ? (
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-1">{T.topScanners}</div>
              {d.scanners.map((s) => (
                <div key={s.nama} className="flex justify-between text-sm py-0.5">
                  <span className="text-neutral-300 truncate">{s.nama}</span>
                  <span className="tabular-nums">{fmt(s.n)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        {/* CKids */}
        <Panel title={T.ckids} icon={Baby}>
          {d.ckids.length === 0 ? <div className="text-sm text-neutral-500">{T.noKids}</div> : null}
          <div className="space-y-3">
            {d.ckids.map((c) => {
              const late = c.belumDijemput > 0 && c.menitSejakSelesai != null && c.menitSejakSelesai >= 15;
              return (
                <div key={c.id} className="rounded-lg bg-neutral-950/60 p-3">
                  <div className="text-sm text-neutral-300 truncate">
                    {c.nama} <span className="text-neutral-500">· {c.jamMulai}–{c.jamSelesai}</span>
                  </div>
                  <div className="flex items-end justify-between mt-1">
                    <div>
                      <div className="text-3xl font-bold tabular-nums">{fmt(c.hadir)}</div>
                      <div className="text-xs text-neutral-500">{T.kidsPresent}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-3xl font-bold tabular-nums ${late ? 'text-red-400' : c.belumDijemput ? 'text-amber-300' : 'text-green-400'}`}>
                        {fmt(c.belumDijemput)}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {T.notPicked}
                        {c.menitSejakSelesai != null ? ` · ${T.minAfterEnd(c.menitSejakSelesai)}` : ''}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Tamu */}
        <Panel title={T.guests} icon={UserPlus}>
          <div className="text-5xl font-bold tabular-nums">{fmt(d.tamu.total)}</div>
          <div className="text-neutral-400 text-sm mb-2">{T.guestsPresent}</div>
          <Row label={T.invited} value={fmt(d.tamu.diundang)} />
          <Row label={T.walkIn} value={fmt(d.tamu.walkIn)} />
          <Row label={T.fromHomecell} value={fmt(d.tamu.homecell)} />
          <Row label={T.firstTime} value={fmt(d.tamu.pertamaKali)} tone="text-green-400" />
        </Panel>

        {/* Els App & sistem */}
        <Panel title={T.appSystem} icon={Server}>
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-neutral-400" />
            <span className="text-4xl font-bold tabular-nums">{fmt(d.app.aktif)}</span>
            <span className="text-neutral-400 text-sm">{T.activeInApp}</span>
          </div>
          <div className="text-[11px] text-neutral-500 mb-2">{T.appBreakdown(fmt(d.app.tiket), fmt(d.app.alkitab), fmt(d.app.worship))}</div>
          <Row
            label={T.checkinOk15}
            value={d.system.checkinSuccessPct == null ? '—' : `${d.system.checkinSuccessPct.toLocaleString(T.locale)}%`}
            tone={d.system.checkinSuccessPct == null ? 'text-neutral-500' : d.system.checkinSuccessPct >= 99 ? 'text-green-400' : d.system.checkinSuccessPct >= 98 ? 'text-amber-300' : 'text-red-400'}
          />
          <Row
            label={T.apiOk15}
            value={d.system.successPct == null ? '—' : `${d.system.successPct.toLocaleString(T.locale)}%`}
            tone={d.system.successPct == null ? 'text-neutral-500' : d.system.successPct >= 99.5 ? 'text-green-400' : d.system.successPct >= 98 ? 'text-amber-300' : 'text-red-400'}
          />
          <Row
            label={T.p95}
            value={d.system.p95Ms == null ? '—' : d.system.p95Ms >= 1000 ? `${(d.system.p95Ms / 1000).toFixed(1)} ${T.sec}` : `${d.system.p95Ms} ms`}
            tone={d.system.p95Ms == null ? 'text-neutral-500' : d.system.p95Ms <= 800 ? 'text-green-400' : d.system.p95Ms <= 2000 ? 'text-amber-300' : 'text-red-400'}
          />
          {d.ibadah.linkOnline ? <div className="text-[11px] text-neutral-500 mt-2 truncate">Online: {d.ibadah.linkOnline}</div> : null}
        </Panel>
      </div>
      <div className="text-[11px] text-neutral-600">
        {T.updated(new Date(d.updatedAt).toLocaleTimeString(T.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: d.tz }))}
      </div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}

/** Batang = datang per 5 menit; garis = total kumulatif; garis putus = jam mulai. */
export function ArrivalChart({ data, startLabel, lang = 'id' }: { data: { t: string; n: number; cum: number }[]; startLabel: string; lang?: MonitorLang }) {
  const T = monitorText(lang);
  const W = 800;
  const H = 230;
  const pl = 8;
  const pr = 8;
  const pt = 10;
  const pb = 24;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const maxN = Math.max(1, ...data.map((d) => d.n));
  const maxC = Math.max(1, ...data.map((d) => d.cum));
  const bw = iw / Math.max(1, data.length);
  const startIdx = useMemo(() => data.findIndex((d) => d.t >= startLabel), [data, startLabel]);
  const line = data
    .map((d, i) => `${i ? 'L' : 'M'}${pl + (i + 0.5) * bw} ${pt + ih - (d.cum / maxC) * ih}`)
    .join(' ');
  const peak = data.reduce((m, d) => (d.n > m.n ? d : m), { t: '', n: 0, cum: 0 });
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {data.map((d, i) => {
          const h = (d.n / maxN) * ih * 0.85;
          return (
            <g key={i}>
              <rect x={pl + i * bw + bw * 0.15} y={pt + ih - h} width={bw * 0.7} height={h} rx={2} fill="#0ea5e9" fillOpacity={0.55} />
              {i % 3 === 0 ? (
                <text x={pl + (i + 0.5) * bw} y={H - 6} textAnchor="middle" fontSize="12" fill="#737373">
                  {d.t}
                </text>
              ) : null}
            </g>
          );
        })}
        {startIdx >= 0 ? (
          <line x1={pl + startIdx * bw} x2={pl + startIdx * bw} y1={pt} y2={pt + ih} stroke="#22c55e" strokeDasharray="4 4" />
        ) : null}
        <path d={line} fill="none" stroke="#f97316" strokeWidth={3} strokeLinejoin="round" />
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-neutral-400 mt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-sky-500/60" /> {T.perFive}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-[3px] border-orange-500" /> {T.totalPresent}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-green-500" /> {T.startAt(startLabel)}
        </span>
        {peak.n ? <span className="ml-auto">{T.peak(peak.t, fmt(peak.n))}</span> : null}
      </div>
    </div>
  );
}
