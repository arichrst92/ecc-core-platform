import type { Metadata } from 'next';
import {
  Mail,
  MapPin,
  Globe,
  Instagram,
  Youtube,
  Facebook,
  Music2,
  Twitter,
  type LucideIcon,
} from 'lucide-react';
import { getWebsiteContent, getJson } from '@/lib/website-content';

export const metadata: Metadata = {
  title: 'Kontak',
  description: 'Hubungi Elshaddai Creative Community (ECC) — email, alamat, dan social media.',
};

interface ContactInfo {
  email: string;
  alamat: string;
  socialLinks: { platform: string; url: string }[];
}

const CONTACT_FALLBACK: ContactInfo = {
  email: 'info@eccchurch.global',
  alamat: 'Jakarta, Indonesia',
  socialLinks: [],
};

const SOCIAL_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  tiktok: Music2,
  twitter: Twitter,
};

const SOCIAL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  twitter: 'Twitter',
};

export default async function ContactPage() {
  const cms = await getWebsiteContent();
  const info = getJson<ContactInfo>(cms, 'contact.info', CONTACT_FALLBACK);
  const activeSocial = info.socialLinks.filter((s) => s.url && s.url.trim() !== '');

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 to-white py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-4">Hubungi Kami</h1>
          <p className="text-lg text-neutral-600">
            Kami senang mendengar dari Anda. Sampaikan pertanyaan, masukan, atau request
            informasi lebih lanjut.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="container-page max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white border border-neutral-200 rounded-2xl p-8">
              <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4">
                <Mail className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-xl text-neutral-900 mb-2">Email</h3>
              <a
                href={`mailto:${info.email}`}
                className="text-brand-600 hover:text-brand-700 hover:underline break-all"
              >
                {info.email}
              </a>
              <p className="text-sm text-neutral-500 mt-2">Kami akan membalas dalam 1-2 hari kerja.</p>
            </div>

            <div className="bg-white border border-neutral-200 rounded-2xl p-8">
              <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4">
                <MapPin className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-xl text-neutral-900 mb-2">Alamat</h3>
              <p className="text-neutral-700">{info.alamat}</p>
              <p className="text-sm text-neutral-500 mt-2">
                Lihat lokasi cabang gereja terdekat di halaman{' '}
                <a href="/cabang" className="text-brand-600 hover:underline">
                  Cabang
                </a>
                .
              </p>
            </div>
          </div>

          {activeSocial.length > 0 && (
            <div className="mt-12 text-center">
              <h3 className="font-semibold text-neutral-900 mb-4">Ikuti Kami di Social Media</h3>
              <div className="flex items-center justify-center gap-3 flex-wrap">
                {activeSocial.map((s) => {
                  const Icon = SOCIAL_ICONS[s.platform.toLowerCase()] ?? Globe;
                  const label = SOCIAL_LABELS[s.platform.toLowerCase()] ?? s.platform;
                  return (
                    <a
                      key={s.platform}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-11 h-11 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-600 hover:text-brand-500 hover:border-brand-300 hover:bg-brand-50 transition"
                      title={label}
                    >
                      <Icon className="w-5 h-5" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
