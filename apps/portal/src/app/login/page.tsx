'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, KeyRound, Mail, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { normalizePhoneInput } from '@/lib/phone';

/**
 * Login Portal — kode OTP 6 digit lewat WhatsApp atau email.
 *  - WhatsApp gangguan: server otomatis mengirim kode ke email jemaat (bila ada)
 *    → keterangan di layar kode; bila tidak bisa terkirim sama sekali → saran
 *    "Masuk dengan email".
 *  - Kode masuk sementara dari admin cabang diterima di kolom yang sama.
 * Face login sengaja hanya di app (per 2026-05-26).
 */
type Method = 'whatsapp' | 'email';
type Step = 'input' | 'otp';
/** Ke mana kode dikirim (dari jawaban server). */
type Delivery = 'whatsapp' | 'email' | 'whatsapp+email' | 'admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SEC = 60;
const errMsg = (e: any, fb: string) => e?.response?.data?.error?.message ?? fb;
const errCode = (e: any): string | undefined => e?.response?.data?.error?.code;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [method, setMethod] = useState<Method>('whatsapp');
  const [step, setStep] = useState<Step>('input');
  const [noHp, setNoHp] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [delivery, setDelivery] = useState<Delivery>('whatsapp');
  const [waDown, setWaDown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checkingSession, setCheckingSession] = useState(true);

  // Sudah login (token tersimpan) → langsung ke dashboard / ?next.
  useEffect(() => {
    const { accessToken, refreshToken, user } = useAuthStore.getState();
    if ((accessToken || refreshToken) && user && user.canAccessPortal !== false) {
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') ? next : '/dashboard');
      return;
    }
    setCheckingSession(false);
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function switchMethod(m: Method) {
    setMethod(m);
    setStep('input');
    setOtp('');
    setWaDown(null);
  }

  async function requestCode() {
    setWaDown(null);
    if (method === 'whatsapp') {
      const normalized = normalizePhoneInput(noHp);
      if (!normalized) return toast.error('Format nomor HP tidak valid');
      setLoading(true);
      try {
        const res = await apiClient.post('/auth/otp/request', { noHp: normalized, purpose: 'LOGIN' });
        const ch = (res.data?.data?.channel as Delivery | undefined) ?? 'whatsapp';
        setNoHp(normalized);
        setDelivery(ch);
        setStep('otp');
        setOtp('');
        setCooldown(ch === 'admin' ? 0 : RESEND_SEC);
        toast.success(
          ch === 'admin'
            ? 'Masukkan kode masuk dari admin cabang'
            : ch === 'email'
              ? 'WhatsApp terganggu — kode dikirim ke email Anda'
              : ch === 'whatsapp+email'
                ? 'Kode dikirim via WhatsApp dan email'
                : 'Kode dikirim via WhatsApp',
        );
      } catch (err: any) {
        if (errCode(err) === 'WHATSAPP_UNAVAILABLE') setWaDown(errMsg(err, 'WhatsApp sedang gangguan.'));
        else toast.error(errMsg(err, 'Gagal mengirim kode'));
      } finally {
        setLoading(false);
      }
      return;
    }
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) return toast.error('Format email tidak valid');
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/email-otp/request', { email: em, purpose: 'LOGIN_EMAIL' });
      const ch = res.data?.data?.channel === 'admin' ? 'admin' : 'email';
      setEmail(em);
      setDelivery(ch);
      setStep('otp');
      setOtp('');
      setCooldown(ch === 'admin' ? 0 : RESEND_SEC);
      toast.success(ch === 'admin' ? 'Masukkan kode masuk dari admin cabang' : 'Kode dikirim ke email (bila terdaftar)');
    } catch (err: any) {
      toast.error(errMsg(err, 'Gagal mengirim kode'));
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (otp.length !== 6) return toast.error('Kode harus 6 digit');
    setLoading(true);
    try {
      const res =
        method === 'whatsapp'
          ? await apiClient.post('/auth/otp/verify', { noHp, kode: otp, purpose: 'LOGIN' })
          : await apiClient.post('/auth/email-otp/verify', { email, kode: otp, purpose: 'LOGIN_EMAIL' });
      finalizeLogin(res.data.data);
    } catch (err: any) {
      toast.error(errMsg(err, 'Kode salah atau kedaluwarsa'));
      setOtp('');
    } finally {
      setLoading(false);
    }
  }

  function finalizeLogin(auth: any) {
    // Gate RBAC: minimal satu role/sub dengan canAccessPortal=true (Role Access).
    if (auth.user && auth.user.canAccessPortal === false) {
      toast.error('Akun Anda tidak memiliki akses ke portal. Hubungi admin untuk minta wewenang.');
      return;
    }
    setAuth(auth);
    toast.success(`Selamat datang, ${auth.user.namaLengkap}`);
    // ?next=/path — SSO handoff (planning / operations).
    const next = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('next') : null;
    router.push(next && next.startsWith('/') ? next : '/dashboard');
  }

  if (checkingSession) return <div className="min-h-screen fabric-login" />;

  const target = method === 'whatsapp' ? noHp : email;

  return (
    <div className="min-h-screen flex items-center justify-center fabric-login px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-ecc-church.webp" alt="ECC Church" width={89} height={120} className="mx-auto h-28 w-auto" priority />
          <h1 className="text-2xl font-bold mt-4 text-neutral-900">ECC Portal</h1>
          <p className="text-neutral-500 text-sm mt-1">Master Data Management</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 sm:p-8">
          {step === 'input' && (
            <>
              <h2 className="text-lg font-semibold mb-1">Masuk ke Portal</h2>
              <p className="text-sm text-neutral-500 mb-5">Pilih cara menerima kode masuk 6 digit.</p>

              <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-lg mb-5" role="tablist">
                {(['whatsapp', 'email'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={method === m}
                    onClick={() => switchMethod(m)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${
                      method === m ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    {m === 'whatsapp' ? <MessageCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                    {m === 'whatsapp' ? 'WhatsApp' : 'Email'}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void requestCode();
                }}
              >
                {method === 'whatsapp' ? (
                  <Field icon={<Phone className="w-4 h-4 text-neutral-400" />} label="Nomor HP (WhatsApp)">
                    <input
                      type="tel"
                      placeholder="0812… atau +65 9123…"
                      value={noHp}
                      onChange={(e) => {
                        setNoHp(e.target.value);
                        setWaDown(null);
                      }}
                      className="flex-1 py-2 outline-none bg-transparent"
                      autoFocus
                      autoComplete="tel"
                    />
                  </Field>
                ) : (
                  <>
                    <Field icon={<Mail className="w-4 h-4 text-neutral-400" />} label="Email">
                      <input
                        type="email"
                        placeholder="nama@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="flex-1 py-2 outline-none bg-transparent"
                        autoFocus
                        autoComplete="email"
                      />
                    </Field>
                    <p className="text-xs text-neutral-500 mt-2">Gunakan email yang tercatat di profil jemaat Anda.</p>
                  </>
                )}

                {waDown ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="flex gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">WhatsApp sedang gangguan</div>
                        <div className="mt-0.5 leading-relaxed">{waDown}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchMethod('email')}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <Mail className="w-3.5 h-3.5" /> Masuk dengan email
                    </button>
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
                >
                  {loading ? 'Mengirim…' : 'Kirim kode'}
                </button>
              </form>
            </>
          )}

          {step === 'otp' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
            >
              <h2 className="text-lg font-semibold mb-1">Masukkan kode</h2>
              <p className="text-sm text-neutral-500 mb-4">
                {delivery === 'admin' ? (
                  <>Masukkan kode masuk sementara yang diberikan admin cabang untuk <strong>{target}</strong>.</>
                ) : method === 'email' ? (
                  <>Bila <strong>{target}</strong> terdaftar, kode 6 digit sudah dikirim ke email tersebut.</>
                ) : delivery === 'email' ? (
                  <>Kode 6 digit dikirim ke <strong>email</strong> yang terdaftar untuk {target}.</>
                ) : (
                  <>Kode 6 digit dikirim via WhatsApp ke <strong>{target}</strong>.</>
                )}
              </p>

              {delivery === 'email' || delivery === 'whatsapp+email' ? (
                <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>
                    Pengiriman WhatsApp sedang terganggu, jadi kode {delivery === 'email' ? 'dikirim' : 'juga dikirim'} ke email Anda.
                    Bila tidak ada di Inbox, cek folder Spam / Promosi.
                  </span>
                </div>
              ) : method === 'email' && delivery !== 'admin' ? (
                <div className="mb-4 flex gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600 leading-relaxed">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>Bila tidak ada di Inbox, cek folder Spam / Promosi. Kode berlaku 10 menit.</span>
                </div>
              ) : null}

              <Field icon={delivery === 'admin' ? <KeyRound className="w-4 h-4 text-neutral-400" /> : <ShieldCheck className="w-4 h-4 text-neutral-400" />} label="Kode">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="flex-1 py-2 outline-none tracking-widest text-center font-mono text-lg bg-transparent"
                  autoFocus
                />
              </Field>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="mt-6 w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
              >
                {loading ? 'Memverifikasi…' : 'Masuk'}
              </button>

              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep('input');
                    setOtp('');
                  }}
                  className="text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" /> {method === 'whatsapp' ? 'Ganti nomor' : 'Ganti email'}
                </button>
                {cooldown > 0 ? (
                  <span className="text-neutral-400">Kirim ulang dalam {cooldown} dtk</span>
                ) : (
                  <button type="button" onClick={() => void requestCode()} disabled={loading} className="font-medium text-brand-600 hover:underline">
                    {delivery === 'admin' ? 'Kirim kode biasa' : 'Kirim ulang'}
                  </button>
                )}
              </div>
              {method === 'whatsapp' && delivery !== 'admin' ? (
                <button type="button" onClick={() => switchMethod('email')} className="mt-3 w-full text-xs text-neutral-500 hover:text-neutral-700 underline">
                  Tidak menerima kode? Masuk dengan email
                </button>
              ) : null}
            </form>
          )}
        </div>

        <PoweredByIdea />
      </div>
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <div className="mt-1 flex items-center gap-2 border rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500">
        {icon}
        {children}
      </div>
    </label>
  );
}

function PoweredByIdea() {
  return (
    <div className="mt-8 flex items-center justify-center gap-2 opacity-60">
      <span className="text-xs text-neutral-500">Powered by</span>
      <Image src="/logo-idea.webp" alt="IDEA" width={40} height={16} style={{ width: 'auto', height: '16px' }} />
    </div>
  );
}
