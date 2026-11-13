import type { Metadata } from 'next';
import {
  Mail,
  MapPin,
  Church,
  Navigation,
  Globe,
  Instagram,
  Youtube,
  Facebook,
  Music2,
  Twitter,
  type LucideIcon,
} from 'lucide-react';
import { getWebsiteContent, getJson } from '@/lib/website-content';
import { getL, getT } from '@/lib/i18n-server';
import { ScreenPage } from '@/components/screen-page';
import { GroupCarousel } from '@/components/h-carousel';
import { apiGet } from '@/lib/api';

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: L('Kontak', 'Contact'),
    description: L(
      'Hubungi Elshaddai Creative Community (ECC) — email, alamat, dan social media.',
      'Contact Elshaddai Creative Community (ECC) — email, address, and social media.',
    ),
  };
}

interface Cabang {
  id: string;
  nama: string;
  alamat: string | null;
  mapsUrl?: string | null;
}

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
  const { t } = getT();
  const [cms, cabang] = await Promise.all([getWebsiteContent(), apiGet<Cabang[]>('/auth/cabang?isActive=true')]);
  const info = getJson<ContactInfo>(cms, 'contact.info', CONTACT_FALLBACK);
  const activeSocial = info.socialLinks.filter((s) => s.url && s.url.trim() !== '');

  const kontak = [
        <div key="email" className="s-card h-full">
          <div className="s-card-body flex flex-col gap-3">
            <div className="w-12 h-12 bg-brand-grad text-white rounded-2xl flex items-center justify-center">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-xl text-neutral-900">{t('contact.email')}</h3>
            <a href={`mailto:${info.email}`} className="text-brand-600 font-semibold hover:underline break-all">
              {info.email}
            </a>
            <p className="text-sm text-neutral-500">{t('contact.emailNote')}</p>
          </div>
        </div>,
        <div key="alamat" className="s-card h-full">
          <div className="s-card-body flex flex-col gap-3">
            <div className="w-12 h-12 bg-brand-grad text-white rounded-2xl flex items-center justify-center">
              <MapPin className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-xl text-neutral-900">{t('contact.address')}</h3>
            <p className="text-neutral-700">{info.alamat}</p>
            <p className="text-sm text-neutral-500">{t('contact.addressNote')}</p>
          </div>
        </div>,
        activeSocial.length > 0 ? (
          <div key="sosial" className="s-card h-full">
            <div className="s-card-body flex flex-col gap-3">
              <div className="w-12 h-12 bg-brand-grad text-white rounded-2xl flex items-center justify-center">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-xl text-neutral-900">{t('contact.social')}</h3>
              <p className="text-sm text-neutral-500">{t('contact.socialNote')}</p>
              <div className="flex items-center gap-2.5 flex-wrap">
                {activeSocial.map((s) => {
                  const Icon = SOCIAL_ICONS[s.platform.toLowerCase()] ?? Globe;
                  const label = SOCIAL_LABELS[s.platform.toLowerCase()] ?? s.platform;
                  return (
                    <a
                      key={s.platform}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-11 h-11 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-600 hover:text-brand-600 hover:border-brand-300 hover:bg-brand-50 transition"
                      title={label}
                    >
                      <Icon className="w-5 h-5" />
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null,
  ].filter(Boolean) as React.ReactElement[];

  const cabangCards = (cabang ?? []).map((c) => (
    <div key={c.id} className="s-card h-full">
      <div className="bg-brand-grad text-white px-5 py-4 shrink-0 flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
          <Church className="w-6 h-6" />
        </span>
        <h3 className="font-extrabold text-lg leading-tight line-clamp-2 min-h-[2.5em] flex items-center">{c.nama}</h3>
      </div>
      <div className="flex-1 min-h-0 p-5 flex flex-col">
        <p className="text-sm text-neutral-600 flex items-start gap-2 flex-1 min-h-0">
          <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-brand-500" />
          <span className="line-clamp-3">{c.alamat || c.nama}</span>
        </p>
        <a
          href={
            c.mapsUrl && /^https?:\/\//i.test(c.mapsUrl)
              ? c.mapsUrl
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.nama, c.alamat].filter(Boolean).join(', '))}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-100"
        >
          <Navigation className="w-4 h-4" />
          {t('mk.maps')}
        </a>
      </div>
    </div>
  ));

  return (
    <ScreenPage title={t('contact.title')} subtitle={t('contact.sub')}>
      <GroupCarousel
        itemWidth="min(290px, 82vw)"
        minItemH={240}
        itemH={280}
        groups={[
          { key: 'kontak', label: t('nav.contact'), items: kontak },
          ...(cabangCards.length ? [{ key: 'cabang', label: t('nav.cabang'), items: cabangCards }] : []),
        ]}
      />
    </ScreenPage>
  );
}
