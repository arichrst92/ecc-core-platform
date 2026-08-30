import type { Metadata } from 'next';
import Image from 'next/image';

export const metadata: Metadata = {
  title: 'Coming Soon — ECC',
  description:
    'Website Elshaddai Creative Community sedang dalam persiapan. Terima kasih atas kesabaran Anda.',
  robots: { index: false, follow: false },
};

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-orange-100 px-6">
      <div className="max-w-lg w-full text-center">
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo-ecc.webp"
            alt="ECC"
            width={96}
            height={96}
            priority
            className="drop-shadow-md"
          />
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-3">
          Coming Soon
        </h1>
        <p className="text-lg font-medium text-orange-600 mb-6">
          Elshaddai Creative Community
        </p>

        <p className="text-neutral-600 text-base leading-relaxed mb-8">
          Website resmi kami sedang dalam tahap persiapan akhir. Sementara ini,
          konten yang ditampilkan masih data contoh.
          Terima kasih atas kesabaran Anda — nantikan peluncurannya segera.
        </p>

        <div className="bg-white/70 backdrop-blur border border-orange-200 rounded-2xl p-6 mb-6">
          <p className="text-sm text-neutral-700 mb-3">
            Untuk informasi ibadah, jadwal, atau bergabung dengan komunitas,
            silakan hubungi cabang terdekat atau download aplikasi ECC.
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-sm">
            <a
              href="mailto:info@eccchurch.global"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-lg transition"
            >
              info@eccchurch.global
            </a>
          </div>
        </div>

        <p className="text-xs text-neutral-400">
          &copy; {new Date().getFullYear()} Elshaddai Creative Community. All rights reserved.
        </p>
      </div>
    </div>
  );
}
