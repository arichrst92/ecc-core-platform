'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import type { DictKey } from '@/lib/i18n';
import { LangSwitch, useLang } from './lang-provider';
import {
  Menu,
  X,
  House,
  HousePlus,
  Church,
  CalendarHeart,
  Newspaper,
  BookHeart,
  HandHeart,
  Store,
  Info,
  Phone,
  type LucideIcon
} from 'lucide-react';
import { EccLogo } from '@/components/ecc-logo';

interface NavLink {
  href: string;
  label: DictKey;
  Icon: LucideIcon;
}

// Urutan: Beranda → Ibadah → Homecell → Event → News → Renungan → Ministry →
// Local Market → Cabang → Tentang Kami → Kontak.
export const NAV_LINKS: NavLink[] = [
  // Ikon: rumah (beranda), gereja (ibadah), rumah+ (persekutuan di rumah), kalender (event),
  // koran (berita), buku (renungan), tangan-hati (pelayanan), toko (usaha jemaat), info, telepon.
  { href: '/', label: 'nav.home', Icon: House },
  { href: '/ibadah', label: 'nav.ibadah', Icon: Church },
  { href: '/homecell', label: 'nav.homecell', Icon: HousePlus },
  { href: '/event', label: 'nav.event', Icon: CalendarHeart },
  { href: '/news', label: 'nav.news', Icon: Newspaper },
  { href: '/renungan', label: 'nav.renungan', Icon: BookHeart },
  { href: '/ministry', label: 'nav.ministry', Icon: HandHeart },
  { href: '/local-market', label: 'nav.market', Icon: Store },
  { href: '/about', label: 'nav.about', Icon: Info },
  { href: '/contact', label: 'nav.contact', Icon: Phone },
];

/**
 * Navbar situs — persona beranda: latar oranye gradient brand (sama dengan
 * Els App), teks putih, menu aktif berupa pil putih. Halaman dengan hero
 * gradient (PageHero) menyambung mulus di bawahnya.
 */
export function Navbar() {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  const pathname = usePathname() ?? '/';
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'));

  return (
    <header className="relative shrink-0 z-40 grad-fixed text-white">
      <nav className="container-page flex items-center gap-4 h-16">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <EccLogo height={42} className="text-white shrink-0" />
          <span className="leading-tight">
            <span className="block font-extrabold text-lg tracking-tight">ECC</span>
            <span className="block text-[10px] sm:text-[10.5px] text-white/85 whitespace-nowrap">El Shaddai Creative Community</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden xl:flex items-center gap-0.5 ml-auto">
          {NAV_LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`inline-flex items-center gap-1 px-2 2xl:px-2.5 py-1.5 rounded-full text-[12.5px] 2xl:text-[13px] font-medium whitespace-nowrap transition ${
                isActive(href) ? 'bg-white text-brand-700 font-bold' : 'text-white/90 hover:bg-white/15 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {t(label)}
            </Link>
          ))}
        </div>

        <span className="ml-auto xl:ml-2">
          <LangSwitch />
        </span>


        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="xl:hidden p-2 -mr-2 text-white"
          aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile menu drawer */}
      {open && (
        <div className="xl:hidden absolute inset-x-0 top-full grad-fixed border-t border-white/15 shadow-xl">
          <div className="container-page py-3 flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`py-2.5 px-3 rounded-xl font-semibold inline-flex items-center gap-2.5 ${
                  isActive(href) ? 'bg-white text-brand-700' : 'text-white hover:bg-white/15'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(label)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
