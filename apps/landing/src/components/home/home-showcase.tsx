'use client';

/**
 * Beranda satu layar (tanpa scroll): showcase Els App (carousel 3D layar app)
 * + Ibadah hari ini (slide menyamping). Navbar transparan di atas latar oranye
 * gradient — sama dengan gradient brand di Els App.
 * Desain: docs/design/mockup-beranda-eccchurch-v3.html
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Check, ChevronLeft, ChevronRight, Globe, MapPin, Menu, X } from 'lucide-react';
import { LangSwitch, useLang } from '../lang-provider';
import { NAV_LINKS } from '../navbar';
import type { DictKey } from '@/lib/i18n';
import './home.css';
import { EccLogo } from '@/components/ecc-logo';
import { tzLabel } from '@/lib/tz';
import { YouTubePanel, YOUTUBE_PATH } from './youtube-panel';

export interface TodayIbadah {
  id: string;
  jam: string;
  jamSelesai: string;
  judul: string;
  cabang: { id: string; nama: string; timezone?: string | null };
  isOnline: boolean;
}

export interface HomeAppLinks {
  appStore: string;
  playStore: string;
  web: string;
}

type Slide = { t: string; k: string; d: string; f: string[] };
/**
 * Tampilan layar Els App (public/app-screens/*.webp) — digambar mengikuti kode
 * app (sama dengan Handbook/Manual), data contoh "Jemaat ECC". Urutan = SLIDES.
 */
const APP_SCREENS = ['beranda', 'tiket', 'homecell', 'bible365', 'ckids', 'local-market', 'worship', 'event'];

const SLIDES: Record<'id' | 'en', Slide[]> = {
  id: [
    { t: 'Beranda', k: 'Semua dalam satu layar', d: 'Jadwal ibadah berikutnya, tiket aktif, dan kabar terbaru langsung terlihat begitu app dibuka.', f: ['Ibadah & tiket terdekat', 'Akses cepat ke semua fitur', 'News & renungan terbaru'] },
    { t: 'Tiket & self check-in', k: 'Datang, check-in, beribadah', d: 'Reservasi ibadah, tunjukkan QR tiket, atau check-in sendiri saat tiba di lokasi.', f: ['Reservasi untuk keluarga', 'QR tiket digital', 'Self check-in di lokasi'] },
    { t: 'Homecell', k: 'Bertumbuh bersama', d: 'Temukan homecell terdekat dari rumah dan bergabung langsung dari app.', f: ['Peta homecell terdekat', 'Jadwal & lokasi pertemuan', 'Gabung dengan satu ketukan'] },
    { t: 'Bible 365 & renungan', k: 'Firman setiap hari', d: 'Baca Alkitab setahun dengan rencana harian dan renungan yang menyertainya.', f: ['Rencana baca 365 hari', 'Renungan harian', 'Catat progres bacaan'] },
    { t: 'CKids', k: 'Untuk si kecil', d: 'QR anak untuk check-in, poin kehadiran, dan katalog hadiah yang bisa ditukar.', f: ['QR check-in anak', 'Poin setiap hadir', 'Tukar poin dengan hadiah'] },
    { t: 'Local Market', k: 'Dukung usaha jemaat', d: 'Jelajahi usaha milik jemaat ECC lengkap dengan katalog produk dan toko online.', f: ['Katalog produk & jasa', 'Hubungi via WhatsApp', 'Tautan toko online'] },
    { t: 'ECC Worship', k: 'Pujian ECC di genggaman', d: 'Dengarkan lagu-lagu ECC Worship lengkap dengan lirik yang berjalan mengikuti lagu.', f: ['Album ECC Worship', 'Lirik sinkron', 'Putar di mana saja'] },
    { t: 'Event', k: 'Jangan ketinggalan', d: 'Lihat event gereja, daftar, dan simpan tiketnya dalam satu tempat.', f: ['Daftar event online', 'Tiket & pengingat', 'Bagikan ke teman'] },
  ],
  en: [
    { t: 'Home', k: 'Everything on one screen', d: 'Your next service, active tickets, and the latest news — right when you open the app.', f: ['Upcoming services & tickets', 'Quick access to every feature', 'Latest news & devotions'] },
    { t: 'Tickets & self check-in', k: 'Arrive, check in, worship', d: 'Reserve a service, show your QR ticket, or check yourself in when you arrive.', f: ['Reserve for your family', 'Digital QR tickets', 'On-site self check-in'] },
    { t: 'Homecell', k: 'Grow together', d: 'Find the homecell closest to home and join right from the app.', f: ['Map of nearby homecells', 'Meeting times & places', 'Join with one tap'] },
    { t: 'Bible 365 & devotions', k: "God's word every day", d: 'Read through the Bible in a year with a daily plan and devotions alongside.', f: ['365-day reading plan', 'Daily devotions', 'Track your progress'] },
    { t: 'CKids', k: 'For the little ones', d: 'Kids QR for check-in, attendance points, and a rewards catalog to redeem.', f: ['Kids check-in QR', 'Points for attending', 'Redeem points for gifts'] },
    { t: 'Local Market', k: 'Support member businesses', d: 'Browse businesses run by ECC members, with product catalogs and online stores.', f: ['Product & service catalog', 'Chat on WhatsApp', 'Online store links'] },
    { t: 'ECC Worship', k: 'ECC praise in your pocket', d: 'Listen to ECC Worship songs with lyrics that follow along as they play.', f: ['ECC Worship albums', 'Synced lyrics', 'Play anywhere'] },
    { t: 'Events', k: "Don't miss out", d: 'See church events, register, and keep your tickets in one place.', f: ['Register online', 'Tickets & reminders', 'Share with friends'] },
  ],
};

/** Logo resmi toko aplikasi (Simple Icons, CC0) untuk tombol unduh. */
const APPLE_PATH =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';
const ANDROID_PATH =
  'M18.4395 5.5586c-.675 1.1664-1.352 2.3318-2.0274 3.498-.0366-.0155-.0742-.0286-.1113-.043-1.8249-.6957-3.484-.8-4.42-.787-1.8551.0185-3.3544.4643-4.2597.8203-.084-.1494-1.7526-3.021-2.0215-3.4864a1.1451 1.1451 0 0 0-.1406-.1914c-.3312-.364-.9054-.4859-1.379-.203-.475.282-.7136.9361-.3886 1.5019 1.9466 3.3696-.0966-.2158 1.9473 3.3593.0172.031-.4946.2642-1.3926 1.0177C2.8987 12.176.452 14.772 0 18.9902h24c-.119-1.1108-.3686-2.099-.7461-3.0117-.7438-1.7997-1.8456-2.9858-2.6074-3.6777-.7608-.6908-1.3279-.9922-1.3477-1.0274.6013-1.0401 1.2017-2.0805 1.8027-3.1211.2205-.3818.4334-.7535.5527-.9551.4256-.7196.1023-1.4588-.3945-1.7558-.5012-.3-1.248-.1715-1.6484.4824zM6.8301 13.5234c.6034 0 1.0937.4882 1.0937 1.0918 0 .6035-.4892 1.0938-1.0937 1.0938-.6045 0-1.0938-.4903-1.0938-1.0938s.4902-1.0918 1.0938-1.0918zm10.3203 0c.6034 0 1.0937.4882 1.0937 1.0918 0 .6035-.4893 1.0938-1.0937 1.0938-.6045 0-1.0938-.4903-1.0938-1.0938s.4903-1.0918 1.0938-1.0918z';
const StoreLogo = ({ d, color }: { d: string; color: string }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" aria-hidden fill={color}>
    <path d={d} />
  </svg>
);


const toMin = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};
/** Menit sejak 00:00 di zona waktu cabang. */
function nowMinIn(tz: string) {
  try {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    return Number(p.find((x) => x.type === 'hour')?.value ?? 0) * 60 + Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  } catch {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
}
type Status = 'live' | 'soon' | 'later' | 'done';
function statusOf(i: TodayIbadah): Status {
  const now = nowMinIn(i.cabang.timezone || 'Asia/Jakarta');
  const a = toMin(i.jam);
  let b = toMin(i.jamSelesai);
  if (b <= a) b = 24 * 60 - 1;
  if (now > b) return 'done';
  if (now >= a) return 'live';
  if (a - now <= 60) return 'soon';
  return 'later';
}
const hhmm = (s: string) => (s ?? '').slice(0, 5).replace(':', '.');

function useSwipe(onSwipe: (dx: number) => void) {
  const x0 = useRef<number | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => {
      x0.current = e.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (x0.current === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - x0.current;
      if (Math.abs(dx) > 40) onSwipe(dx);
      x0.current = null;
    },
  };
}

export function HomeShowcase({ today, todayLabel, links }: { today: TodayIbadah[]; todayLabel: string; links: HomeAppLinks }) {
  const [menu, setMenu] = useState(false);
  // Panel "Our YouTube Channel": pasang dulu, lalu geser masuk (animasi).
  const [ytMounted, setYtMounted] = useState(false);
  const [ytOpen, setYtOpen] = useState(false);
  const openYt = () => {
    setYtMounted(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setYtOpen(true)));
  };
  const closeYt = () => {
    setYtOpen(false);
    setTimeout(() => setYtMounted(false), 300);
  };
  const { lang, t } = useLang();
  const slides = SLIDES[lang] ?? SLIDES.id;

  // ---------- carousel layar app ----------
  const [cur, setCur] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0, vw: 1440 });
  const stageRef = useRef<HTMLDivElement>(null);
  const paused = useRef(false);
  const n = APP_SCREENS.length;
  const go = useCallback((i: number) => setCur(((i % n) + n) % n), [n]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight, vw: window.innerWidth }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const t = setInterval(() => {
      if (!paused.current) setCur((c) => (c + 1) % n);
    }, 5000);
    return () => clearInterval(t);
  }, [n, cur]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCur((c) => (c + 1) % n);
      if (e.key === 'ArrowLeft') setCur((c) => (c - 1 + n) % n);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [n]);
  const stageSwipe = useSwipe((dx) => go(cur + (dx < 0 ? 1 : -1)));

  const scale = size.h ? Math.max(0.3, Math.min(size.h / (size.vw < 900 ? 640 : 600), size.w / 470, 1.08)) : 0;
  const gap = Math.min(size.w * 0.22, 200 * scale + 40);
  const slide = slides[cur] ?? slides[0]!;

  // ---------- ibadah hari ini ----------
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const items = useMemo(
    () => today.map((i) => ({ ...i, st: statusOf(i) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, tick],
  );
  const [ti, setTi] = useState<number | null>(null);
  const holdToday = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const perView = size.vw < 900 ? 1 : size.vw < 1180 ? 3 : 4;
  const firstOpen = Math.max(0, items.findIndex((x) => x.st !== 'done'));
  const tIndex = ti ?? firstOpen;
  const maxT = Math.max(0, items.length - perView);
  const moveToday = (d: number) => setTi((v) => {
    const nx = (v ?? firstOpen) + d;
    return nx > maxT ? 0 : nx < 0 ? maxT : nx;
  });
  useEffect(() => {
    const t = setInterval(() => {
      if (!holdToday.current && items.length > perView) moveToday(1);
    }, 4500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, perView, maxT]);
  const stepPx = (() => {
    const el = trackRef.current?.children[0] as HTMLElement | undefined;
    return el ? el.getBoundingClientRect().width + 10 : 0;
  })();
  const todaySwipe = useSwipe((dx) => moveToday(dx < 0 ? 1 : -1));

  // Tombol unduh sesuai perangkat tampil paling depan.
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    setPlatform(/iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : null);
  }, []);
  const stores = [
    { key: 'ios', href: links.appStore, lg: <StoreLogo d={APPLE_PATH} color="#000" />, small: t('home.downloadOn'), label: 'App Store' },
    { key: 'android', href: links.playStore, lg: <StoreLogo d={ANDROID_PATH} color="#3DDC84" />, small: t('home.getItOn'), label: 'Google Play' },
  ].sort((a, b) => Number(b.key === platform) - Number(a.key === platform));

  return (
    <>
    <div className="hm">
      {/* ① Navbar transparan */}
      <header className="hm-nav">
        <Link href="/" className="hm-brand">
          <EccLogo height={44} className="lg-svg" />
          <span>
            ECC<small>El Shaddai Creative Community</small>
          </span>
        </Link>
        <nav className="hm-links">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className={l.href === '/' ? 'on' : ''}>
              <l.Icon size={14} />
              {t(l.label as DictKey)}
            </Link>
          ))}
        </nav>
        <span className="hm-lang">
          <LangSwitch />
        </span>
        <button className="hm-burger" onClick={() => setMenu(true)} aria-label={t('nav.openMenu')}>
          <Menu size={24} />
        </button>
      </header>
      {menu ? (
        <div className="hm-menu" role="dialog" aria-label="Menu">
          <div className="hm-menu-h">
            <b>{t('nav.menu')}</b>
            <button className="hm-burger" style={{ display: 'flex' }} onClick={() => setMenu(false)} aria-label={t('nav.closeMenu')}>
              <X size={24} />
            </button>
          </div>
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMenu(false)}>
              {t(l.label as DictKey)}
            </Link>
          ))}
        </div>
      ) : null}

      {/* ② Els App */}
      <section className="hm-els">
        <div className="hm-left">
          <span className="hm-appid">
            <Image src="/els-app-icon.png" alt="" width={30} height={30} />
            {t('home.appId')}
          </span>
          <h1>
            {t('home.title1')} <em>{t('home.title2')}</em>
          </h1>
          <div className="hm-inf" aria-live="polite">
            <div className="k">{slide.k}</div>
            <h3>{slide.t}</h3>
            <p>{slide.d}</p>
            <div className="hm-feat">
              {slide.f.map((f) => (
                <span key={f}>
                  <Check size={12} strokeWidth={2.6} />
                  {f}
                </span>
              ))}
            </div>
            <div className="hm-dots">
              {slides.map((s, i) => (
                <button key={s.t} className={`hm-dot${i === cur ? ' on' : ''}`} onClick={() => go(i)} aria-label={s.t} />
              ))}
            </div>
          </div>
          <div className="hm-acc">
            {stores.map((s) => (
              <a key={s.key} className="hm-store" href={s.href} target="_blank" rel="noopener noreferrer">
                <span className="lg">{s.lg}</span>
                <span>
                  <small>{s.small}</small>
                  <b>{s.label}</b>
                </span>
              </a>
            ))}
            <a className="hm-store web" href={links.web} target="_blank" rel="noopener noreferrer">
              <span className="lg">
                <Globe size={15} />
              </span>
              <span>
                <small>{t('home.openBrowser')}</small>
                <b>{t('home.webVersion')}</b>
              </span>
            </a>
            <button type="button" className="hm-store yt" onClick={openYt}>
              <span className="lg">
                <svg width={17} height={17} viewBox="0 0 24 24" aria-hidden fill="#FF0000">
                  <path d={YOUTUBE_PATH} />
                </svg>
              </span>
              <span>
                <small>YouTube</small>
                <b>Our YouTube Channel</b>
              </span>
            </button>
          </div>
        </div>
        <div
          className="hm-stage"
          ref={stageRef}
          onMouseEnter={() => (paused.current = true)}
          onMouseLeave={() => (paused.current = false)}
          {...stageSwipe}
        >
          {APP_SCREENS.map((key, k) => {
            let o = k - cur;
            if (o > n / 2) o -= n;
            if (o < -n / 2) o += n;
            const a = Math.abs(o);
            return (
              <div
                key={k}
                className={`hm-ph${a === 1 ? ' side' : a >= 2 ? ' far' : ''}`}
                onClick={() => go(k)}
                aria-hidden={a !== 0}
                style={{
                  transform: `translateX(${o * gap}px) translateZ(${-a * 140}px) rotateY(${o * -24}deg) scale(${scale * (1 - a * 0.1)})`,
                  opacity: !scale || a > 2 ? 0 : 1,
                  zIndex: 20 - a,
                  pointerEvents: a > 2 ? 'none' : 'auto',
                }}
              >
                <div className="hm-scr">
                  <Image src={`/app-screens/${key}.webp`} alt={slides[k]?.t ?? key} fill sizes="270px" className="object-cover object-top" priority={k < 3} />
                </div>
              </div>
            );
          })}
          <button className="hm-arw l" onClick={() => go(cur - 1)} aria-label={t('common.prev')}>
            <ChevronLeft size={22} />
          </button>
          <button className="hm-arw r" onClick={() => go(cur + 1)} aria-label={t('common.next')}>
            <ChevronRight size={22} />
          </button>
        </div>
      </section>

      {/* ③ Ibadah hari ini */}
      <section
        className="hm-today"
        onMouseEnter={() => (holdToday.current = true)}
        onMouseLeave={() => (holdToday.current = false)}
        {...todaySwipe}
      >
        <div className="hm-today-h">
          <b>{t('home.today')}</b>
          <small>
            {todayLabel} · {t('home.allBranches')}
          </small>
        </div>
        <div className="hm-vp">
          <div className="hm-track" ref={trackRef} style={{ transform: `translateX(${-tIndex * stepPx}px)` }}>
            {items.length === 0 ? (
              <div className="hm-ibc empty">
                <div className="hm-ibm">
                  <b>{t('home.noToday')}</b>
                  <small>{t('home.noTodaySub')}</small>
                </div>
                <Link href="/ibadah" className="hm-st" style={{ color: '#C2410C' }}>
                  {t('home.seeSchedule')} <ChevronRight size={14} />
                </Link>
              </div>
            ) : (
              items.map((i) => (
                <Link key={`${i.id}-${i.jam}`} href="/ibadah" className={`hm-ibc ${i.st}`}>
                  <div className="hm-ibt">
                    <b>{hhmm(i.jam)}</b>
                    <small>
                      {hhmm(i.jamSelesai)} {tzLabel(i.cabang.timezone)}
                    </small>
                  </div>
                  <div className="hm-ibm">
                    <span className="hm-st">
                      {i.st === 'live' ? <i /> : null}
                      {t(`st.${i.st}` as DictKey)}
                    </span>
                    <b>{i.judul}</b>
                    <small>
                      <MapPin size={12} /> {i.isOnline ? t('common.online') : i.cabang.nama}
                    </small>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
        <span className="hm-arrs">
          <button className="hm-arr" onClick={() => moveToday(-1)} aria-label={t('common.prev')}>
            <ChevronLeft size={16} />
          </button>
          <button className="hm-arr" onClick={() => moveToday(1)} aria-label={t('common.next')}>
            <ChevronRight size={16} />
          </button>
        </span>
      </section>

      <footer className="hm-foot">
        <span>
          © {new Date().getFullYear()} Gereja Elshaddai Injil Sepenuh
          <Link href="/privacy">{t('foot.privacy')}</Link>
          <Link href="/terms">{t('foot.terms')}</Link>
          <Link href="/contact">{t('foot.contact')}</Link>
        </span>
        <span>
          {t('foot.powered')} <Image src="/logo-idea.webp" alt="IDEA" width={36} height={12} />
        </span>
      </footer>
    </div>
    {ytMounted ? <YouTubePanel open={ytOpen} onClose={closeYt} /> : null}
    </>
  );
}
