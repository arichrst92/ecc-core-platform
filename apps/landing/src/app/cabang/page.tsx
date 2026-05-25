import type { Metadata } from 'next';
import { MapPin, Phone, ExternalLink, Church } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Cabang Gereja',
  description: 'Temukan cabang ECC Church terdekat dari lokasi Anda.',
};

// Static cabang list — kalau mau dynamic, bisa fetch dari API /auth/cabang
// di server component (revalidate 1 jam) saat content scaling up.
const CABANG = [
  {
    nama: 'ECC Jakarta',
    kode: 'JKT',
    alamat: 'Jakarta, Indonesia',
    kontak: 'jakarta@eccchurch.global',
    isActive: true,
  },
  // TODO: tambah cabang lain saat go-live. Mobile/portal sudah fetch live
  // dari /auth/cabang, di sini static untuk SEO + first paint cepat.
];

export default function CabangPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-4">Cabang Gereja</h1>
          <p className="text-lg text-neutral-600">
            Temukan cabang ECC Church terdekat dari lokasi Anda. Klik cabang untuk informasi
            jadwal ibadah lengkap.
          </p>
        </div>
      </section>

      {/* List */}
      <section className="py-16">
        <div className="container-page max-w-4xl mx-auto">
          {CABANG.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              Informasi cabang sedang di-update. Silakan hubungi kami.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {CABANG.map((c) => (
                <div
                  key={c.kode}
                  className="bg-white border border-neutral-200 rounded-2xl p-6 hover:shadow-md transition"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center shrink-0">
                      <Church className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-xl text-neutral-900 mb-1">{c.nama}</h3>
                      <p className="text-xs text-neutral-400 font-mono uppercase mb-3">
                        Kode {c.kode}
                      </p>
                      <ul className="space-y-2 text-sm text-neutral-600">
                        <li className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-neutral-400" />
                          <span>{c.alamat}</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <Phone className="w-4 h-4 mt-0.5 shrink-0 text-neutral-400" />
                          <a href={`mailto:${c.kontak}`} className="hover:text-brand-500 break-all">
                            {c.kontak}
                          </a>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-12 p-6 bg-neutral-50 border border-neutral-200 rounded-2xl text-center">
            <p className="text-sm text-neutral-700 mb-3">
              Ingin tau jadwal ibadah lengkap, event, atau renungan harian?
            </p>
            <a
              href="https://apps.apple.com/app/ecc-church"
              className="btn-primary text-sm"
            >
              Download Aplikasi Mobile
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
