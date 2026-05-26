import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Store,
  Globe,
  MapPin,
  MessageCircle,
  Building2,
  Church,
  FileText,
  ExternalLink,
  Calendar,
  Link2,
} from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';

interface SocialLink {
  platform: string;
  url: string;
}

interface LocalBusinessDetail {
  id: string;
  nama: string;
  deskripsi: string | null;
  industri: string | null;
  tipeBisnis: 'B2C' | 'B2B' | 'B2B2C' | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  companyProfileUrl: string | null;
  socialLinks: SocialLink[] | null;
  websiteUrl: string | null;
  whatsappUrl: string | null;
  isOnline: boolean;
  lokasi: string | null;
  createdAt: string;
  owner: { cabang: { id: string; nama: string } | null } | null;
}

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const item = await apiGet<LocalBusinessDetail>(
    `/public/local-market/${params.id}`,
  );
  if (!item) return { title: 'Bisnis tidak ditemukan' };
  return {
    title: `${item.nama} — Local Market`,
    description:
      item.deskripsi?.slice(0, 160) ??
      `${item.nama} di ECC Local Market — ${item.industri ?? 'bisnis komunitas'}`,
    openGraph: item.heroImageUrl
      ? { images: [absoluteUrl(item.heroImageUrl) ?? ''] }
      : undefined,
  };
}

// Helper — smart label detection berdasarkan platform / URL.
function guessPlatformLabel(s: SocialLink): string {
  const p = (s.platform ?? '').toLowerCase().trim();
  if (p) return s.platform;
  const u = (s.url ?? '').toLowerCase();
  if (u.includes('instagram')) return 'Instagram';
  if (u.includes('facebook')) return 'Facebook';
  if (u.includes('tiktok')) return 'TikTok';
  if (u.includes('youtube')) return 'YouTube';
  if (u.includes('linkedin')) return 'LinkedIn';
  if (u.includes('twitter') || u.includes('x.com')) return 'X (Twitter)';
  if (u.includes('shopee')) return 'Shopee';
  if (u.includes('tokopedia')) return 'Tokopedia';
  return 'Link';
}

export default async function LocalMarketDetailPage({ params }: PageProps) {
  const b = await apiGet<LocalBusinessDetail>(
    `/public/local-market/${params.id}`,
  );
  if (!b) notFound();

  const socials = Array.isArray(b.socialLinks) ? b.socialLinks : [];

  return (
    <article className="py-8 lg:py-12">
      <div className="container-page max-w-3xl mx-auto">
        <Link
          href="/local-market"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-brand-600 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Local Market
        </Link>

        {/* Header — logo + nama + badge */}
        <div className="flex items-start gap-4 mb-4">
          {b.logoUrl ? (
            <div className="w-16 h-16 sm:w-20 sm:h-20 relative shrink-0 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
              <Image
                src={absoluteUrl(b.logoUrl) ?? ''}
                alt={`${b.nama} logo`}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Store className="w-8 h-8" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 leading-tight">
              {b.nama}
            </h1>
            {b.industri && (
              <p className="text-sm text-neutral-500 mt-1">{b.industri}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs mb-6">
          {b.tipeBisnis && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
              <Building2 className="w-3 h-3" />
              {b.tipeBisnis}
            </span>
          )}
          {b.isOnline && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
              Online
            </span>
          )}
          {b.owner?.cabang && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">
              <Church className="w-3 h-3" />
              {b.owner.cabang.nama}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-neutral-500">
            <Calendar className="w-3 h-3" />
            Terdaftar{' '}
            {new Date(b.createdAt).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>

        {/* Hero image — contained, aspect-video, rounded (sama pattern news detail) */}
        {b.heroImageUrl && (
          <div className="aspect-video relative bg-neutral-100 rounded-2xl overflow-hidden mb-8">
            <Image
              src={absoluteUrl(b.heroImageUrl) ?? ''}
              alt={b.nama}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
          </div>
        )}

        {/* Tentang */}
        {b.deskripsi && (
          <section className="mb-8">
            <h2 className="font-bold text-neutral-900 mb-3">Tentang</h2>
            <p className="text-neutral-700 whitespace-pre-line leading-relaxed">
              {b.deskripsi}
            </p>
          </section>
        )}

        {/* Kontak */}
        {(b.websiteUrl || b.whatsappUrl) && (
          <section className="mb-8">
            <h2 className="font-bold text-neutral-900 mb-3">Kontak</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {b.websiteUrl && (
                <a
                  href={b.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 border border-neutral-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition group"
                >
                  <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100 flex items-center justify-center shrink-0 transition">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">
                      Website
                    </div>
                    <div className="text-sm text-neutral-900 truncate">
                      {b.websiteUrl.replace(/^https?:\/\//, '')}
                    </div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                </a>
              )}
              {b.whatsappUrl && (
                <a
                  href={b.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 border border-neutral-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50 transition group"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 flex items-center justify-center shrink-0 transition">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-neutral-500 uppercase tracking-wide font-semibold">
                      WhatsApp
                    </div>
                    <div className="text-sm text-neutral-900">Chat sekarang</div>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                </a>
              )}
            </div>
          </section>
        )}

        {/* Sosial Media */}
        {socials.length > 0 && (
          <section className="mb-8">
            <h2 className="font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <Link2 className="w-4 h-4 text-brand-500" />
              Sosial Media
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {socials.map((s, idx) => (
                <a
                  key={`${s.url}-${idx}`}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 px-4 py-3 border border-neutral-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-neutral-100 text-neutral-600 group-hover:bg-brand-100 group-hover:text-brand-700 flex items-center justify-center shrink-0 transition">
                      <Link2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-900">
                        {guessPlatformLabel(s)}
                      </div>
                      <div className="text-xs text-neutral-500 truncate">
                        {s.url.replace(/^https?:\/\//, '')}
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-neutral-400 group-hover:text-brand-600 shrink-0" />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Company Profile PDF */}
        {b.companyProfileUrl && (
          <section className="mb-8">
            <h2 className="font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-500" />
              Company Profile
            </h2>
            <a
              href={absoluteUrl(b.companyProfileUrl) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition"
            >
              <FileText className="w-4 h-4" />
              Download PDF
              <ExternalLink className="w-3.5 h-3.5 opacity-75" />
            </a>
          </section>
        )}

        {/* Lokasi */}
        {b.lokasi && (
          <section className="mb-8">
            <h2 className="font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-500" />
              Lokasi
            </h2>
            <p className="text-sm text-neutral-700 whitespace-pre-line">{b.lokasi}</p>
          </section>
        )}
      </div>
    </article>
  );
}
