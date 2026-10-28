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
import { useCallback, useEffect, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Church, Expand, KeyRound, Loader2, LogOut, Minimize, RefreshCw, WifiOff } from 'lucide-react';
import { IbadahBoard } from '@/components/analytics/ibadah-monitor';
import { EventBoard } from '@/components/monitor/event-board';
import type { EventMonitorData, EventMonitorOptions, IbadahMonitor, IbadahMonitorOptions } from '@/lib/analytics/types';

const API = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4000';
const LS_TOKEN = 'ecc-monitor.token';
const LS_SEL = 'ecc-monitor.selection';

type Jenis = 'ibadah' | 'event';
interface Selection {
  jenis: Jenis;
  cabangId: string;
  /** '' = otomatis (ibadah sedang / akan berlangsung). */
  id: string;
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

async function call<T>(token: string, path: string, params?: Record<string, string | undefined>): Promise<T> {
  try {
    const res = await axios.get<{ data: T }>(`${API}/public/monitor${path}`, { params, headers: { 'X-Monitor-Token': token }, timeout: 20_000 });
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

  useEffect(() => {
    setToken(ls.get(LS_TOKEN));
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
          onUnlocked={(t) => {
            ls.set(LS_TOKEN, t);
            setToken(t);
          }}
        />
      ) : !sel ? (
        <PickScreen token={token} onPick={choose} onInvalid={lock} />
      ) : (
        <BoardScreen token={token} sel={sel} onChange={() => choose(null)} onInvalid={lock} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ 1. kode akses

function CodeScreen({ onUnlocked }: { onUnlocked: (token: string) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      setErr('Masukkan kode akses.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await axios.post<{ data: { token: string } }>(`${API}/public/monitor/unlock`, { code: code.trim() }, { timeout: 15_000 });
      onUnlocked(res.data.data.token);
    } catch (e) {
      const msg = e instanceof AxiosError ? (e.response?.data as { error?: { message?: string } } | undefined)?.error?.message : null;
      setErr(msg ?? 'Tidak dapat terhubung ke server. Periksa koneksi internet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-neutral-900 border border-neutral-800 p-6">
        <div className="flex items-center gap-3 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ecc.webp" alt="ECC" className="w-10 h-10 rounded-lg" />
          <div>
            <div className="font-bold text-lg">Monitor ECC</div>
            <div className="text-xs text-neutral-400">Layar ibadah & event · command room</div>
          </div>
        </div>
        <label className="block text-sm text-neutral-300 mb-1.5">Kode akses</label>
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
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Buka monitor
        </button>
        <p className="text-[11px] text-neutral-500 mt-3">Kode diberikan oleh tim IT. Monitor ini tetap terbuka 30 hari tanpa perlu memasukkan kode lagi.</p>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ 2. pilih ibadah / event

function PickScreen({ token, onPick, onInvalid }: { token: string; onPick: (s: Selection) => void; onInvalid: () => void }) {
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
      <span className="px-2 py-0.5 rounded-full bg-green-500/15 text-green-300 text-xs font-semibold">Berlangsung</span>
    ) : s === 'BELUM' ? (
      <span className="px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 text-xs font-semibold">Akan datang</span>
    ) : (
      <span className="px-2 py-0.5 rounded-full bg-neutral-700/60 text-neutral-300 text-xs font-semibold">Selesai</span>
    );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">Pilih yang ditampilkan</div>
          <div className="text-sm text-neutral-400">Monitor ini akan mengingat pilihan Anda.</div>
        </div>
        <button onClick={onInvalid} className="text-xs text-neutral-400 hover:text-white inline-flex items-center gap-1">
          <LogOut className="w-3.5 h-3.5" /> Kunci monitor
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {(
          [
            ['ibadah', 'Ibadah', 'Kehadiran, check-in, CKids, tamu', Church],
            ['event', 'Event', 'Peserta, kuota, check-in, tamu', CalendarDays],
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
            className="h-11 w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 text-white"
          >
            {jenis === 'event' ? <option value="">Semua cabang</option> : null}
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
                  onClick={() => onPick({ jenis: 'ibadah', cabangId, id: '', label: `Otomatis · ${cabangNama}` })}
                  className="w-full rounded-xl border border-dashed border-orange-500/60 bg-orange-500/5 p-4 text-left hover:bg-orange-500/10"
                >
                  <div className="font-semibold">Otomatis</div>
                  <div className="text-sm text-neutral-400">Selalu tampilkan ibadah yang sedang / akan berlangsung hari ini di {cabangNama}</div>
                </button>
              ) : null}
              {ibadah.isPending && cabangId ? <Loading /> : null}
              {ibadah.data?.items.length === 0 ? <div className="text-sm text-neutral-500 py-4 text-center">Tidak ada ibadah hari ini di cabang ini.</div> : null}
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
                    {o.isKidsIbadah ? <div className="text-xs text-neutral-400">Ibadah anak (CKids)</div> : null}
                  </div>
                  {statusPill(o.status)}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {events.isPending ? <Loading /> : null}
              {events.data?.items.length === 0 ? (
                <div className="text-sm text-neutral-500 py-4 text-center">Tidak ada event dari kemarin sampai 7 hari ke depan.</div>
              ) : null}
              {(events.data?.items ?? []).map((o) => (
                <button
                  key={o.id}
                  onClick={() => onPick({ jenis: 'event', cabangId, id: o.id, label: o.judul })}
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left hover:border-neutral-600 flex items-center gap-4"
                >
                  <div className="w-28 text-sm">
                    <div className="font-bold">
                      {new Date(`${o.tanggal}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                    </div>
                    <div className="text-neutral-500">{o.jamMulai ?? ''}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{o.judul}</div>
                    <div className="text-xs text-neutral-400">{o.cabang}</div>
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

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-neutral-400 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
    </div>
  );
}

// ------------------------------------------------------------------ 3. papan

function BoardScreen({ token, sel, onChange, onInvalid }: { token: string; sel: Selection; onChange: () => void; onInvalid: () => void }) {
  const q = useQuery<IbadahMonitor | EventMonitorData>({
    queryKey: ['monitor', 'board', sel.jenis, sel.cabangId, sel.id],
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
    <div className="p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-neutral-400">
        <span className="font-semibold text-neutral-300">{sel.jenis === 'ibadah' ? 'Ibadah' : 'Event'}</span>
        <span>· {sel.label}</span>
        <div className="ml-auto flex items-center gap-3">
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
          <button onClick={() => void q.refetch()} className="h-8 px-2 rounded-lg border border-neutral-800 hover:bg-neutral-900" aria-label="Muat ulang">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onChange} className="h-8 px-3 rounded-lg border border-neutral-800 hover:bg-neutral-900">
            Ganti
          </button>
          <button onClick={toggleFull} className="h-8 px-3 rounded-lg border border-neutral-800 hover:bg-neutral-900 inline-flex items-center gap-1.5">
            {full ? <Minimize className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
            {full ? 'Keluar layar penuh' : 'Layar penuh'}
          </button>
        </div>
      </div>

      {!data ? (
        q.isError ? (
          <div className="py-24 text-center text-red-400">Gagal memuat data. Mencoba lagi otomatis…</div>
        ) : (
          <Loading />
        )
      ) : sel.jenis === 'ibadah' ? (
        (data as IbadahMonitor).empty ? (
          <div className="py-24 text-center text-neutral-400">
            <div className="text-2xl font-semibold text-neutral-200">Tidak ada ibadah hari ini</div>
            <div className="mt-1">{(data as Extract<IbadahMonitor, { empty: true }>).cabang.nama}</div>
          </div>
        ) : (
          <IbadahBoard d={data as Extract<IbadahMonitor, { empty: false }>} now={now} />
        )
      ) : (
        <EventBoard d={data as EventMonitorData} now={now} />
      )}
    </div>
  );
}
