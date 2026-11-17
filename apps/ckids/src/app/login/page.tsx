'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import Image from 'next/image';
import { AlertTriangle, KeyRound, Loader2, Mail, MessageCircle, Phone } from 'lucide-react';
import toast from 'react-hot-toast';
import { normalizePhoneNumber } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { canUseCkids } from '@/lib/access';

/**
 * Login CKids — kode 6 digit lewat WhatsApp atau email (endpoint sama dengan
 * Portal & Els App). WhatsApp gangguan → server mengirim kode ke email jemaat
 * (bila ada) dan halaman memberi keterangan; bila tidak terkirim sama sekali →
 * saran "Masuk dengan email". Kode masuk dari admin cabang juga diterima.
 */
type Method = 'whatsapp' | 'email';
type Delivery = 'whatsapp' | 'email' | 'whatsapp+email' | 'admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SEC = 60;
const errMsg = (e: any, fb: string) => e?.response?.data?.error?.message ?? fb;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [method, setMethod] = useState<Method>('whatsapp');
  const [step, setStep] = useState<'input' | 'otp'>('input');
  const [noHp, setNoHp] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [delivery, setDelivery] = useState<Delivery>('whatsapp');
  const [waDown, setWaDown] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [checkingSession, setCheckingSession] = useState(true);

  // Sudah login (token tersimpan) → langsung ke Gift Stall.
  useEffect(() => {
    const { accessToken, refreshToken, user } = useAuthStore.getState();
    if ((accessToken || refreshToken) && user) {
      router.replace('/');
      return;
    }
    setCheckingSession(false);
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchMethod = (m: Method) => {
    setMethod(m);
    setStep('input');
    setOtp('');
    setWaDown(null);
  };

  const requestMut = useMutation({
    mutationFn: async (): Promise<{ target: string; ch: Delivery }> => {
      if (method === 'whatsapp') {
        // Semua negara; nomor lokal (08…) dianggap Indonesia.
        const normalized = normalizePhoneNumber(noHp) ?? noHp.trim();
        const res = await apiClient.post('/auth/otp/request', { noHp: normalized, purpose: 'LOGIN' });
        return { target: normalized, ch: (res.data?.data?.channel as Delivery | undefined) ?? 'whatsapp' };
      }
      const em = email.trim().toLowerCase();
      if (!EMAIL_RE.test(em)) throw new Error('Format email tidak valid');
      const res = await apiClient.post('/auth/email-otp/request', { email: em, purpose: 'LOGIN_EMAIL' });
      return { target: em, ch: res.data?.data?.channel === 'admin' ? 'admin' : 'email' };
    },
    onMutate: () => setWaDown(null),
    onSuccess: ({ target, ch }) => {
      if (method === 'whatsapp') setNoHp(target);
      else setEmail(target);
      setDelivery(ch);
      setStep('otp');
      setOtp('');
      setCooldown(ch === 'admin' ? 0 : RESEND_SEC);
      toast.success(
        ch === 'admin'
          ? 'Masukkan kode masuk dari admin cabang'
          : ch === 'email'
            ? method === 'email'
              ? 'Kode dikirim ke email (bila terdaftar)'
              : 'WhatsApp terganggu — kode dikirim ke email Anda'
            : ch === 'whatsapp+email'
              ? 'Kode dikirim via WhatsApp dan email'
              : 'Kode dikirim via WhatsApp',
      );
    },
    onError: (e: any) => {
      if (e?.response?.data?.error?.code === 'WHATSAPP_UNAVAILABLE') setWaDown(errMsg(e, 'WhatsApp sedang gangguan.'));
      else toast.error(e?.response ? errMsg(e, 'Gagal mengirim kode') : e?.message ?? 'Gagal mengirim kode');
    },
  });

  const verifyMut = useMutation({
    mutationFn: async () => {
      const res =
        method === 'whatsapp'
          ? await apiClient.post('/auth/otp/verify', { noHp, kode: otp.trim(), purpose: 'LOGIN' })
          : await apiClient.post('/auth/email-otp/verify', { email, kode: otp.trim(), purpose: 'LOGIN_EMAIL' });
      return res.data.data;
    },
    onSuccess: (data) => {
      if (!canUseCkids(data.user)) {
        toast.error('Akun Anda belum punya akses CKids. Minta admin memberi akses menu "Gift Stall (CKids)" di Role Access.');
        return;
      }
      setAuth({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
      toast.success(`Selamat datang, ${data.user.namaLengkap}`);
      router.push('/');
    },
    onError: (e: any) => {
      setOtp('');
      toast.error(errMsg(e, 'Kode salah atau kedaluwarsa'));
    },
  });

  if (checkingSession) {
    return <div className="min-h-screen bg-gradient-to-br from-brand-50 via-kids-50 to-white" />;
  }

  const target = method === 'whatsapp' ? noHp : email;
  const canSend = method === 'whatsapp' ? !!noHp.trim() : email.trim().length > 5;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-brand-50 via-kids-50 to-white p-4">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-6 sm:p-8 space-y-6">
        <div className="text-center">
          <Image src="/logo-ckids.webp" alt="CKids — Creative Kids" width={150} height={150} className="mx-auto" priority />
          <h1 className="sr-only">CKids</h1>
          <p className="text-xs text-neutral-500 mt-1">Portal untuk kakak CKids</p>
        </div>

        {step === 'input' ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSend) requestMut.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-100 rounded-lg" role="tablist">
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

            <label className="block text-sm font-medium text-neutral-700">{method === 'whatsapp' ? 'Nomor WhatsApp' : 'Email'}</label>
            <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3">
              {method === 'whatsapp' ? <Phone className="w-4 h-4 text-neutral-400" /> : <Mail className="w-4 h-4 text-neutral-400" />}
              {method === 'whatsapp' ? (
                <input
                  type="tel"
                  value={noHp}
                  onChange={(e) => {
                    setNoHp(e.target.value);
                    setWaDown(null);
                  }}
                  placeholder="08123… atau +65 9123…"
                  autoFocus
                  autoComplete="tel"
                  className="flex-1 py-2.5 outline-none text-sm"
                />
              ) : (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@email.com"
                  autoFocus
                  autoComplete="email"
                  className="flex-1 py-2.5 outline-none text-sm"
                />
              )}
            </div>
            {method === 'email' ? <p className="text-xs text-neutral-500">Gunakan email yang tercatat di profil jemaat Anda.</p> : null}

            {waDown ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="font-semibold text-sm">WhatsApp sedang gangguan</div>
                    <div className="mt-0.5 leading-relaxed">{waDown}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => switchMethod('email')}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-1.5 font-semibold text-white"
                >
                  <Mail className="w-3.5 h-3.5" /> Masuk dengan email
                </button>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSend || requestMut.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-kids-500 text-white rounded-lg font-medium hover:bg-kids-600 disabled:opacity-50"
            >
              {requestMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Kirim kode
            </button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (otp.length === 6) verifyMut.mutate();
            }}
          >
            <div className="text-xs text-neutral-500 text-center leading-relaxed">
              {delivery === 'admin' ? (
                <>Masukkan kode masuk dari admin cabang untuk <strong>{target}</strong></>
              ) : method === 'email' ? (
                <>Bila <strong>{target}</strong> terdaftar, kode sudah dikirim ke email tersebut</>
              ) : delivery === 'email' ? (
                <>Kode dikirim ke <strong>email</strong> yang terdaftar untuk {target}</>
              ) : (
                <>Kode dikirim via WhatsApp ke <strong>{target}</strong></>
              )}
            </div>
            {delivery === 'email' || delivery === 'whatsapp+email' || method === 'email' ? (
              delivery !== 'admin' ? (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 leading-relaxed">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>
                    {method === 'whatsapp' ? 'WhatsApp sedang terganggu, jadi kode dikirim ke email Anda. ' : ''}
                    Bila tidak ada di Inbox, cek folder Spam / Promosi.
                  </span>
                </div>
              ) : null
            ) : null}
            <label className="block text-sm font-medium text-neutral-700">Kode (6 digit)</label>
            <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3">
              <KeyRound className="w-4 h-4 text-neutral-400" />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                autoFocus
                className="flex-1 py-2.5 outline-none text-sm font-mono tracking-widest text-center"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('input');
                  setOtp('');
                }}
                className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg text-sm hover:bg-neutral-50"
              >
                {method === 'whatsapp' ? 'Ganti nomor' : 'Ganti email'}
              </button>
              <button
                type="submit"
                disabled={otp.length !== 6 || verifyMut.isPending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-kids-500 text-white rounded-lg font-medium hover:bg-kids-600 disabled:opacity-50"
              >
                {verifyMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Masuk
              </button>
            </div>
            {cooldown > 0 ? (
              <div className="text-center text-xs text-neutral-400">Kirim ulang dalam {cooldown} dtk</div>
            ) : (
              <button
                type="button"
                onClick={() => requestMut.mutate()}
                disabled={requestMut.isPending}
                className="w-full text-xs text-kids-600 hover:underline"
              >
                {delivery === 'admin' ? 'Kirim kode biasa' : 'Kirim ulang kode'}
              </button>
            )}
            {method === 'whatsapp' && delivery !== 'admin' ? (
              <button type="button" onClick={() => switchMethod('email')} className="w-full text-xs text-neutral-500 underline">
                Tidak menerima kode? Masuk dengan email
              </button>
            ) : null}
          </form>
        )}
      </div>

      {/* Powered by IDEA — samain dengan portal.eccchurch.global */}
      <div className="mt-6 flex items-center justify-center gap-2 opacity-60">
        <span className="text-xs text-neutral-500">Powered by</span>
        <Image src="/logo-idea.webp" alt="IDEA" width={40} height={16} style={{ width: 'auto', height: '16px' }} />
      </div>
    </div>
  );
}
