/**
 * Beranda — satu layar (tanpa scroll): showcase Els App + ibadah hari ini.
 * Data: ibadah hari ini (semua cabang); link unduh dari lib/app-links. Desain: docs/design/mockup-beranda-eccchurch-v3.html.
 */
import { apiGet } from '@/lib/api';
import { APP_STORE_URL, PLAY_STORE_URL, WEB_APP_URL } from '@/lib/app-links';
import { HomeShowcase, type TodayIbadah } from '@/components/home/home-showcase';
import { getLang } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';

interface CalendarEvent extends TodayIbadah {
  tanggal: string;
  urutan?: number;
}

const TZ = 'Asia/Jakarta';

export default async function HomePage() {
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now); // YYYY-MM-DD
  const lang = getLang();
  const todayLabel = new Intl.DateTimeFormat(localeOf(lang), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'short' }).format(now);

  const calendar = await apiGet<CalendarEvent[]>(`/public/ibadah/calendar?from=${today}&to=${today}`, { revalidate: 300 });

  const list = (calendar ?? [])
    .filter((e) => e.tanggal === today)
    .sort((a, b) => a.jam.localeCompare(b.jam) || (a.urutan ?? 0) - (b.urutan ?? 0));

  return (
    <HomeShowcase
      today={list}
      todayLabel={todayLabel}
      links={{ appStore: APP_STORE_URL, playStore: PLAY_STORE_URL, web: WEB_APP_URL }}
    />
  );
}
