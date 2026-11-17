'use client';

/**
 * Kandidat akun ganda dari pendaftaran app: pendaftar baru yang mirip data
 * jemaat lama (nama mirip, tanggal lahir & cabang sama), atau nomor HP yang
 * ingin ditambahkan ternyata milik data tamu. Admin meninjau lalu menyatukan
 * data lewat halaman detail jemaat, kemudian menandai "Sudah digabung".
 * API: GET/PATCH /admin/jemaat-duplicate
 */
import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Check, ExternalLink, Loader2, UserPlus, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type Status = 'OPEN' | 'MERGED' | 'DISMISSED';
interface Person {
  id: string;
  namaLengkap: string;
  kode: string | null;
  noHp: string | null;
  email: string | null;
  tanggalLahir: string | null;
  isTamu: boolean;
  createdAt: string;
  cabang: { nama: string } | null;
  user: { lastLoginAt: string | null } | null;
}
interface Candidate {
  id: string;
  score: number;
  reason: string;
  status: Status;
  createdAt: string;
  baru: Person;
  lama: Person;
}

const tgl = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

function PersonCell({ p, label }: { p: Person; label: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
      <Link href={`/dashboard/jemaat/${p.id}`} target="_blank" className="font-semibold text-neutral-900 hover:text-brand-600 inline-flex items-center gap-1">
        {p.namaLengkap} <ExternalLink className="w-3 h-3" />
      </Link>
      <div className="text-xs text-neutral-500 space-y-0.5 mt-0.5">
        <div>
          {p.kode ?? '—'} · {p.cabang?.nama ?? '—'} · lahir {tgl(p.tanggalLahir)}
          {p.isTamu ? <span className="ml-1 text-amber-700 font-semibold">· Tamu</span> : null}
        </div>
        <div>{p.noHp ?? 'tanpa nomor'} · {p.email ?? 'tanpa email'}</div>
        <div>{p.user?.lastLoginAt ? `Login terakhir ${tgl(p.user.lastLoginAt)}` : 'Belum pernah login'}</div>
      </div>
    </div>
  );
}

export function RegistrationDuplicates() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>('OPEN');
  const q = useQuery({
    queryKey: ['jemaat-duplicate', status],
    queryFn: async () =>
      (await apiClient.get<{ data: Candidate[]; meta: { openCount: number } }>('/admin/jemaat-duplicate', { params: { status } })).data,
  });
  const act = useMutation({
    mutationFn: async ({ id, status: s }: { id: string; status: Status }) => apiClient.patch(`/admin/jemaat-duplicate/${id}`, { status: s }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['jemaat-duplicate'] });
      toast.success(v.status === 'MERGED' ? 'Ditandai sudah digabung' : v.status === 'DISMISSED' ? 'Diabaikan' : 'Dibuka lagi');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });
  const rows = q.data?.data ?? [];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl mb-6 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-100 flex flex-wrap items-center gap-3">
        <UserPlus className="w-5 h-5 text-brand-600" />
        <div className="flex-1 min-w-[220px]">
          <h2 className="font-semibold text-neutral-900">
            Dari pendaftaran app{q.data?.meta.openCount ? <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{q.data.meta.openCount} perlu ditinjau</span> : null}
          </h2>
          <p className="text-xs text-neutral-500">
            Pendaftar baru yang mirip data jemaat lama, atau nomor HP yang ternyata milik data tamu. Satukan datanya di halaman jemaat, lalu tandai di sini.
          </p>
        </div>
        <div className="flex gap-1">
          {(['OPEN', 'MERGED', 'DISMISSED'] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-semibold ${status === s ? 'bg-brand-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
            >
              {s === 'OPEN' ? 'Perlu ditinjau' : s === 'MERGED' ? 'Sudah digabung' : 'Diabaikan'}
            </button>
          ))}
        </div>
      </div>
      {q.isLoading ? (
        <div className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">Tidak ada kandidat.</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <div key={r.id} className="px-4 py-3 grid gap-3 md:grid-cols-[1fr_1fr_auto] items-start">
              <PersonCell p={r.baru} label={`Akun baru · ${tgl(r.createdAt)}`} />
              <PersonCell p={r.lama} label={r.lama.isTamu ? 'Data tamu' : 'Data lama'} />
              <div className="flex md:flex-col gap-2 md:items-end">
                <span className="text-[11px] text-neutral-500 md:text-right max-w-[220px]">{r.reason}</span>
                {r.status === 'OPEN' ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => act.mutate({ id: r.id, status: 'MERGED' })}
                      disabled={act.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                    >
                      <Check className="w-3.5 h-3.5" /> Sudah digabung
                    </button>
                    <button
                      onClick={() => act.mutate({ id: r.id, status: 'DISMISSED' })}
                      disabled={act.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 text-xs font-medium hover:bg-neutral-50"
                    >
                      <X className="w-3.5 h-3.5" /> Bukan orang yang sama
                    </button>
                  </div>
                ) : (
                  <button onClick={() => act.mutate({ id: r.id, status: 'OPEN' })} className="text-xs text-brand-700 hover:underline">
                    Buka lagi
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
