import type { Metadata } from 'next';
import Image from 'next/image';
import { Mail, Instagram, Sparkles, Heart } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Segera Hadir — ECC',
  description:
    'Elshaddai Creative Community — komunitas yang bertumbuh dalam kasih Kristus. Website resmi kami akan hadir sebentar lagi.',
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#FFF7ED] via-[#FFEEDD] to-[#FED7AA]">
      {/* Decorative orbs */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full bg-orange-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 w-[480px] h-[480px] rounded-full bg-amber-200/50 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 right-1/4 w-64 h-64 rounded-full bg-orange-100/50 blur-2xl" />

      {/* Grid pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, #EA580C 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative min-h-screen flex items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full">
          {/* Card */}
          <div className="bg-white/70 backdrop-blur-xl border border-white/60 rounded-3xl shadow-2xl shadow-orange-200/40 overflow-hidden">
            {/* Top gradient bar */}
            <div className="h-2 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-600" />

            <div className="px-8 md:px-12 pt-10 pb-10">
              {/* Logo + brand */}
              <div className="flex flex-col items-center mb-8">
                <div className="relative mb-4">
                  <div className="absolute inset-0 bg-orange-400 rounded-3xl blur-2xl opacity-40 animate-pulse" />
                  <div className="relative bg-white rounded-3xl p-3 shadow-lg">
                    <Image
                      src="/logo-ecc.webp"
                      alt="ECC"
                      width={80}
                      height={80}
                      priority
                    />
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  Segera Hadir
                </span>
              </div>

              {/* Headline */}
              <div className="text-center mb-8">
                <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 leading-tight mb-3">
                  Sesuatu yang <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-amber-500">indah</span> sedang kami siapkan
                </h1>
                <p className="text-base md:text-lg text-neutral-600 leading-relaxed">
                  Website Elshaddai Creative Community akan segera hadir dengan
                  pengalaman baru untuk mengenal komunitas, ibadah, dan pelayanan kami
                  lebih dekat.
                </p>
              </div>

              {/* CTA */}
              <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl p-6 text-white text-center mb-6">
                <Heart className="w-6 h-6 mx-auto mb-2" fill="white" />
                <p className="text-sm md:text-base leading-relaxed mb-4">
                  Ingin terhubung lebih dulu dengan komunitas kami?
                  Hubungi tim kami — pintu kami selalu terbuka untuk Anda.
                </p>
                <a
                  href="mailto:info@eccchurch.global"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-orange-600 font-semibold rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-transform text-sm"
                >
                  <Mail className="w-4 h-4" />
                  info@eccchurch.global
                </a>
              </div>

              {/* Social */}
              <div className="flex items-center justify-center gap-3">
                <a
                  href="https://instagram.com/eccchurch"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram ECC"
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-neutral-200 text-neutral-600 hover:text-orange-600 hover:border-orange-300 transition"
                >
                  <Instagram className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Footer strip */}
            <div className="bg-neutral-50/70 px-8 py-4 border-t border-neutral-100 text-center">
              <p className="text-[11px] text-neutral-500 tracking-wide">
                &copy; {new Date().getFullYear()} Elshaddai Creative Community
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
