'use client';

/**
 * portal.eccchurch.global/monitor — layar monitor ibadah / event TANPA login.
 *
 *   1. Masukkan kode akses (env MONITOR_ACCESS_CODE di server) → token 30 hari
 *      disimpan di browser monitor.
 *   2. Pilih Ibadah atau Event → pilih cabang & ibadah/event-nya.
 *   3. Papan monitor tampil & diperbarui tiap 15 detik. Pilihan diingat,
 *      jadi saat monitor dinyalakan ulang langsung kembali ke papan.
 *
 * Data: core-api /public/monitor/* (header X-Monitor-Token).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Church, Expand, KeyRound, Loader2, LogOut, Minimize, RefreshCw, WifiOff } from 'lucide-react';
import { IbadahBoard } from '@/components/analytics/ibadah-monitor';
import { EventBoard } from '@/components/monitor/event-board';
import type { EventMonitorData, EventMonitorOptions, IbadahMonitor, IbadahMonitorOptions } from '@/lib/analytics/types';
import { monitorText, type MonitorLang, type MonitorText } from '@/lib/monitor-i18n';

const API = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4000';
const LS_TOKEN = 'ecc-monitor.token';
const LS_SEL = 'ecc-monitor.selection';
const LS_LANG = 'ecc-monitor.lang';

type Jenis = 'ibadah' | 'event';
interface Selection {
  jenis: Jenis;
  cabangId: string;
  /** '' = otomatis (ibadah sedang / akan berlangsung). */
  id: string;
  /** Nama ibadah/event; untuk otomatis = nama cabang. */
  label: string;
}

const ls = {
  get: (k: string) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v == null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
    } catch {
      /* abaikan */
    }
  },
};

class TokenInvalid extends Error {}

/** Bahasa aktif dipakai juga untuk teks peringatan dari server. */
let currentLang: MonitorLang = 'id';

async function call<T>(token: string, path: string, params?: Record<string, string | undefined>): Promise<T> {
  try {
    const res = await axios.get<{ data: T }>(`${API}/public/monitor${path}`, {
      params: { ...params, lang: currentLang },
      headers: { 'X-Monitor-Token': token },
      timeout: 20_000,
    });
    return res.data.data;
  } catch (e) {
    if (e instanceof AxiosError && e.response?.status === 401) throw new TokenInvalid();
    throw e;
  }
}

export default function MonitorPage() {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection | null>(null);
  const [lang, setLangState] = useState<MonitorLang>('id');
  currentLang = lang;
  const T = monitorText(lang);
  const setLang = (l: MonitorLang) => {
    currentLang = l;
    setLangState(l);
    ls.set(LS_LANG, l);
  };

  useEffect(() => {
    setToken(ls.get(LS_TOKEN));
    const l = ls.get(LS_LANG);
    if (l === 'en' || l === 'id') {
      currentLang = l;
      setLangState(l);
    }
    try {
      const s = ls.get(LS_SEL);
      if (s) setSel(JSON.parse(s) as Selection);
    } catch {
      /* abaikan */
    }
    setReady(true);
  }, []);

  const lock = useCallback(() => {
    ls.set(LS_TOKEN, null);
    setToken(null);
  }, []);

  const choose = (s: Selection | null) => {
    setSel(s);
    ls.set(LS_SEL, s ? JSON.stringify(s) : null);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {!ready ? null : !token ? (
        <CodeScreen
          T={T}
          langSwitch={<LangSwitch lang={lang} onChange={setLang} />}
          onUnlocked={(t) => {
            ls.set(LS_TOKEN, t);
            setToken(t);
          }}
        />
      ) : !sel ? (
        <PickScreen T={T} langSwitch={<LangSwitch lang={lang} onChange={setLang} />} token={token} onPick={choose} onInvalid={lock} />
      ) : (
        <BoardScreen
          T={T}
          lang={lang}
          langSwitch={<LangSwitch lang={lang} onChange={setLang} />}
          token={token}
          sel={sel}
          onChange={() => choose(null)}
          onInvalid={lock}
        />
      )}
    </div>
  );
}

function LangSwitch({ lang, onChange }: { lang: MonitorLang; onChange: (l: MonitorLang) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-700 bg-neutral-900 p-0.5 text-xs font-semibold">
      {(['id', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={`px-2.5 h-7 rounded-md ${lang === l ? 'bg-orange-500 text-white' : 'text-neutral-400 hover:text-white'}`}
          aria-pressed={lang === l}
        >
          {l === 'id' ? 'ID' : 'EN'}
        </button>
      ))}
    </div>
  );
}

/** "Powered by IDEA" — logo dibuat putih agar terbaca di latar gelap. */
function PoweredByIdea({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-xs text-neutral-500 ${className}`}>
      <span>Powered by</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-idea.webp" alt="IDEA" className="h-5 w-auto brightness-0 invert opacity-80" />
    </div>
  );
}

// ------------------------------------------------------------------ 1. kode akses

function CodeScreen({ T, langSwitch, onUnlocked }: { T: MonitorText; langSwitch: React.ReactNode; onUnlocked: (token: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setErr(T.enterCode);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await axios.post<{ data: { token: string } }>(`${API}/public/monitor/unlock`, { code: code.trim() }, { timeout: 15_000 });
      onUnlocked(res.data.data.token);
    } catch (e) {
      const code = e instanceof AxiosError ? (e.response?.data as { error?: { code?: string } } | undefined)?.error?.code : null;
      setErr(
        code === 'MONITOR_CODE_INVALID'
          ? T.wrongCode
          : code === 'RATE_LIMIT_EXCEEDED'
            ? T.tooMany
            : code === 'MONITOR_NOT_CONFIGURED'
              ? T.notConfigured
              : T.netError,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      <div className="w-full max-w-sm flex justify-end">{langSwitch}</div>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6">
        <div className="flex items-center gap-3 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ecc.webp" alt="ECC" className="w-10 h-10 rounded-lg" />
          <div>
            <div className="font-bold text-lg">{T.appTitle}</div>
            <div className="text-xs text-neutral-400">{T.appSub}</div>
          </div>
        </div>
        <label className="block text-sm text-neutral-300 mb-1.5">{T.accessCode}</label>
        <div className="flex items-center gap-2 rounded-lg bg-neutral-950 border border-neutral-700 px-3 focus-within:border-orange-500">
          <KeyRound className="w-4 h-4 text-neutral-500" />
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setErr(null);
            }}
            className="flex-1 h-11 bg-transparent outline-none text-white tracking-widest"
            placeholder="••••••••"
          />
        </div>
        {err ? <div className="text-sm text-red-400 mt-2">{err}</div> : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full h-11 rounded-lg bg-orange-500 hover:bg-orange-600 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} {T.openMonitor}
        </button>
        <p className="text-[11px] text-neutral-500 mt-3">{T.codeHint}</p>
      </form>
      <PoweredByIdea />
    </div>
  );
}

// ------------------------------------------------------------------ 2. pilih ibadah / event

function PickScreen({
  T,
  langSwitch,
  token,
  onPick,
  onInvalid,
}: {
  T: MonitorText;
  langSwitch: React.ReactNode;
  token: string;
  onPick: (s: Selection) => void;
  onInvalid: () => void;
}) {
  const [jenis, setJenis] = useState<Jenis | null>(null);
  const [cabangId, setCabangId] = useState(() => ls.get('ecc-monitor.cabangId') ?? '');

  const cabang = useQuery({
    queryKey: ['monitor', 'cabang', token],
    queryFn: () => call<{ id: string; nama: string }[]>(token, '/cabang'),
    retry: (n, e) => !(e instanceof TokenInvalid) && n < 2,
  });
  const ibadah = useQuery({
    queryKey: ['monitor', 'ibadah-options', cabangId],
    queryFn: () => call<IbadahMonitorOptions>(token, '/ibadah/options', { cabangId }),
    enabled: jenis === 'ibadah' && !!cabangId,
  });
  const events = useQuery({
    queryKey: ['monitor', 'event-options', cabangId],
    queryFn: () => call<EventMonitorOptions>(token, '/event/options', { cabangId: cabangId || undefined }),
    enabled: jenis === 'event',
  });
  const invalid = [cabang.error, ibadah.error, events.error].some((e) => e instanceof TokenInvalid);
  useEffect(() => {
    if (invalid) onInvalid();
  }, [invalid, onInvalid]);
  useEffect(() => {
    if (!cabangId && jenis === 'ibadah' && cabang.data?.[0]) setCabangId(cabang.data[0].id);
  }, [cabangId, jenis, cabang.data]);

  const cabangNama = cabang.data?.find((c) => c.id === cabangId)?.nama ?? '';
  const statusPill = (s: string) =>
    s === 'BERLANGSUNG' ? (
      <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 text-xs font-semibold">{T.stRunning}</span>
    ) : s === 'BELUM' ? (
      <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 text-xs font-semibold">{T.stUpcoming}</span>
    ) : (
      <span className="px-2 py-0.5 rounded-full bg-neutral-700/60 text-neutral-300 text-xs font-semibold">{T.stEnded}</span>
    );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">{T.pickTitle}</div>
          <div className="text-sm text-neutral-400">{T.pickSub}</div>
        </div>
        <div className="flex items-center gap-3">
          {langSwitch}
          <button onClick={onInvalid} className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1">
            <LogOut className="w-3.5 h-3.5" /> {T.lock}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(
          [
            ['ibadah', T.ibadah, T.ibadahSub, Church],
            ['event', T.event, T.eventSub, CalendarDays],
          ] as const
        ).map(([k, label, sub, Icon]) => (
          <button
            key={k}
            onClick={() => setJenis(k)}
            className={`rounded-2xl border p-5 text-left transition ${jenis === k ? 'border-orange-500 bg-orange-500/10' : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'}`}
          >
            <Icon className="w-7 h-7 text-orange-400" />
            <div className="text-xl font-bold mt-3">{label}</div>
            <div className="text-sm text-neutral-400">{sub}</div>
          </button>
        ))}
      </div>

      {jenis ? (
        <div className="space-y-3">
          <select
            value={cabangId}
            onChange={(e) => {
              setCabangId(e.target.value);
              ls.set('ecc-monitor.cabangId', e.target.value);
            }}
            className="select-dark h-11 w-full rounded-lg px-3"
          >
            {jenis === 'event' ? <option value="">{T.allBranches}</option> : null}
            {(cabang.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>

          {jenis === 'ibadah' ? (
            <div className="space-y-2">
              {cabangId ? (
                <button
                  onClick={() => onPick({ jenis: 'ibadah', cabangId, id: '', label: cabangNama })}
                  className="w-full rounded-xl border border-dashed border-orange-500/60 bg-orange-500/5 p-4 text-left hover:bg-orange-500/10"
                >
                  <div className="font-semibold">{T.auto}</div>
                  <div className="text-sm text-neutral-400">{T.autoSub(cabangNama)}</div>
                </button>
              ) : null}
              {ibadah.isPending && cabangId ? <Loading text={T.loading} /> : null}
              {ibadah.data?.items.length === 0 ? <div className="text-sm text-neutral-500 py-4 text-center">{T.noIbadahToday}</div> : null}
              {(ibadah.data?.items ?? []).map((o) => (
                <button
                  key={o.id}
                  onClick={() => onPick({ jenis: 'ibadah', cabangId, id: o.id, label: o.nama })}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left hover:border-neutral-600 flex items-center gap-4"
                >
                  <div className="text-xl font-bold tabular-nums w-28">
                    {o.jamMulai}
                    <span className="text-neutral-500 text-sm font-normal">–{o.jamSelesai}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{o.nama}</div>
                    {o.isKidsIbadah ? <div className="text-xs text-neutral-400">{T.kids}</div> : null}
                  </div>
                  {statusPill(o.status)}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {events.isPending ? <Loading text={T.loading} /> : null}
              {events.data?.items.length === 0 ? <div className="text-sm text-neutral-500 py-4 text-center">{T.noEvents}</div> : null}
              {(events.data?.items ?? []).map((o) => (
                <button
                  key={o.id}
                  onClick={() => onPick({ jenis: 'event', cabangId, id: o.id, label: o.judul })}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left hover:border-neutral-600 flex items-center gap-4"
                >
                  <div className="w-28 text-sm">
                    <div className="font-bold">
                      {new Date(`${o.tanggal}T00:00:00Z`).toLocaleDateString(T.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                    </div>
                    <div className="text-neutral-500">{o.jamMulai ?? ''}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{o.judul}</div>
                    <div className="text-xs text-neutral-400">{o.cabang === 'Sinode' ? T.sinode : o.cabang}</div>
                  </div>
                  {statusPill(o.status)}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> {text}
    </div>
  );
}

// ------------------------------------------------------------------ 3. papan

function BoardScreen({
  T,
  lang,
  langSwitch,
  token,
  sel,
  onChange,
  onInvalid,
}: {
  T: MonitorText;
  lang: MonitorLang;
  langSwitch: React.ReactNode;
  token: string;
  sel: Selection;
  onChange: () => void;
  onInvalid: () => void;
}) {
  const q = useQuery<IbadahMonitor | EventMonitorData>({
    queryKey: ['monitor', 'board', sel.jenis, sel.cabangId, sel.id, lang],
    queryFn: (): Promise<IbadahMonitor | EventMonitorData> =>
      sel.jenis === 'ibadah'
        ? call<IbadahMonitor>(token, '/ibadah', { cabangId: sel.cabangId || undefined, ibadahId: sel.id || undefined })
        : call<EventMonitorData>(token, '/event', { eventId: sel.id }),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    retry: (n, e) => !(e instanceof TokenInvalid) && n < 3,
  });
  useEffect(() => {
    if (q.error instanceof TokenInvalid) onInvalid();
  }, [q.error, onInvalid]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, []);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.();
    } catch {
      /* abaikan */
    }
  };
  // Layar tetap menyala (bila browser mendukung).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    return () => void lock?.release().catch(() => {});
  }, []);

  const stale = q.isError || (q.dataUpdatedAt > 0 && now - q.dataUpdatedAt > 60_000);
  const data = q.data;

  return (
    <div className="h-screen overflow-hidden flex flex-col px-5 pt-4 pb-3">
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-neutral-400">
        <span className="font-semibold text-neutral-300">{sel.jenis === 'ibadah' ? T.ibadah : T.event}</span>
        <span>· {sel.jenis === 'ibadah' && !sel.id ? T.autoLabel(sel.label) : sel.label}</span>
        <div className="ml-auto flex items-center gap-3">
          {stale ? (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <WifiOff className="w-3.5 h-3.5" />{' '}
              {T.lastUpdated(q.dataUpdatedAt ? new Date(q.dataUpdatedAt).toLocaleTimeString(T.locale, { hour: '2-digit', minute: '2-digit' }) : '—')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> {T.live}
            </span>
          )}
          <button onClick={() => void q.refetch()} className="h-8 px-2 rounded-lg border border-neutral-800 hover:bg-neutral-900" aria-label={T.reload}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {langSwitch}
          <button onClick={onChange} className="h-8 px-3 rounded-lg border border-neutral-800 hover:bg-neutral-900">
            {T.change}
          </button>
          <button onClick={toggleFull} className="h-8 px-3 rounded-lg border border-neutral-800 hover:bg-neutral-900 inline-flex items-center gap-1.5">
            {full ? <Minimize className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
            {full ? T.exitFullscreen : T.fullscreen}
          </button>
        </div>
      </div>

      <FitToScreen>
      {!data ? (
        q.isError ? (
          <div className="py-24 text-center text-red-400">{T.loadFailed}</div>
        ) : (
          <Loading text={T.loading} />
        )
      ) : sel.jenis === 'ibadah' ? (
        (data as IbadahMonitor).empty ? (
          <div className="py-24 text-center text-neutral-400">
            <div className="text-2xl font-semibold text-neutral-200">{T.noIbadahTodayBig}</div>
            <div className="mt-1">{(data as Extract<IbadahMonitor, { empty: true }>).cabang.nama}</div>
          </div>
        ) : (
          <IbadahBoard d={data as Extract<IbadahMonitor, { empty: false }>} now={now} lang={lang} />
        )
      ) : (
        <EventBoard d={data as EventMonitorData} now={now} lang={lang} />
      )}
      </FitToScreen>
      <PoweredByIdea className="shrink-0 pt-2" />
    </div>
  );
}

/**
 * Papan selalu muat dalam satu layar (tanpa scroll vertikal): isi diperkecil
 * (atau diperbesar di layar TV) proporsional mengikuti tinggi layar, lebarnya
 * dikompensasi supaya tetap memenuhi layar. Di layar sangat kecil (skala
 * < 0,55) kembali ke mode scroll biasa agar teks tetap terbaca.
 */
function FitToScreen({ children }: { children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const MIN = 0.55;
  /** Layar TV besar: isi diperbesar sampai 1,35× supaya tidak banyak ruang kosong. */
  const MAX = 1.35;

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const avail = o.clientHeight;
        if (!avail) return;
        let s = 1;
        for (let k = 0; k < 5; k++) {
          i.style.width = `${100 / s}%`;
          const h = i.scrollHeight;
          const next = Math.min(MAX, avail / Math.max(1, h));
          if (Math.abs(next - s) < 0.004) {
            s = next;
            break;
          }
          s = next;
        }
        if (s < MIN) s = 1; // terlalu kecil → biarkan scroll
        i.style.width = `${100 / s}%`;
        setScale((prev) => (Math.abs(prev - s) < 0.004 ? prev : s));
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const scrolling = scale === 1;
  return (
    <div ref={outer} className={`flex-1 min-h-0 ${scrolling ? 'overflow-y-auto' : 'overflow-hidden'}`}>
      <div ref={inner} style={{ transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left', width: `${100 / scale}%` }}>
        {children}
      </div>
    </div>
  );
}
