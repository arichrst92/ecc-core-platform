'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import {
  Menu,
  X,
  Home,
  Church,
  Megaphone,
  Newspaper,
  BookOpen,
  HandHeart,
  Store,
  MapPin,
  Info,
  Mail,
  type LucideIcon,
} from 'lucide-react';

interface NavLink {
  href: string;
  label: string;
  Icon: LucideIcon;
}

// Urutan: Beranda → Ibadah → Event → News → Renungan → Ministry →
// Local Market → Cabang → Tentang Kami → Kontak.
const NAV_LINKS: NavLink[] = [
  { href: '/', label: 'Beranda', Icon: Home },
  { href: '/ibadah', label: 'Ibadah', Icon: Church },
  { href: '/event', label: 'Event', Icon: Megaphone },
  { href: '/news', label: 'News', Icon: Newspaper },
  { href: '/renungan', label: 'Renungan', Icon: BookOpen },
  { href: '/ministry', label: 'Ministry', Icon: HandHeart },
  { href: '/local-market', label: 'Local Market', Icon: Store },
  { href: '/cabang', label: 'Cabang', Icon: MapPin },
  { href: '/about', label: 'Tentang Kami', Icon: Info },
  { href: '/contact', label: 'Kontak', Icon: Mail },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-neutral-100">
      <nav className="container-page flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/logo-ecc.webp" alt="ECC" width={36} height={36} priority />
          <span className="font-bold text-neutral-900 text-lg tracking-tight">ECC</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-4">
          {NAV_LINKS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-brand-500 transition"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="lg:hidden p-2 -mr-2 text-neutral-600 hover:text-neutral-900"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile menu drawer */}
      {open && (
        <div className="lg:hidden border-t border-neutral-100 bg-white">
          <div className="container-page py-4 flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="py-2 px-3 rounded text-neutral-700 hover:bg-neutral-50 font-medium inline-flex items-center gap-2.5"
              >
                <Icon className="w-4 h-4 text-brand-500" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
