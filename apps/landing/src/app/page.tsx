/**
 * Beranda — satu layar (tanpa scroll): showcase Els App + ibadah hari ini.
 * Data: ibadah hari ini (semua cabang) & link unduh dari Konten Website
 * (`app.links`). Desain: docs/design/mockup-beranda-eccchurch-v3.html.
 */
import { apiGet } from '@/lib/api';
import { getWebsiteContent, getJson } from '@/lib/website-content';
import { HomeShowcase, type TodayIbadah } from '@/components/home/home-showcase';
import { getLang } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';

interface CalendarEvent extends TodayIbadah {
  tanggal: string;
  urutan?: number;
}

interface AppLinks {
  appStore: string;
  playStore: string;
  webApp?: string;
}

const APP_LINKS_FALLBACK: AppLinks = {
  appStore: 'https://apps.apple.com/app/ecc-church',
  playStore: 'https://play.google.com/store/apps/details?id=global.eccchurch',
  webApp: 'https://elsapp.eccchurch.global',
};

const TZ = 'Asia/Jakarta';

export default async function HomePage() {
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // YYYY-MM-DD
  const lang = getLang();
  const todayLabel = new Intl.DateTimeFormat(localeOf(lang), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' }).format(now);

  const [calendar, cms] = await Promise.all([
    apiGet<CalendarEvent[]>(`/public/ibadah/calendar?from=${today}&to=${today}`, { revalidate: 300 }),
    getWebsiteContent(),
  ]);
  const appLinks = { ...APP_LINKS_FALLBACK, ...getJson<Partial<AppLinks>>(cms, 'app.links', {}) };

  const list = (calendar ?? [])
    .filter((e) => e.tanggal === today)
    .sort((a, b) => a.jam.localeCompare(b.jam) || (a.urutan ?? 0) - (b.urutan ?? 0));

  return (
    <HomeShowcase
      today={list}
      todayLabel={todayLabel}
      links={{ appStore: appLinks.appStore, playStore: appLinks.playStore, web: appLinks.webApp || APP_LINKS_FALLBACK.webApp! }}
    />
  );
}
