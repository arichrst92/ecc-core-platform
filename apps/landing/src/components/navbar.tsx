'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { href: '/', label: 'Beranda' },
  { href: '/about', label: 'Tentang Kami' },
  { href: '/ibadah', label: 'Ibadah' },
  { href: '/event', label: 'Event' },
  { href: '/news', label: 'News' },
  { href: '/cabang', label: 'Cabang' },
  { href: '/contact', label: 'Kontak' },
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
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-neutral-600 hover:text-brand-500 transition"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="md:hidden p-2 -mr-2 text-neutral-600 hover:text-neutral-900"
          aria-label={open ? 'Tutup menu' : 'Buka menu'}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile menu drawer */}
      {open && (
        <div className="md:hidden border-t border-neutral-100 bg-white">
          <div className="container-page py-4 flex flex-col gap-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-2 px-3 rounded text-neutral-700 hover:bg-neutral-50 font-medium"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
