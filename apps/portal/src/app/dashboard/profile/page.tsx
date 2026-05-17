'use client';

import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ScanFace,
  Trash2,
  ShieldCheck,
  Upload,
  User as UserIcon,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { FaceCapture } from '@/components/face/face-capture';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

export default function ProfilePage() {
  const { user, setAuth, refreshToken, accessToken } = useAuthStore();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const enrollMut = useMutation({
    mutationFn: async (descriptor: number[]) => {
      const res = await apiClient.post('/auth/face/enroll', { descriptor });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Wajah berhasil terdaftar');
      if (user) setAuth({ accessToken: accessToken!, refreshToken: refreshToken!, user: { ...user, hasFaceEnrolled: true } });
      setEnrollOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal enroll'),
  });

  const resetMut = useMutation({
    mutationFn: async () => apiClient.post('/auth/face/reset'),
    onSuccess: () => {
      toast.success('Wajah dihapus');
      if (user) setAuth({ accessToken: accessToken!, refreshToken: refreshToken!, user: { ...user, hasFaceEnrolled: false } });
      setResetConfirm(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal reset'),
  });

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
      if (user) setAuth({ accessToken: accessToken!, refreshToken: refreshToken!, user: { ...user, fotoUrl: data.fotoUrl } });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal upload'),
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
      <p className="text-neutral-500 mt-1">Kelola avatar dan metode login Anda.</p>

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
          </div>
        </div>
      </section>

      {/* ===== Face Recognition ===== */}
      <section className="mt-6 bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <ScanFace className="w-4 h-4" />
              Face Recognition
            </h2>
            <p className="text-sm text-neutral-500 mt-1">
              Shortcut login pakai wajah — tanpa OTP. Aman karena disimpan sebagai vektor matematis (bukan foto).
            </p>
          </div>
          {user.hasFaceEnrolled ? (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 text-xs font-medium rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Terdaftar
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-600 text-xs font-medium rounded-full">
              Belum
            </span>
          )}
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2 text-xs text-blue-800">
          <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Liveness check aktif: sebelum wajah Anda direkam/diverifikasi, Anda diminta mengedipkan mata atau
            menengok kepala. Ini mencegah serangan replay foto statis.
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setEnrollOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
          >
            <ScanFace className="w-4 h-4" />
            {user.hasFaceEnrolled ? 'Enroll Ulang' : 'Enroll Wajah'}
          </button>
          {user.hasFaceEnrolled && (
            <button
              onClick={() => setResetConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
              Hapus
            </button>
          )}
        </div>
      </section>

      {/* ===== Sesi Aktif (placeholder) ===== */}
      <section className="mt-6 bg-white border border-neutral-200 rounded-xl p-6">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          Sesi Aktif
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Setiap login dari device baru tercatat. Anda bisa keluar dari semua sesi sekaligus.
        </p>
        <button
          onClick={async () => {
            const { logout } = await import('@/lib/api-client');
            await logout(true);
          }}
          className="mt-4 px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium rounded-lg"
        >
          Logout dari Semua Sesi
        </button>
      </section>

      {/* ===== Enroll modal ===== */}
      {enrollOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setEnrollOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
                <h2 className="font-semibold">Enroll Wajah</h2>
                <button onClick={() => setEnrollOpen(false)} className="p-1.5 hover:bg-neutral-100 rounded-lg">
                  ✕
                </button>
              </div>
              <div className="p-6">
                <FaceCapture
                  onCapture={(d) => enrollMut.mutateAsync(d)}
                  submitting={enrollMut.isPending}
                  submitLabel="Daftarkan Wajah"
                />
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmDelete
        open={resetConfirm}
        onClose={() => setResetConfirm(false)}
        loading={resetMut.isPending}
        title="Hapus enrollment wajah?"
        itemName="data wajah Anda"
        onConfirm={() => resetMut.mutate()}
      />
    </div>
  );
}
