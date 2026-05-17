'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, ShieldCheck, ScanFace, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { normalizePhoneInput } from '@/lib/phone';
import { FaceCapture } from '@/components/face/face-capture';

type Step = 'phone' | 'otp' | 'face-phone' | 'face-capture';

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

  async function handleFaceLogin(descriptor: number[]) {
    const normalized = normalizePhoneInput(noHp);
    if (!normalized) return toast.error('No HP tidak valid');
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/face/login', { noHp: normalized, descriptor });
      finalizeLogin(res.data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Login wajah gagal');
    } finally {
      setLoading(false);
    }
  }

  function finalizeLogin(auth: any) {
    if (!auth.user.isFulltimer) {
      toast.error('Hanya Fulltimer yang boleh akses portal ini');
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

              <Divider />

              <button
                onClick={() => setStep('face-phone')}
                className="w-full border border-neutral-300 hover:bg-neutral-50 font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2"
              >
                <ScanFace className="w-4 h-4" />
                Login dengan Wajah
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

          {step === 'face-phone' && (
            <>
              <h2 className="text-lg font-semibold mb-1">Login dengan Wajah</h2>
              <p className="text-sm text-neutral-500 mb-6">
                Masukkan no HP dulu (untuk identifikasi akun), lalu scan wajah Anda.
              </p>
              <PhoneInput value={noHp} onChange={setNoHp} />
              <button
                onClick={() => {
                  const n = normalizePhoneInput(noHp);
                  if (!n) return toast.error('Format no HP tidak valid');
                  setNoHp(n);
                  setStep('face-capture');
                }}
                className="mt-6 w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-lg"
              >
                Lanjut ke Scan Wajah
              </button>
              <button
                onClick={() => setStep('phone')}
                className="mt-3 w-full text-sm text-neutral-500 hover:text-neutral-700 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Kembali ke OTP
              </button>
            </>
          )}

          {step === 'face-capture' && (
            <>
              <h2 className="text-lg font-semibold mb-1">Scan Wajah</h2>
              <p className="text-sm text-neutral-500 mb-4">
                Login untuk <strong>{noHp}</strong>.
              </p>
              <FaceCapture onCapture={handleFaceLogin} submitting={loading} submitLabel="Masuk" />
              <button
                onClick={() => setStep('face-phone')}
                className="mt-4 w-full text-sm text-neutral-500 hover:text-neutral-700 flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" /> Kembali
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

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="flex-1 h-px bg-neutral-200" />
      <span className="text-xs text-neutral-400 uppercase">atau</span>
      <div className="flex-1 h-px bg-neutral-200" />
    </div>
  );
}

function PoweredByIdea() {
  return (
    <div className="mt-8 flex items-center justify-center gap-2 opacity-60">
      <span className="text-xs text-neutral-500">Powered by</span>
      <Image src="/logo-idea.webp" alt="IDEA" width={40} height={16} />
    </div>
  );
}
