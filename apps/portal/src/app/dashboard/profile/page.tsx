'use client';

/**
 * Profile & Keamanan — styled seperti halaman detail jemaat (full width),
 * dgn sign out button di header + section keamanan sesi di bawah.
 *
 * Layout:
 *   - Profile header: foto besar + nama + role + info grid (noHp, email, dll)
 *     + Edit Avatar + Sign Out button
 *   - Info Login Card (WhatsApp OTP info)
 *   - Sesi Keamanan section: logout dari semua device
 */
import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ShieldCheck,
  Upload,
  User as UserIcon,
  Smartphone,
  LogOut,
  Phone,
  Mail,
  BadgeCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { UploadHint } from '@/components/upload/upload-hint';

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

  async function handleSignOut() {
    const { logout } = await import('@/lib/api-client');
    await logout(false);
  }

  async function handleLogoutAllSessions() {
    if (!window.confirm('Yakin logout dari SEMUA device? Anda perlu OTP login ulang di setiap device.')) return;
    const { logout } = await import('@/lib/api-client');
    await logout(true);
  }

  if (!user) return null;
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  return (
    <div className="w-full">
      {/* Profile header card — mirror jemaat detail pattern */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6 mb-6 flex items-start gap-5">
        {user.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${apiBase}${user.fotoUrl}`}
            alt={user.namaLengkap}
            className="w-24 h-24 rounded-full object-cover border-2 border-neutral-200 shrink-0"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <UserIcon className="w-10 h-10" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-neutral-900">{user.namaLengkap}</h1>
          <div className="text-sm text-neutral-500 mt-1 flex items-center gap-2 flex-wrap">
            {user.isFulltimer && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-brand-50 text-brand-700 font-medium">
                <BadgeCheck className="w-3 h-3" />
                Fulltimer
              </span>
            )}
            {user.canAccessPortal && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-50 text-emerald-700 font-medium">
                Portal Access
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {user.noHp && (
              <Info icon={Phone} label="No HP">
                {user.noHp}
              </Info>
            )}
            {user.email && (
              <Info icon={Mail} label="Email">
                {user.email}
              </Info>
            )}
          </div>
        </div>

        {/* Actions kanan header */}
        <div className="flex flex-col gap-2 shrink-0">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 hover:bg-neutral-50 rounded-lg text-sm"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploadAvatarMut.isPending ? 'Mengunggah...' : 'Ganti Avatar'}
          </button>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Upload hint */}
      <div className="mb-6">
        <UploadHint kind="profile" />
      </div>

      {/* Grid 2 columns: Login Info + Sesi Keamanan */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Login Info card */}
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-neutral-100">
            <Smartphone className="w-4 h-4 text-blue-600" />
            <h2 className="font-semibold text-neutral-900">Metode Login</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 text-green-700 flex items-center justify-center shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-neutral-900 text-sm">OTP WhatsApp (Primer)</div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Portal admin web pakai OTP WhatsApp sebagai metode login utama.
                  OTP di-kirim ke <strong>{user.noHp}</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-neutral-900 text-sm">Magic Link Email (Backup)</div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Kalau OTP WhatsApp tidak sampai, gunakan magic link via email
                  {user.email ? ` (${user.email})` : ''}. Link berlaku 15 menit.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                <UserIcon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium text-neutral-900 text-sm">Login Wajah (Mobile Only)</div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Untuk akses cepat tanpa OTP, install aplikasi ECC di HP dan daftarkan
                  wajah dari sana. Portal web tidak mendukung face login.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sesi Keamanan card */}
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-neutral-100">
            <ShieldCheck className="w-4 h-4 text-red-600" />
            <h2 className="font-semibold text-neutral-900">Sesi & Keamanan</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <div className="text-sm font-medium text-neutral-900">Sign Out (Session Ini)</div>
              <p className="text-xs text-neutral-500 mt-0.5 mb-3">
                Keluar dari akun di browser ini. Device lain yang pernah login tetap
                aktif — pakai "Logout Semua Sesi" untuk terminate semua.
              </p>
              <button
                onClick={handleSignOut}
                className="w-full sm:w-auto px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>

            <hr className="border-neutral-100" />

            <div>
              <div className="text-sm font-medium text-red-900">Logout dari Semua Sesi</div>
              <p className="text-xs text-neutral-500 mt-0.5 mb-3">
                Terminate semua refresh token di seluruh device (mobile, browser lain, dll).
                Setiap device perlu OTP login ulang setelah ini.
              </p>
              <button
                onClick={handleLogoutAllSessions}
                className="w-full sm:w-auto px-4 py-2 border border-red-200 text-red-700 hover:bg-red-50 text-sm font-medium rounded-lg inline-flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Logout dari Semua Sesi
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ============================================================
// Info — helper display key-value with icon (mirror jemaat detail)
// ============================================================
function Info({
  icon: Icon,
  label,
  children,
  full,
}: {
  icon: typeof Phone;
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex items-start gap-2 ${full ? 'md:col-span-2' : ''}`}>
      <Icon className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-neutral-500">{label}</div>
        <div className="text-neutral-900 truncate">{children}</div>
      </div>
    </div>
  );
}
