'use client';

import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ShieldCheck,
  Upload,
  User as UserIcon,
  Smartphone,
  LogOut,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { UploadHint } from '@/components/upload/upload-hint';

// Profile portal: kelola avatar + sesi aktif. Login wajah hanya tersedia
// di aplikasi mobile (per request 2026-05-26 — portal admin pakai OTP
// WhatsApp saja). Section enroll/reset wajah sudah dihapus dari sini.
export default function ProfilePage() {
  const { user, setAuth, refreshToken, accessToken } = useAuthStore();
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadAvatarMut = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('foto', file);
      const res = await apiClient.post('/upload/user/me/foto', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      toast.success('Avatar diperbarui');
      if (user)
        setAuth({
          accessToken: accessToken!,
          refreshToken: refreshToken!,
          user: { ...user, fotoUrl: data.fotoUrl },
        });
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal upload'),
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadAvatarMut.mutate(file);
    e.target.value = '';
  }

  if (!user) return null;
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-neutral-900">Profil & Keamanan</h1>
      <p className="text-neutral-500 mt-1">Kelola avatar dan sesi login Anda.</p>

      {/* ===== Avatar ===== */}
      <section className="mt-8 bg-white border border-neutral-200 rounded-xl p-6">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <UserIcon className="w-4 h-4" />
          Avatar Login
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Foto yang tampil di sidebar dan dropdown profil. Bisa berbeda dengan foto resmi jemaat.
        </p>

        <div className="mt-5 flex items-center gap-5">
          {user.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${apiBase}${user.fotoUrl}`}
              alt={user.namaLengkap}
              className="w-20 h-20 rounded-full object-cover border-2 border-neutral-200"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
              <UserIcon className="w-8 h-8" />
            </div>
          )}
          <div className="flex-1">
            <div className="font-medium text-neutral-900">{user.namaLengkap}</div>
            <div className="text-xs text-neutral-500">{user.noHp}</div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadAvatarMut.isPending}
              className="mt-2 flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Upload className="w-4 h-4" />
              {uploadAvatarMut.isPending ? 'Mengunggah...' : 'Ganti avatar'}
            </button>
            <UploadHint kind="profile" />
          </div>
        </div>
      </section>

      {/* ===== Info: face login pindah ke mobile ===== */}
      <section className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5 flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-blue-900 text-sm">
            Login wajah tersedia di aplikasi mobile
          </h3>
          <p className="text-sm text-blue-800 mt-1">
            Untuk akses cepat tanpa OTP, install aplikasi ECC di HP Anda dan
            daftarkan wajah dari sana. Portal admin web hanya pakai OTP
            WhatsApp sebagai metode masuk.
          </p>
        </div>
      </section>

      {/* ===== Sesi & Sign Out ===== */}
      <section className="mt-6 bg-white border border-neutral-200 rounded-xl p-6">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Sesi & Sign Out
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Keluar dari akun (session ini) atau logout dari semua device yang pernah login.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={async () => {
              const { logout } = await import('@/lib/api-client');
              await logout(false);
            }}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Yakin logout dari SEMUA device? Anda perlu OTP login ulang di setiap device.')) return;
              const { logout } = await import('@/lib/api-client');
              await logout(true);
            }}
            className="px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium rounded-lg flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Logout dari Semua Sesi
          </button>
        </div>
      </section>
    </div>
  );
}
