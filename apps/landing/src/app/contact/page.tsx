import type { Metadata } from 'next';
import { Mail, MapPin, Globe, Instagram, Youtube, Facebook } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Kontak',
  description: 'Hubungi ECC Church — email, alamat, dan social media.',
};

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-4">Hubungi Kami</h1>
          <p className="text-lg text-neutral-600">
            Kami senang mendengar dari Anda. Sampaikan pertanyaan, masukan, atau request
            informasi lebih lanjut.
          </p>
        </div>
      </section>

      {/* Contact info */}
      <section className="py-16">
        <div className="container-page max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200 rounded-2xl p-8">
              <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-xl text-neutral-900 mb-2">Email</h3>
              <a
                href="mailto:info@eccchurch.global"
                className="text-brand-600 hover:text-brand-700 hover:underline"
              >
                info@eccchurch.global
              </a>
              <p className="text-sm text-neutral-500 mt-2">
                Kami akan membalas dalam 1-2 hari kerja.
              </p>
            </div>

            <div className="bg-white border border-neutral-200 rounded-2xl p-8">
              <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-xl text-neutral-900 mb-2">Alamat</h3>
              <p className="text-neutral-700">Jakarta, Indonesia</p>
              <p className="text-sm text-neutral-500 mt-2">
                Lihat lokasi cabang gereja terdekat di halaman{' '}
                <a href="/cabang" className="text-brand-600 hover:underline">
                  Cabang
                </a>
                .
              </p>
            </div>
          </div>

          {/* Social */}
          <div className="mt-12 text-center">
            <h3 className="font-semibold text-neutral-900 mb-4">Ikuti Kami di Social Media</h3>
            <div className="flex items-center justify-center gap-3">
              {[
                { icon: Instagram, label: 'Instagram', href: '#' },
                { icon: Youtube, label: 'YouTube', href: '#' },
                { icon: Facebook, label: 'Facebook', href: '#' },
                { icon: Globe, label: 'Website', href: 'https://eccchurch.global' },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-600 hover:text-brand-500 hover:border-brand-300 hover:bg-brand-50 transition"
                  title={s.label}
                >
                  <s.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
            <p className="text-xs text-neutral-400 mt-3">
              Link social media akan di-update setelah official channel aktif.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
