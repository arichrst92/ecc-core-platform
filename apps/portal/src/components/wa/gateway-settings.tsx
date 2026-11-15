'use client';

/**
 * Portal → WhatsApp Config → "Gateway & OTP".
 * Saklar provider WhatsApp (Fonnte, StarSender, Resmi.ID untuk OTP), urutan
 * Fonnte/StarSender, OTP salinan email, dan lewati verifikasi nomor HP saat
 * onboarding — tanpa ubah .env / restart. Kredensial tetap di .env.
 * API: GET/PATCH /admin/wa-config/gateway
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useState } from 'react';
import { ArrowDownUp, KeyRound, Loader2, Mail, Router, Send, UserCheck } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type EmailMode = 'fallback' | 'always' | 'off';
/** Fungsi provider: OTP saja / notifikasi saja / keduanya. */
type Usage = 'otp' | 'notif' | 'both';
const USAGE_LABEL: Record<Usage, string> = { both: 'OTP & notifikasi', otp: 'OTP saja', notif: 'Notifikasi saja (non-OTP)' };
interface Settings {
  waProviderOrder: 'fonnte,starsender' | 'starsender,fonnte' | null;
  waFonnteEnabled: boolean;
  waStarsenderEnabled: boolean;
  waResmiOtpEnabled: boolean;
  waFonnteUsage: Usage;
  waStarsenderUsage: Usage;
  otpEmailCopy: EmailMode | null;
  onboardingSkipNoHpOtp: boolean | null;
}
interface Gateway {
  settings: Settings;
  providers: {
    order: string;
    fonnte: { configured: boolean; enabled: boolean; usage: Usage };
    starsender: { configured: boolean; enabled: boolean; usage: Usage };
    resmi: { configured: boolean; enabled: boolean; template: string | null; lang: string; usage: Usage };
  };
  health: Record<ProviderKey, { state: 'ok' | 'error' | 'unknown'; lastOkAt: string | null; lastErrAt: string | null; lastErr: string | null }>;
  fonnteDevice: { connected: boolean; device: string | null; error?: string } | null;
  effective: { order: string; otpEmailCopy: EmailMode; onboardingSkipNoHpOtp: boolean };
  env: { waProviderOrder: string | null; otpEmailCopy: string | null; onboardingSkipNoHpOtp: string | null };
}

type ProviderKey = 'resmi' | 'fonnte' | 'starsender';
const KEY = ['wa-config', 'gateway'];
const jam = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Pil status: terhubung / terputus / belum ada data. */
function StatusPill({ tone, children, title }: { tone: 'green' | 'red' | 'gray' | 'amber'; children: React.ReactNode; title?: string }) {
  const cls = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    gray: 'bg-neutral-50 text-neutral-500 border-neutral-200',
  }[tone];
  const dot = { green: 'bg-emerald-500', red: 'bg-red-500', amber: 'bg-amber-500', gray: 'bg-neutral-400' }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-40 ${on ? 'bg-emerald-500' : 'bg-neutral-300'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function Badge({ ok, okText, noText }: { ok: boolean; okText: string; noText: string }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
      {ok ? okText : noText}
    </span>
  );
}

export function GatewaySettings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: KEY,
    queryFn: async () => (await apiClient.get<{ data: Gateway }>('/admin/wa-config/gateway')).data.data,
  });
  const save = useMutation({
    mutationFn: async (patch: Partial<Settings>) => (await apiClient.patch<{ data: Gateway }>('/admin/wa-config/gateway', patch)).data.data,
    onSuccess: (d) => {
      qc.setQueryData(KEY, d);
      toast.success('Pengaturan WhatsApp disimpan — langsung berlaku');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });

  const [testing, setTesting] = useState<ProviderKey | null>(null);
  const test = useMutation({
    mutationFn: async (provider: ProviderKey) => {
      setTesting(provider);
      return (
        await apiClient.post<{ data: { ok: boolean; to?: string; error?: string; gateway: Gateway } }>('/admin/wa-config/gateway/test', { provider })
      ).data.data;
    },
    onSuccess: (r) => {
      qc.setQueryData(KEY, r.gateway);
      if (r.ok) toast.success(`Pesan tes terkirim ke ${r.to} — cek WhatsApp Anda`);
      else toast.error(`Tes gagal: ${r.error}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Tes gagal'),
    onSettled: () => setTesting(null),
  });

  const d = q.data;
  const busy = save.isPending;

  if (q.isLoading) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6 text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
      </div>
    );
  }
  if (!d) return <div className="bg-white border border-red-200 rounded-xl p-4 mb-6 text-sm text-red-600">Gagal memuat pengaturan gateway.</div>;

  const p = d.providers;
  // Rantai per jenis pesan — prioritas tetap, provider di luar fungsinya dilewati.
  const live = (k: 'fonnte' | 'starsender') => p[k].configured && p[k].enabled;
  const serves = (k: 'fonnte' | 'starsender', kind: 'otp' | 'notif') => p[k].usage === 'both' || p[k].usage === kind;
  const NAME = { fonnte: 'Fonnte', starsender: 'StarSender' } as const;
  const orderKeys = d.effective.order.split(',').filter((k): k is 'fonnte' | 'starsender' => k === 'fonnte' || k === 'starsender');
  const otpChain = [
    p.resmi.configured && p.resmi.enabled ? 'Resmi.ID' : null,
    ...orderKeys.map((k) => (live(k) && serves(k, 'otp') ? NAME[k] : null)),
  ].filter(Boolean) as string[];
  const notifChain = orderKeys.filter((k) => live(k) && serves(k, 'notif')).map((k) => NAME[k]);

  /** Status koneksi: Fonnte dari API perangkat; lainnya dari hasil kirim terakhir / tes. */
  const statusOf = (key: ProviderKey, st: { configured: boolean; enabled: boolean }) => {
    if (!st.configured) return <StatusPill tone="gray">Belum dikonfigurasi</StatusPill>;
    const h = d.health[key];
    const last =
      h.state === 'ok' && h.lastOkAt ? `Terkirim terakhir ${jam(h.lastOkAt)}` : h.state === 'error' && h.lastErrAt ? `Gagal ${jam(h.lastErrAt)}` : null;
    let pill: React.ReactNode;
    if (key === 'fonnte' && d.fonnteDevice) {
      pill = d.fonnteDevice.connected ? (
        <StatusPill tone="green">Connect{d.fonnteDevice.device ? ` · ${d.fonnteDevice.device}` : ''}</StatusPill>
      ) : (
        <StatusPill tone="red" title={d.fonnteDevice.error}>
          Disconnect
        </StatusPill>
      );
    } else if (h.state === 'ok') pill = <StatusPill tone="green">Connect</StatusPill>;
    else if (h.state === 'error') pill = <StatusPill tone="red" title={h.lastErr ?? undefined}>Disconnect / gagal</StatusPill>;
    else pill = <StatusPill tone="gray">Belum dicek — tekan Tes</StatusPill>;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {pill}
        {!st.enabled ? <StatusPill tone="amber">Dimatikan</StatusPill> : null}
        {last ? <span className="text-[11px] text-neutral-500">{last}</span> : null}
        {h.state === 'error' && h.lastErr ? <span className="w-full text-[11px] text-red-600 break-words">{h.lastErr}</span> : null}
      </div>
    );
  };

  const providerRow = (
    rank: number,
    key: ProviderKey,
    title: string,
    sub: string,
    st: { configured: boolean; enabled: boolean },
    field: 'waFonnteEnabled' | 'waStarsenderEnabled' | 'waResmiOtpEnabled',
    envHint: string,
  ) => (
    <div key={key} className="flex items-start gap-3 py-3">
      <span className="w-7 h-7 rounded-full bg-neutral-100 text-neutral-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-neutral-900">{title}</div>
        <p className="text-xs text-neutral-500 mb-1.5">{sub}</p>
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <span className="text-[11px] font-semibold text-neutral-500">Fungsi:</span>
          {key === 'resmi' ? (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700" title="Resmi.ID hanya mengirim template OTP (Authentication)">
              OTP saja
            </span>
          ) : (
            <select
              value={(key === 'fonnte' ? d.settings.waFonnteUsage : d.settings.waStarsenderUsage) ?? 'both'}
              disabled={busy}
              onChange={(e) =>
                save.mutate({ [key === 'fonnte' ? 'waFonnteUsage' : 'waStarsenderUsage']: e.target.value as Usage } as Partial<Settings>)
              }
              className="px-2 py-1 border border-neutral-300 rounded-md text-xs"
            >
              {(['both', 'otp', 'notif'] as Usage[]).map((u) => (
                <option key={u} value={u}>
                  {USAGE_LABEL[u]}
                </option>
              ))}
            </select>
          )}
        </div>
        {statusOf(key, st)}
        {!st.configured ? <p className="text-[11px] text-amber-700 mt-1">Isi {envHint} di .env VPS untuk memakai provider ini.</p> : null}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => test.mutate(key)}
          disabled={!st.configured || test.isPending}
          title={key === 'resmi' ? 'Kirim template OTP contoh (123456) ke nomor Anda' : 'Kirim pesan tes ke nomor Anda'}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 text-xs font-medium hover:bg-neutral-50 disabled:opacity-40"
        >
          {testing === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Tes
        </button>
        <Toggle on={st.enabled} disabled={busy || !st.configured} onChange={(v) => save.mutate({ [field]: v } as Partial<Settings>)} />
      </div>
    </div>
  );

  // Prioritas: Resmi.ID (OTP) → urutan Fonnte/StarSender.
  const textOrder = d.effective.order.split(',').filter((k): k is 'fonnte' | 'starsender' => k === 'fonnte' || k === 'starsender');
  const rows: [ProviderKey, string, string, { configured: boolean; enabled: boolean }, 'waFonnteEnabled' | 'waStarsenderEnabled' | 'waResmiOtpEnabled', string][] = [
    [
      'resmi',
      'Resmi.ID (WABA resmi)',
      `Khusus OTP, dicoba paling awal.${p.resmi.template ? ` Template: ${p.resmi.template} (${p.resmi.lang}).` : ''} Template harus sudah disetujui Meta.`,
      p.resmi,
      'waResmiOtpEnabled',
      'RESMI_API_KEY, RESMI_PHONE_ID, RESMI_OTP_TEMPLATE',
    ],
    ...textOrder.map(
      (k) =>
        (k === 'fonnte'
          ? ['fonnte', 'Fonnte', 'Non-official (teks bebas).', p.fonnte, 'waFonnteEnabled', 'FONNTE_TOKEN']
          : ['starsender', 'StarSender', 'Non-official (teks bebas).', p.starsender, 'waStarsenderEnabled', 'STARSENDER_DEVICE_KEY']) as (typeof rows)[number],
    ),
  ];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl mb-6 overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
          <Router className="w-5 h-5" />
        </span>
        <div className="flex-1">
          <h2 className="font-semibold text-neutral-900">Gateway & OTP</h2>
          <p className="text-xs text-neutral-500">
            Nyalakan / matikan provider dan atur cadangan OTP tanpa ubah .env. Berlaku langsung. Token & API key tetap di .env.
          </p>
        </div>
        {busy ? <Loader2 className="w-4 h-4 animate-spin text-neutral-400" /> : null}
      </div>

      <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-100 text-xs text-neutral-700 space-y-1">
        <div>
          <b>Urutan OTP:</b> {otpChain.length ? otpChain.join(' → ') : <span className="text-red-600 font-semibold">tidak ada provider aktif</span>}
          {d.effective.otpEmailCopy !== 'off' ? ` · email ${d.effective.otpEmailCopy === 'always' ? '(selalu)' : '(bila WA gagal)'}` : ''}
        </div>
        <div>
          <b>Notifikasi:</b>{' '}
          {notifChain.length ? notifChain.join(' → ') : <span className="text-red-600 font-semibold">tidak ada provider aktif — notifikasi WA tidak terkirim</span>}
        </div>
      </div>

      <div className="px-5 divide-y divide-neutral-100">
        {rows.map(([key, title, sub, st, field, env], i) => providerRow(i + 1, key, title, sub, st, field, env))}

        {/* Urutan */}
        <div className="flex flex-wrap items-center gap-3 py-3">
          <ArrowDownUp className="w-4 h-4 text-neutral-500" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold text-neutral-900">Urutan Fonnte / StarSender (setelah Resmi.ID)</div>
            <p className="text-xs text-neutral-500">Yang pertama dipakai; yang kedua otomatis jadi cadangan.</p>
          </div>
          <select
            value={d.settings.waProviderOrder ?? ''}
            disabled={busy}
            onChange={(e) => save.mutate({ waProviderOrder: (e.target.value || null) as Settings['waProviderOrder'] })}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          >
            <option value="">Ikuti .env ({d.env.waProviderOrder ?? 'fonnte,starsender'})</option>
            <option value="fonnte,starsender">Fonnte → StarSender</option>
            <option value="starsender,fonnte">StarSender → Fonnte</option>
          </select>
        </div>

        {/* OTP email */}
        <div className="py-3">
          <div className="flex items-center gap-3 mb-2">
            <Mail className="w-4 h-4 text-neutral-500" />
            <div className="flex-1">
              <div className="font-semibold text-neutral-900">Kode OTP juga lewat email</div>
              <p className="text-xs text-neutral-500">Untuk login & pendaftaran, ke email jemaat / pendaftar (bila ada).</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            {(
              [
                [null, 'Ikuti .env', `Saat ini: ${d.env.otpEmailCopy ?? 'fallback'}`],
                ['fallback', 'Bila WA gagal', 'Email hanya saat semua WA gagal'],
                ['always', 'Selalu', 'Saat WA antre / terblokir'],
                ['off', 'Mati', 'Hanya WhatsApp'],
              ] as [EmailMode | null, string, string][]
            ).map(([v, label, hint]) => {
              const on = d.settings.otpEmailCopy === v;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={busy}
                  onClick={() => save.mutate({ otpEmailCopy: v })}
                  className={`text-left rounded-lg border px-3 py-2 ${on ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-neutral-200 hover:border-neutral-300'}`}
                >
                  <div className="text-sm font-semibold text-neutral-900">{label}</div>
                  <div className="text-[11px] text-neutral-500">{hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Onboarding skip */}
        <div className="flex flex-wrap items-center gap-3 py-3">
          <UserCheck className="w-4 h-4 text-neutral-500" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold text-neutral-900">Lewati verifikasi nomor HP saat onboarding</div>
            <p className="text-xs text-neutral-500">
              Jemaat yang masuk lewat email (magic link) & belum punya nomor HP tidak diminta nomor + OTP WhatsApp. Nyalakan saat WhatsApp bermasalah.
            </p>
          </div>
          <select
            value={d.settings.onboardingSkipNoHpOtp == null ? '' : d.settings.onboardingSkipNoHpOtp ? 'on' : 'off'}
            disabled={busy}
            onChange={(e) => save.mutate({ onboardingSkipNoHpOtp: e.target.value === '' ? null : e.target.value === 'on' })}
            className="px-3 py-2 border border-neutral-300 rounded-lg text-sm"
          >
            <option value="">Ikuti .env ({d.env.onboardingSkipNoHpOtp === 'true' ? 'dilewati' : 'diminta'})</option>
            <option value="on">Lewati (tidak diminta)</option>
            <option value="off">Wajib verifikasi</option>
          </select>
        </div>
      </div>

      <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-[11px] text-amber-900 flex items-start gap-2">
        <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Mematikan provider tidak menghapus kredensialnya. Kalau semua provider WhatsApp dimatikan, OTP hanya terkirim lewat email (bila diaktifkan).
        </span>
      </div>
    </div>
  );
}
