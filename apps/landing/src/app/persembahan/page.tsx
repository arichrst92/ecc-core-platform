import type { Metadata } from 'next';
import Link from 'next/link';
import { AppReturnBar, AppReturnFooter } from '@/components/app-return-bar';
import { Church, ChevronRight, Info } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { getL } from '@/lib/i18n-server';
import { EccLogo } from '@/components/ecc-logo';

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
    <div className="min-h-screen overflow-x-hidden page-fabric">
      <AppReturnBar />

      <section className="relative overflow-hidden hero-fabric band-shadow text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_320px_at_85%_0%,rgba(255,255,255,.22),transparent_60%),radial-gradient(500px_300px_at_0%_100%,rgba(124,45,18,.35),transparent_60%)]"
        />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-7 pb-16 sm:pt-9 sm:pb-20">
          <div className="flex items-center gap-4">
            <EccLogo height={60} className="text-white shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/80">
                El Shaddai Creative Community
              </p>
              <h1 className="mt-1 text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight">
                {L('Persembahan', 'Giving')}
              </h1>
            </div>
          </div>
          <p className="mt-5 text-sm sm:text-base text-white/90 leading-relaxed max-w-2xl">
            {L('Pilih cabang Anda untuk melihat info rekening persembahan.', 'Choose your branch to see the giving account info.')}
          </p>
        </div>
      </section>

      <section className="relative max-w-3xl mx-auto px-4 sm:px-6 -mt-10 sm:-mt-12 pb-8">
        {cabangList.length === 0 ? (
          <div className="text-center py-14 px-6 bg-white border border-orange-100 rounded-3xl shadow-[0_24px_48px_-32px_rgba(124,45,18,.55)]">
            <Info className="w-10 h-10 text-brand-400 mx-auto mb-3" />
            <p className="text-sm text-neutral-600">
              {L('Data cabang sedang dalam pembaruan. Silakan hubungi tim ECC.', 'Branch data is being updated. Please contact the ECC team.')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {cabangList.map((c) => (
              <Link
                key={c.id}
                href={`/persembahan/${encodeURIComponent(c.kode)}`}
                className="group min-w-0 flex items-center gap-3 sm:gap-4 bg-white rounded-3xl border border-orange-100 shadow-[0_20px_40px_-30px_rgba(124,45,18,.55)] hover:border-brand-300 p-4 sm:p-5 transition"
              >
                <span className="w-11 h-11 rounded-2xl bg-brand-grad text-white flex items-center justify-center shrink-0 shadow-[0_10px_20px_-10px_rgba(234,88,12,.8)]">
                  <Church className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-neutral-900 break-words">{c.nama}</h3>
                  {c.alamat && <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2 break-words">{c.alamat}</p>}
                </div>
                <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-brand-500 group-hover:translate-x-0.5 transition shrink-0" />
              </Link>
            ))}
          </div>
        )}

        <p className="text-xs text-neutral-500 mt-8 text-center">
          &copy; {new Date().getFullYear()} El Shaddai Creative Community
        </p>
      </section>
      <AppReturnFooter />
    </div>
  );
}
