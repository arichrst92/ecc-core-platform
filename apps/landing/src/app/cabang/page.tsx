import type { Metadata } from 'next';
import { MapPin, Phone, ExternalLink, Church, Smartphone } from 'lucide-react';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Cabang Gereja',
  description: 'Cabang gereja Elshaddai Creative Community.',
};

interface Cabang {
  id: string;
  nama: string;
  kode: string;
  alamat: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
}

export default async function CabangPage() {
  const cabang = (await apiGet<Cabang[]>('/auth/cabang?isActive=true')) ?? [];

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 to-white py-12 lg:py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Church className="w-3.5 h-3.5" />
            Cabang
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">Cabang Gereja</h1>
          <p className="text-neutral-600">
            Temukan cabang ECC terdekat dari lokasi Anda.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page max-w-4xl mx-auto">
          {cabang.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl">
              Belum ada data cabang. Silakan hubungi kami untuk informasi.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {cabang.map((c) => {
                const mapHref =
                  c.latitude && c.longitude
                    ? `https://www.google.com/maps?q=${c.latitude},${c.longitude}`
                    : c.alamat
                      ? `https://www.google.com/maps/search/${encodeURIComponent(c.alamat)}`
                      : null;
                return (
                  <div
                    key={c.id}
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
                        {c.alamat && (
                          <p className="text-sm text-neutral-600 mb-3 flex items-start gap-2">
                            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-neutral-400" />
                            <span>{c.alamat}</span>
                          </p>
                        )}
                        {mapHref && (
                          <a
                            href={mapHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Lihat di Google Maps
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-12 p-6 bg-neutral-50 border border-neutral-200 rounded-2xl text-center">
            <Smartphone className="w-10 h-10 mx-auto mb-3 text-brand-500" />
            <p className="text-sm text-neutral-700 mb-3">
              Ingin tau jadwal ibadah lengkap, event, atau renungan harian per cabang?
            </p>
            <a
              href="https://apps.apple.com/app/ecc-church"
              className="btn-primary text-sm"
            >
              Download Aplikasi ECC
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
