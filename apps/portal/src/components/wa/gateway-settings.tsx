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
import { ArrowDownUp, KeyRound, Loader2, Mail, Router, UserCheck } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type EmailMode = 'fallback' | 'always' | 'off';
interface Settings {
  waProviderOrder: 'fonnte,starsender' | 'starsender,fonnte' | null;
  waFonnteEnabled: boolean;
  waStarsenderEnabled: boolean;
  waResmiOtpEnabled: boolean;
  otpEmailCopy: EmailMode | null;
  onboardingSkipNoHpOtp: boolean | null;
}
interface Gateway {
  settings: Settings;
  providers: {
    order: string;
    fonnte: { configured: boolean; enabled: boolean };
    starsender: { configured: boolean; enabled: boolean };
    resmi: { configured: boolean; enabled: boolean; template: string | null; lang: string };
  };
  effective: { order: string; otpEmailCopy: EmailMode; onboardingSkipNoHpOtp: boolean };
  env: { waProviderOrder: string | null; otpEmailCopy: string | null; onboardingSkipNoHpOtp: string | null };
}

const KEY = ['wa-config', 'gateway'];

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
  const textActive = [p.fonnte, p.starsender].filter((x) => x.configured && x.enabled).length;
  const otpChain = [
    p.resmi.configured && p.resmi.enabled ? 'Resmi.ID' : null,
    ...d.effective.order
      .split(',')
      .map((k) => (k === 'fonnte' ? (p.fonnte.configured && p.fonnte.enabled ? 'Fonnte' : null) : p.starsender.configured && p.starsender.enabled ? 'StarSender' : null)),
  ].filter(Boolean) as string[];

  const providerRow = (
    key: 'fonnte' | 'starsender' | 'resmi',
    title: string,
    sub: string,
    st: { configured: boolean; enabled: boolean },
    field: 'waFonnteEnabled' | 'waStarsenderEnabled' | 'waResmiOtpEnabled',
    envHint: string,
  ) => (
    <div key={key} className="flex items-start gap-3 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-neutral-900">{title}</span>
          <Badge ok={st.configured} okText="Kredensial ada" noText="Belum diisi di .env" />
          {st.configured && !st.enabled ? <Badge ok={false} okText="" noText="Dimatikan" /> : null}
        </div>
        <p className="text-xs text-neutral-500 mt-0.5">{sub}</p>
        {!st.configured ? <p className="text-[11px] text-amber-700 mt-1">Isi {envHint} di .env VPS untuk memakai provider ini.</p> : null}
      </div>
      <Toggle on={st.enabled} disabled={busy || !st.configured} onChange={(v) => save.mutate({ [field]: v } as Partial<Settings>)} />
    </div>
  );

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
          {textActive ? otpChain.filter((x) => x !== 'Resmi.ID').join(' → ') : <span className="text-red-600 font-semibold">tidak ada provider aktif — notifikasi WA tidak terkirim</span>}
        </div>
      </div>

      <div className="px-5 divide-y divide-neutral-100">
        {providerRow('fonnte', 'Fonnte', 'Non-official — OTP & semua notifikasi.', p.fonnte, 'waFonnteEnabled', 'FONNTE_TOKEN')}
        {providerRow('starsender', 'StarSender', 'Non-official — cadangan OTP & notifikasi.', p.starsender, 'waStarsenderEnabled', 'STARSENDER_DEVICE_KEY')}
        {providerRow(
          'resmi',
          'Resmi.ID (WABA resmi)',
          `Khusus OTP, dicoba paling awal.${p.resmi.template ? ` Template: ${p.resmi.template} (${p.resmi.lang}).` : ''} Template harus sudah disetujui Meta.`,
          p.resmi,
          'waResmiOtpEnabled',
          'RESMI_API_KEY, RESMI_PHONE_ID, RESMI_OTP_TEMPLATE',
        )}

        {/* Urutan */}
        <div className="flex flex-wrap items-center gap-3 py-3">
          <ArrowDownUp className="w-4 h-4 text-neutral-500" />
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold text-neutral-900">Urutan Fonnte / StarSender</div>
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
