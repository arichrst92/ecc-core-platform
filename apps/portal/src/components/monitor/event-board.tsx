'use client';

/** Papan Monitor Event — gaya sama dengan Monitor Ibadah (latar gelap, angka besar). */
import { AlertTriangle, Info, QrCode, Radio, ScanLine, Server, Smartphone, UserPlus, Users } from 'lucide-react';
import { ArrivalChart, Panel, Row, Stat, fmt } from '@/components/analytics/ibadah-monitor';
import { monitorText, type MonitorLang } from '@/lib/monitor-i18n';
import type { EventMonitorData } from '@/lib/analytics/types';

export function EventBoard({ d, now, lang = 'id' }: { d: EventMonitorData; now: number; lang?: MonitorLang }) {
  const T = monitorText(lang);
  const tgl = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString(T.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const start = new Date(d.startAt).getTime();
  const end = new Date(d.endAt).getTime();
  const status = d.status === 'SELESAI' ? 'SELESAI' : now < start ? 'BELUM' : now <= end ? 'BERLANGSUNG' : 'SELESAI';
  const mmss = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h >= 48) return T.days(Math.floor(h / 24));
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
  };
  const clock = new Date(now).toLocaleTimeString(T.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: d.tz });
  const k = d.kehadiran;
  const q = d.event.quota;
  const qPct = q ? Math.round((k.terdaftar / q) * 100) : null;
  const hadirPct = k.terdaftar ? Math.round((k.hadir / k.terdaftar) * 100) : null;
  const methods = Object.entries(d.methods).sort((a, b) => b[1] - a[1]);
  const methodTot = Math.max(1, methods.reduce((a, [, v]) => a + v, 0));
  const tanggal = d.event.tanggal === d.event.tanggalSelesai ? tgl(d.event.tanggal) : `${tgl(d.event.tanggal)} – ${tgl(d.event.tanggalSelesai)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-neutral-400 text-sm">
            {T.event} · {d.event.cabang === 'Sinode' ? T.sinode : d.event.cabang}
            {d.event.lokasi ? ` · ${d.event.lokasi}` : ''}
          </div>
          <div className="text-3xl lg:text-4xl font-bold leading-tight">{d.event.judul}</div>
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="text-neutral-300 text-lg tabular-nums">
              {tanggal}
              {d.event.jamMulai ? ` · ${d.event.jamMulai}${d.event.jamSelesai ? `–${d.event.jamSelesai}` : ''}` : ''}
            </span>
            {status === 'BELUM' ? (
              <span className="px-3 py-1 rounded-full bg-sky-500/15 text-sky-300 text-sm font-semibold">{T.startsIn(mmss(start - now))}</span>
            ) : status === 'BERLANGSUNG' ? (
              <span className="px-3 py-1 rounded-full bg-green-500/15 text-green-300 text-sm font-semibold inline-flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" /> {T.running(mmss(now - start))}
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-neutral-700/50 text-neutral-300 text-sm font-semibold">{T.ended}</span>
            )}
          </div>
        </div>
        <div className="text-5xl lg:text-6xl font-bold tabular-nums tracking-tight">{clock}</div>
      </div>

      {d.alerts.length ? (
        <div className="space-y-2">
          {d.alerts.map((a, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-base font-semibold ${
                a.level === 'danger'
                  ? 'bg-red-500/15 text-red-300 border border-red-500/40'
                  : a.level === 'warning'
                    ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
                    : 'bg-sky-500/10 text-sky-200 border border-sky-500/30'
              }`}
            >
              {a.level === 'info' ? <Info className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
              {a.text}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <Panel title={T.attendance} icon={Users} className="lg:col-span-2">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-7xl font-bold tabular-nums leading-none">{fmt(k.hadir)}</div>
              <div className="text-neutral-400 mt-1">{hadirPct != null ? T.presentOfRegistered(hadirPct) : T.present}</div>
            </div>
            <div className="flex-1 min-w-[220px]">
              {q ? (
                <>
                  <div className="flex justify-between text-sm text-neutral-400 mb-1">
                    <span>{T.quotaFilled}</span>
                    <span className={`font-semibold ${qPct! >= 100 ? 'text-red-400' : qPct! >= 90 ? 'text-amber-300' : 'text-white'}`}>
                      {T.pctOf(qPct!, fmt(q))}
                    </span>
                  </div>
                  <div className="h-4 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${qPct! >= 100 ? 'bg-red-500' : qPct! >= 90 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, qPct!)}%` }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-sm text-neutral-500">{T.noQuota}</div>
              )}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <Stat label={T.registered} value={fmt(k.terdaftar)} />
                <Stat label={T.notArrived} value={fmt(k.belumDatang)} />
                <Stat label={T.last15} value={`+${fmt(k.last15m)}`} />
              </div>
              {k.sudahBayar != null ? (
                <div className="text-sm text-neutral-400 mt-3">{T.paid(fmt(k.sudahBayar), fmt(k.terdaftar))}</div>
              ) : null}
            </div>
          </div>
        </Panel>

        <Panel title={T.arrivalsToday} icon={ScanLine} className="lg:col-span-2">
          <ArrivalChart data={d.arrival} startLabel={d.event.jamMulai ?? ''} lang={lang} />
        </Panel>

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
          {k.batal ? <div className="text-xs text-neutral-500 mt-3">{T.cancelled(fmt(k.batal))}</div> : null}
        </Panel>

        <Panel title={T.guests} icon={UserPlus}>
          <div className="text-5xl font-bold tabular-nums">{fmt(d.tamu.total)}</div>
          <div className="text-neutral-400 text-sm mb-2">{T.guestsPresent}</div>
          <Row label={T.invited} value={fmt(d.tamu.diundang)} />
          <Row label={T.walkIn} value={fmt(d.tamu.walkIn)} />
          <Row label={T.firstTime} value={fmt(d.tamu.pertamaKali)} tone="text-green-400" />
        </Panel>

        <Panel title={T.appSystem} icon={Server} className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-neutral-400" />
            <span className="text-4xl font-bold tabular-nums">{fmt(d.app.aktif)}</span>
            <span className="text-neutral-400 text-sm">{T.activeInApp}</span>
          </div>
          <div className="text-[11px] text-neutral-500 mb-2">{T.appBreakdownEvent(fmt(d.app.event), fmt(d.app.tiket))}</div>
          <div className="grid sm:grid-cols-3 gap-x-6">
            <Row
              label={T.checkinOk}
              value={d.system.checkinSuccessPct == null ? '—' : `${d.system.checkinSuccessPct.toLocaleString(T.locale)}%`}
              tone={d.system.checkinSuccessPct == null ? 'text-neutral-500' : d.system.checkinSuccessPct >= 99 ? 'text-green-400' : d.system.checkinSuccessPct >= 98 ? 'text-amber-300' : 'text-red-400'}
            />
            <Row
              label={T.apiOk}
              value={d.system.successPct == null ? '—' : `${d.system.successPct.toLocaleString(T.locale)}%`}
              tone={d.system.successPct == null ? 'text-neutral-500' : d.system.successPct >= 99.5 ? 'text-green-400' : d.system.successPct >= 98 ? 'text-amber-300' : 'text-red-400'}
            />
            <Row
              label={T.p95}
              value={d.system.p95Ms == null ? '—' : d.system.p95Ms >= 1000 ? `${(d.system.p95Ms / 1000).toFixed(1)} ${T.sec}` : `${d.system.p95Ms} ms`}
              tone={d.system.p95Ms == null ? 'text-neutral-500' : d.system.p95Ms <= 800 ? 'text-green-400' : d.system.p95Ms <= 2000 ? 'text-amber-300' : 'text-red-400'}
            />
          </div>
          <div className="text-[11px] text-neutral-600 mt-1">{T.last15Short}</div>
        </Panel>
      </div>
      <div className="text-[11px] text-neutral-600">
        {T.updated(new Date(d.updatedAt).toLocaleTimeString(T.locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: d.tz }))}
      </div>
    </div>
  );
}
