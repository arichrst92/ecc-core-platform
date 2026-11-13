import type { Metadata } from 'next';
import Link from 'next/link';
import { AppReturnBar, AppReturnFooter } from '@/components/app-return-bar';
import Image from 'next/image';
import { Church, ChevronRight, Info } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { getL } from '@/lib/i18n-server';

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: L('Persembahan — Pilih Cabang', 'Giving — Choose a Branch'),
    description: L(
      'Pilih cabang gereja ECC Anda untuk melihat info rekening persembahan (perpuluhan, ucapan syukur, diakonia, dll).',
      'Choose your ECC church branch to see giving account info (tithes, thanksgiving, diakonia, etc.).',
    ),
    robots: { index: true, follow: true },
  };
}

interface Cabang {
  id: string;
  nama: string;
  kode: string;
  alamat: string | null;
  isActive: boolean;
}

export default async function PersembahanIndexPage() {
  const { L } = getL();
  const cabangList = (await apiGet<Cabang[]>('/auth/cabang?isActive=true')) ?? [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-orange-50 via-white to-amber-50">
      <AppReturnBar />
      <section className="border-b border-orange-100 bg-white/60 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-center gap-3 mb-2">
            <Image src="/logo-ecc.webp" alt="ECC" width={40} height={40} />
            <div>
              <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                Elshaddai Creative Community
              </p>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-neutral-900">
                {L('Persembahan', 'Giving')}
              </h1>
            </div>
          </div>
          <p className="text-sm text-neutral-600 mt-3 leading-relaxed">
            {L('Pilih cabang Anda untuk melihat info rekening persembahan.', 'Choose your branch to see the giving account info.')}
          </p>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {cabangList.length === 0 ? (
          <div className="text-center py-16 bg-white border border-orange-100 rounded-2xl">
            <Info className="w-10 h-10 text-orange-400 mx-auto mb-3" />
            <p className="text-sm text-neutral-600">
              {L('Data cabang sedang dalam pembaruan. Silakan hubungi tim ECC.', 'Branch data is being updated. Please contact the ECC team.')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {cabangList.map((c) => (
              <Link
                key={c.id}
                href={`/persembahan/${encodeURIComponent(c.kode)}`}
                className="group flex min-w-0 items-center gap-3 sm:gap-4 bg-white border border-orange-100 hover:border-orange-300 hover:shadow-md rounded-2xl p-4 sm:p-5 transition"
              >
                <div className="w-11 h-11 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
                  <Church className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-neutral-900 break-words">{c.nama}</h3>
                  {c.alamat && (
                    <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2 break-words">{c.alamat}</p>
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
      <AppReturnFooter />
    </div>
  );
}
