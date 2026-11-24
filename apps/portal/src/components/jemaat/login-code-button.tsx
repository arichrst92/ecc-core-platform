'use client';

/**
 * "Kode masuk sementara" — jalan terakhir saat WhatsApp & email gangguan.
 * Admin membuat kode 6 digit (berlaku 10 menit, sekali pakai) lalu
 * memberikannya langsung ke jemaat (tatap muka / telepon) setelah mengenalinya.
 * API: POST /admin/jemaat/:id/login-code (tercatat di audit log).
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Copy, KeyRound, Loader2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface LoginCode {
  kode: string;
  expiresAt: string;
  expiresInMinutes: number;
  namaLengkap: string;
  loginWith: { channel: 'whatsapp' | 'email'; label: string };
  alsoEmail: string | null;
}

export function LoginCodeButton({ jemaatId, nama, disabled }: { jemaatId: string; nama: string; disabled?: boolean }) {
  const [confirm, setConfirm] = useState(false);
  const [code, setCode] = useState<LoginCode | null>(null);
  const make = useMutation({
    mutationFn: async () => (await apiClient.post<{ data: LoginCode }>(`/admin/jemaat/${jemaatId}/login-code`)).data.data,
    onSuccess: (d) => {
      setConfirm(false);
      setCode(d);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal membuat kode'),
  });

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirm(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 rounded-lg border border-amber-200 disabled:opacity-40"
        title="Untuk jemaat yang tidak bisa menerima OTP WhatsApp / email"
      >
        <KeyRound className="w-4 h-4" />
        Kode masuk sementara
      </button>

      {confirm || code ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !make.isPending && (setConfirm(false), setCode(null))}>
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 sm:px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-neutral-900 flex-1">Kode masuk sementara</h3>
              <button onClick={() => (setConfirm(false), setCode(null))} className="p-1 rounded hover:bg-neutral-100" aria-label="Tutup">
                <X className="w-4 h-4" />
              </button>
            </div>
            {!code ? (
              <div className="px-3 sm:px-5 py-4 space-y-3 text-sm text-neutral-700">
                <p>
                  Buat kode untuk <b>{nama}</b>? Pakai hanya bila jemaat tidak bisa menerima OTP WhatsApp / email, dan Anda sudah
                  memastikan orangnya (tatap muka atau telepon ke nomor yang Anda kenal).
                </p>
                <ul className="text-xs text-neutral-500 list-disc pl-4 space-y-0.5">
                  <li>Berlaku 10 menit, sekali pakai. Kode sebelumnya dibatalkan.</li>
                  <li>Tercatat di audit log atas nama Anda.</li>
                  <li>Jangan kirim kode lewat chat grup atau pesan yang bisa dibaca orang lain.</li>
                </ul>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setConfirm(false)} className="px-3 py-2 rounded-lg border border-neutral-300 text-sm">
                    Batal
                  </button>
                  <button
                    onClick={() => make.mutate()}
                    disabled={make.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
                  >
                    {make.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    Buat kode
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-3 sm:px-5 py-4 space-y-3 text-sm text-neutral-700">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-3 sm:px-5 py-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50">
                    <span className="text-3xl font-extrabold tracking-[0.3em] text-amber-800 font-mono">{code.kode}</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(code.kode).then(() => toast.success('Kode disalin'))}
                      className="p-1 rounded hover:bg-amber-100 text-amber-700"
                      aria-label="Salin kode"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1.5">
                    Berlaku sampai {new Date(code.expiresAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} ({code.expiresInMinutes} menit)
                  </p>
                </div>
                <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-3 text-xs space-y-1">
                  <p className="font-semibold text-neutral-800">Cara masuk untuk {code.namaLengkap}:</p>
                  {code.loginWith.channel === 'whatsapp' ? (
                    <p>
                      Buka Els App → <b>Masuk dengan OTP</b> → isi nomor <b>{code.loginWith.label}</b> → Kirim OTP → masukkan kode di atas.
                    </p>
                  ) : (
                    <p>
                      Buka Els App (versi terbaru) → <b>Masuk dengan Email</b> → isi email <b>{code.loginWith.label}</b> → tekan Kirim → ketuk{' '}
                      <i>Sudah diberi kode masuk oleh admin cabang?</i> → masukkan kode di atas.
                    </p>
                  )}
                  {code.alsoEmail ? <p className="text-neutral-500">Bisa juga lewat email {code.alsoEmail} (app versi terbaru).</p> : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
