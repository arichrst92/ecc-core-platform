import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Church, ChevronRight, Info } from 'lucide-react';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Persembahan — Pilih Cabang',
  description:
    'Pilih cabang gereja ECC Anda untuk melihat info rekening persembahan (perpuluhan, ucapan syukur, diakonia, dll).',
  robots: { index: true, follow: true },
};

interface Cabang {
  id: string;
  nama: string;
  kode: string;
  alamat: string | null;
  isActive: boolean;
}

export default async function PersembahanIndexPage() {
  const cabangList = (await apiGet<Cabang[]>('/auth/cabang?isActive=true')) ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <section className="border-b border-orange-100 bg-white/60 backdrop-blur">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 mb-2">
            <Image src="/logo-ecc.webp" alt="ECC" width={40} height={40} />
            <div>
              <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                Elshaddai Creative Community
              </p>
              <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">
                Persembahan / Giving
              </h1>
            </div>
          </div>
          <p className="text-sm text-neutral-600 mt-3 leading-relaxed">
            Pilih cabang Anda untuk melihat info rekening persembahan.
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-10">
        {cabangList.length === 0 ? (
          <div className="text-center py-16 bg-white border border-orange-100 rounded-2xl">
            <Info className="w-10 h-10 text-orange-400 mx-auto mb-3" />
            <p className="text-sm text-neutral-600">
              Data cabang sedang dalam pembaruan. Silakan hubungi tim ECC.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {cabangList.map((c) => (
              <Link
                key={c.id}
                href={`/persembahan/${encodeURIComponent(c.kode)}`}
                className="group flex items-center gap-4 bg-white border border-orange-100 hover:border-orange-300 hover:shadow-md rounded-2xl p-5 transition"
              >
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shrink-0">
                  <Church className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-neutral-900 truncate">{c.nama}</h3>
                  {c.alamat && (
                    <p className="text-xs text-neutral-500 truncate mt-0.5">{c.alamat}</p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-400 group-hover:text-orange-500 shrink-0" />
              </Link>
            ))}
          </div>
        )}

        <p className="text-xs text-neutral-500 mt-8 text-center">
          &copy; {new Date().getFullYear()} Elshaddai Creative Community
        </p>
      </section>
    </div>
  );
}
