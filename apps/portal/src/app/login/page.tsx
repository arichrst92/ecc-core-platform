'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, ShieldCheck, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { normalizePhoneInput } from '@/lib/phone';

// Portal login: OTP-only (WhatsApp). Face login sengaja hanya tersedia di
// mobile app — di portal admin, kombinasi browser face-api + manajemen
// liveness lebih reliable dijalankan native di mobile. Per request 2026-05-26.
type Step = 'phone' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [step, setStep] = useState<Step>('phone');
  const [noHp, setNoHp] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRequestOtp() {
    const normalized = normalizePhoneInput(noHp);
    if (!normalized) return toast.error('Format no HP tidak valid');
    setLoading(true);
    try {
      await apiClient.post('/auth/otp/request', { noHp: normalized, purpose: 'LOGIN' });
      toast.success('OTP terkirim via WhatsApp');
      setNoHp(normalized);
      setStep('otp');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Gagal kirim OTP');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) return toast.error('OTP harus 6 digit');
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/otp/verify', { noHp, kode: otp, purpose: 'LOGIN' });
      finalizeLogin(res.data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'OTP salah');
    } finally {
      setLoading(false);
    }
  }

  function finalizeLogin(auth: any) {
    // Gate baru: canAccessPortal (RBAC). User butuh minimal satu role/sub
    // dengan canAccessPortal=true. Toggle di /dashboard/role-access.
    if (auth.user && auth.user.canAccessPortal === false) {
      toast.error(
        'Akun Anda tidak memiliki akses ke portal. Hubungi admin untuk minta wewenang.',
      );
      return;
    }
    setAuth(auth);
    toast.success(`Selamat datang, ${auth.user.namaLengkap}`);
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-ecc.webp" alt="ECC Logo" width={120} height={120} className="mx-auto" priority />
          <h1 className="text-2xl font-bold mt-4 text-neutral-900">ECC Portal</h1>
          <p className="text-neutral-500 text-sm mt-1">Master Data Management</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-8">
          {step === 'phone' && (
            <>
              <h2 className="text-lg font-semibold mb-1">Masuk ke Portal</h2>
              <p className="text-sm text-neutral-500 mb-6">
                Kami akan kirim kode OTP via WhatsApp ke nomor Anda.
              </p>
              <PhoneInput value={noHp} onChange={setNoHp} />
              <button
                onClick={handleRequestOtp}
                disabled={loading}
                className="mt-6 w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
              >
                {loading ? 'Mengirim...' : 'Kirim OTP'}
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <h2 className="text-lg font-semibold mb-1">Masukkan Kode OTP</h2>
              <p className="text-sm text-neutral-500 mb-6">
                Kode 6 digit telah dikirim ke <strong>{noHp}</strong>.
              </p>
              <label className="block">
                <span className="text-sm font-medium text-neutral-700">Kode OTP</span>
                <div className="mt-1 flex items-center gap-2 border rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500">
                  <ShieldCheck className="w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 py-2 outline-none tracking-widest text-center font-mono text-lg"
                    autoFocus
                  />
                </div>
              </label>
              <button
                onClick={handleVerifyOtp}
                disabled={loading}
                className="mt-6 w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg"
              >
                {loading ? 'Memverifikasi...' : 'Masuk'}
              </button>
              <button
                onClick={() => setStep('phone')}
                className="mt-3 w-full text-sm text-neutral-500 hover:text-neutral-700 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Ganti nomor
              </button>
            </>
          )}
        </div>

        <PoweredByIdea />
      </div>
    </div>
  );
}

function PhoneInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-neutral-700">No HP (WhatsApp)</span>
      <div className="mt-1 flex items-center gap-2 border rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500">
        <Phone className="w-4 h-4 text-neutral-400" />
        <input
          type="tel"
          placeholder="+62812..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 py-2 outline-none"
          autoFocus
        />
      </div>
    </label>
  );
}

function PoweredByIdea() {
  return (
    <div className="mt-8 flex items-center justify-center gap-2 opacity-60">
      <span className="text-xs text-neutral-500">Powered by</span>
      <Image
        src="/logo-idea.webp"
        alt="IDEA"
        width={40}
        height={16}
        style={{ width: 'auto', height: '16px' }}
      />
    </div>
  );
}
