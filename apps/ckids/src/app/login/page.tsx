'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Gift, Loader2, Phone, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Login OTP — reuse endpoint sama dengan portal + mobile.
 * 2-step: (1) request OTP → dapat kirim ke WA, (2) input OTP → issue JWT.
 */
export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [noHp, setNoHp] = useState('');
  const [otp, setOtp] = useState('');

  function normalizePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('62')) return '+' + digits;
    if (digits.startsWith('0')) return '+62' + digits.slice(1);
    return '+' + digits;
  }

  const requestMut = useMutation({
    mutationFn: async () => {
      const normalized = normalizePhone(noHp);
      await apiClient.post('/auth/otp/request', {
        noHp: normalized,
        purpose: 'LOGIN',
      });
      return normalized;
    },
    onSuccess: (normalized) => {
      setNoHp(normalized);
      setStep('otp');
      toast.success('OTP dikirim via WhatsApp');
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal request OTP'),
  });

  const verifyMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/auth/otp/verify', {
        noHp,
        kode: otp.trim(),
        purpose: 'LOGIN',
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      if (!data.user.isFulltimer) {
        toast.error('Akses CKids Gift Stall hanya untuk Fulltimer');
        return;
      }
      setAuth({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      toast.success(`Selamat datang, ${data.user.namaLengkap}`);
      router.push('/');
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'OTP salah'),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 via-kids-50 to-white p-4">
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-8 space-y-6">
        <div className="text-center">
          <Gift className="w-12 h-12 text-kids-500 mx-auto" />
          <h1 className="text-xl font-bold text-neutral-900 mt-2">CKids Gift Stall</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Login admin untuk redeem hadiah anak
          </p>
        </div>

        {step === 'phone' ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-neutral-700">
              Nomor WhatsApp
            </label>
            <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3">
              <Phone className="w-4 h-4 text-neutral-400" />
              <input
                type="tel"
                value={noHp}
                onChange={(e) => setNoHp(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && noHp && requestMut.mutate()}
                placeholder="+6281234567890 atau 08123..."
                autoFocus
                className="flex-1 py-2.5 outline-none text-sm"
              />
            </div>
            <button
              onClick={() => requestMut.mutate()}
              disabled={!noHp.trim() || requestMut.isPending}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-kids-500 text-white rounded-lg font-medium hover:bg-kids-600 disabled:opacity-50"
            >
              {requestMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Kirim OTP
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-neutral-500 text-center">
              OTP dikirim ke <strong>{noHp}</strong>
            </div>
            <label className="block text-sm font-medium text-neutral-700">
              Kode OTP (6 digit)
            </label>
            <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3">
              <KeyRound className="w-4 h-4 text-neutral-400" />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => e.key === 'Enter' && otp.length === 6 && verifyMut.mutate()}
                placeholder="123456"
                autoFocus
                className="flex-1 py-2.5 outline-none text-sm font-mono tracking-widest text-center"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                }}
                className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 rounded-lg text-sm hover:bg-neutral-50"
              >
                Ganti Nomor
              </button>
              <button
                onClick={() => verifyMut.mutate()}
                disabled={otp.length !== 6 || verifyMut.isPending}
                className="flex-2 flex-1 flex items-center justify-center gap-2 py-2.5 bg-kids-500 text-white rounded-lg font-medium hover:bg-kids-600 disabled:opacity-50"
              >
                {verifyMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Verify
              </button>
            </div>
            <button
              onClick={() => requestMut.mutate()}
              disabled={requestMut.isPending}
              className="w-full text-xs text-kids-600 hover:underline"
            >
              Kirim ulang OTP
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
