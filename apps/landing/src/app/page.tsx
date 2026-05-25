import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Heart,
  Users,
  Calendar,
  BookOpen,
  Sparkles,
  Newspaper,
  Megaphone,
  Church,
  Clock,
  MapPin,
  Smartphone,
  HandHeart,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { getWebsiteContent, getJson } from '@/lib/website-content';

interface NewsItem {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  heroImageUrl: string | null;
  tanggal: string | null;
  cabang: { id: string; nama: string } | null;
}

interface EventItem {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  heroImageUrl: string | null;
  tanggalMulai: string;
  jamMulai: string | null;
  lokasi: string | null;
  cabang: { id: string; nama: string } | null;
}

interface CalendarEvent {
  id: string;
  tanggal: string;
  jam: string;
  judul: string;
  cabang: { id: string; nama: string };
  kategori: { id: string; nama: string } | null;
  lokasi: string | null;
  isOnline: boolean;
}

interface HeroContent {
  badge: string;
  headline: string;
  description: string;
  ctaPrimary: { label: string; href: string };
  ctaSecondary: { label: string; href: string };
}

interface ServiceCard {
  icon: string;
  title: string;
  desc: string;
}

interface AppLinks {
  appStore: string;
  playStore: string;
  ctaTitle: string;
  ctaDescription: string;
}

// Map nama icon string → component lucide-react. Fallback Sparkles.
const ICONS: Record<string, LucideIcon> = {
  Heart,
  Users,
  Calendar,
  BookOpen,
  Sparkles,
  Newspaper,
  Megaphone,
  Church,
  HandHeart,
  Globe,
};

const HERO_FALLBACK: HeroContent = {
  badge: 'Elshaddai Creative Community',
  headline: 'Selamat datang di ECC',
  description:
    'Komunitas jemaat yang bertumbuh dalam kasih Kristus, melayani sesama dengan kreativitas, dan menjadi terang di tengah dunia. Bergabunglah dengan kami di cabang terdekat.',
  ctaPrimary: { label: 'Temukan Cabang', href: '/cabang' },
  ctaSecondary: { label: 'Tentang Kami', href: '/about' },
};

const SERVICES_FALLBACK: ServiceCard[] = [
  { icon: 'Calendar', title: 'Ibadah Mingguan', desc: 'Ibadah hari Minggu di berbagai cabang.' },
  { icon: 'Users', title: 'Pemuridan & Homecell', desc: 'Persekutuan kelompok kecil.' },
  { icon: 'BookOpen', title: 'Pemberitaan Firman', desc: 'Pengajaran Alkitab yang relevan.' },
  { icon: 'Heart', title: 'Pelayanan Kasih', desc: 'Program sosial untuk komunitas.' },
  { icon: 'Sparkles', title: 'Pelayanan Kreatif', desc: 'Worship, musik, multimedia.' },
  { icon: 'Megaphone', title: 'Event & Retreat', desc: 'Acara khusus & retreat tahunan.' },
];

const APP_LINKS_FALLBACK: AppLinks = {
  appStore: 'https://apps.apple.com/app/ecc-church',
  playStore: 'https://play.google.com/store/apps/details?id=global.eccchurch',
  ctaTitle: 'Bergabunglah Dengan Kami',
  ctaDescription:
    'Download aplikasi ECC untuk akses fitur lengkap: check-in ibadah, daftar event, renungan harian, dan komunitas homecell.',
};

export default async function HomePage() {
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Parallel fetch: dynamic data + CMS content
  const [news, events, ibadah, cms] = await Promise.all([
    apiGet<NewsItem[]>('/public/news?limit=3'),
    apiGet<EventItem[]>('/public/event?limit=3'),
    apiGet<CalendarEvent[]>(`/public/ibadah/calendar?from=${today}&to=${week}`),
    getWebsiteContent(),
  ]);

  const hero = getJson<HeroContent>(cms, 'home.hero', HERO_FALLBACK);
  const services = getJson<ServiceCard[]>(cms, 'home.services', SERVICES_FALLBACK);
  const appLinks = getJson<AppLinks>(cms, 'app.links', APP_LINKS_FALLBACK);

  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-brand-50 via-white to-accent-400/10 overflow-hidden">
        <div className="container-page py-20 lg:py-28 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              {hero.badge}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 mb-6">
              {hero.headline.split('ECC').length > 1 ? (
                <>
                  {hero.headline.split('ECC')[0]}
                  <span className="bg-gradient-to-r from-brand-500 to-accent-500 bg-clip-text text-transparent">
                    ECC
                  </span>
                  {hero.headline.split('ECC').slice(1).join('ECC')}
                </>
              ) : (
                hero.headline
              )}
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600 mb-8 max-w-2xl">{hero.description}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href={hero.ctaPrimary.href} className="btn-primary">
                {hero.ctaPrimary.label}
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href={hero.ctaSecondary.href} className="btn-secondary">
                {hero.ctaSecondary.label}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Ibadah minggu ini */}
      {ibadah && ibadah.length > 0 && (
        <section className="py-16 lg:py-20">
          <div className="container-page">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-1 flex items-center gap-2">
                  <Church className="w-6 h-6 text-brand-500" />
                  Ibadah Minggu Ini
                </h2>
                <p className="text-neutral-600 text-sm">7 hari ke depan, di semua cabang.</p>
              </div>
              <Link
                href="/ibadah"
                className="text-sm font-medium text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                Lihat semua jadwal
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ibadah.slice(0, 6).map((e) => (
                <div
                  key={`${e.id}-${e.tanggal}`}
                  className="bg-white border border-neutral-200 rounded-xl p-4"
                >
                  <div className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(e.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                    <span className="text-neutral-300">·</span>
                    <Clock className="w-3.5 h-3.5" />
                    {e.jam}
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-2">{e.judul}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {e.kategori && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold uppercase tracking-wide">
                        {e.kategori.nama}
                      </span>
                    )}
                    <div className="text-xs text-neutral-500 flex items-center gap-1">
                      <Church className="w-3 h-3" />
                      {e.cabang.nama}
                      {e.isOnline && <span className="text-brand-600">· Online</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Latest News */}
      {news && news.length > 0 && (
        <section className="py-16 lg:py-20 bg-neutral-50">
          <div className="container-page">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-1 flex items-center gap-2">
                  <Newspaper className="w-6 h-6 text-brand-500" />
                  Berita Terbaru
                </h2>
                <p className="text-neutral-600 text-sm">Kabar kegiatan dari ECC.</p>
              </div>
              <Link
                href="/news"
                className="text-sm font-medium text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                Lihat semua berita
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {news.map((item) => (
                <Link
                  key={item.id}
                  href={`/news/${item.slug}`}
                  className="group bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:shadow-lg transition"
                >
                  {item.heroImageUrl ? (
                    <div className="aspect-video relative bg-neutral-100">
                      <Image
                        src={absoluteUrl(item.heroImageUrl) ?? ''}
                        alt={item.judul}
                        fill
                        className="object-cover group-hover:scale-105 transition duration-500"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-brand-100 to-accent-400/30 flex items-center justify-center">
                      <Newspaper className="w-12 h-12 text-brand-300" />
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="font-bold text-neutral-900 mb-2 group-hover:text-brand-600 transition line-clamp-2">
                      {item.judul}
                    </h3>
                    {item.ringkasan && (
                      <p className="text-sm text-neutral-600 line-clamp-2 mb-3">
                        {item.ringkasan}
                      </p>
                    )}
                    <div className="text-xs text-neutral-500">
                      {item.tanggal && (
                        <span>
                          {new Date(item.tanggal).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                      {item.cabang && <span> · {item.cabang.nama}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Upcoming Events */}
      {events && events.length > 0 && (
        <section className="py-16 lg:py-20">
          <div className="container-page">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-1 flex items-center gap-2">
                  <Megaphone className="w-6 h-6 text-brand-500" />
                  Event Mendatang
                </h2>
                <p className="text-neutral-600 text-sm">Acara khusus yang akan datang.</p>
              </div>
              <Link
                href="/event"
                className="text-sm font-medium text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                Lihat semua event
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {events.map((e) => (
                <Link
                  key={e.id}
                  href={`/event/${e.slug}`}
                  className="group bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:shadow-lg transition"
                >
                  {e.heroImageUrl ? (
                    <div className="aspect-video relative bg-neutral-100">
                      <Image
                        src={absoluteUrl(e.heroImageUrl) ?? ''}
                        alt={e.judul}
                        fill
                        className="object-cover group-hover:scale-105 transition duration-500"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-brand-100 to-accent-400/30 flex items-center justify-center">
                      <Megaphone className="w-12 h-12 text-brand-300" />
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="font-bold text-neutral-900 mb-2 group-hover:text-brand-600 transition line-clamp-2">
                      {e.judul}
                    </h3>
                    {e.ringkasan && (
                      <p className="text-sm text-neutral-600 line-clamp-2 mb-3">{e.ringkasan}</p>
                    )}
                    <div className="text-xs text-neutral-500 space-y-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(e.tanggalMulai).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {e.jamMulai ? ` · ${e.jamMulai}` : ''}
                      </div>
                      {e.lokasi && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          <span className="truncate">{e.lokasi}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Apa yang kami lakukan — dari CMS */}
      <section className="py-16 lg:py-20 bg-neutral-50">
        <div className="container-page">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">
              Apa Yang Kami Lakukan
            </h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              Berbagai pelayanan untuk jemaat dari segala usia dan latar belakang.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {services.map((item, idx) => {
              const Icon = ICONS[item.icon] ?? Sparkles;
              return (
                <div
                  key={`${item.title}-${idx}`}
                  className="bg-white rounded-xl p-6 hover:shadow-md transition border border-neutral-200"
                >
                  <div className="w-10 h-10 bg-brand-50 text-brand-500 rounded-lg flex items-center justify-center mb-3">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-semibold text-neutral-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Download App — dari CMS */}
      <section className="py-16 lg:py-20">
        <div className="container-page">
          <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-3xl p-10 lg:p-14 text-center text-white shadow-xl">
            <Smartphone className="w-12 h-12 mx-auto mb-4 opacity-90" />
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">{appLinks.ctaTitle}</h2>
            <p className="text-brand-50 max-w-xl mx-auto mb-8 text-lg">
              {appLinks.ctaDescription}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {appLinks.appStore && (
                <a
                  href={appLinks.appStore}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-600 hover:bg-brand-50 rounded-lg font-semibold transition shadow-sm"
                >
                  App Store
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
              {appLinks.playStore && (
                <a
                  href={appLinks.playStore}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700/30 text-white hover:bg-brand-700/50 rounded-lg font-semibold transition border border-white/20"
                >
                  Play Store
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
