import Link from 'next/link';
import Image from 'next/image';
import { Mail, MapPin, Globe } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 mt-20">
      <div className="container-page py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5 mb-3">
            <Image src="/logo-ecc.webp" alt="ECC" width={36} height={36} />
            <span className="font-bold text-neutral-900 text-lg">ECC Church</span>
          </div>
          <p className="text-sm text-neutral-600 max-w-md">
            Engaging Christ Community — komunitas jemaat yang bertumbuh dalam kasih Kristus,
            melayani sesama, dan menjadi terang di tengah dunia.
          </p>
        </div>

        {/* Nav */}
        <div>
          <h3 className="font-semibold text-neutral-900 text-sm uppercase tracking-wider mb-3">
            Navigasi
          </h3>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li><Link href="/about" className="hover:text-brand-500">Tentang Kami</Link></li>
            <li><Link href="/cabang" className="hover:text-brand-500">Cabang Gereja</Link></li>
            <li><Link href="/contact" className="hover:text-brand-500">Kontak</Link></li>
            <li>
              <a
                href="https://portal.eccchurch.global"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-500"
              >
                Portal Admin
              </a>
            </li>
          </ul>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-semibold text-neutral-900 text-sm uppercase tracking-wider mb-3">
            Kontak
          </h3>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li className="flex items-start gap-2">
              <Mail className="w-4 h-4 mt-0.5 shrink-0" />
              <a href="mailto:info@eccchurch.global" className="hover:text-brand-500">
                info@eccchurch.global
              </a>
            </li>
            <li className="flex items-start gap-2">
              <Globe className="w-4 h-4 mt-0.5 shrink-0" />
              <span>eccchurch.global</span>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
              <span>Jakarta, Indonesia</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t border-neutral-200 bg-white">
        <div className="container-page py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            © {new Date().getFullYear()} ECC Church. All rights reserved.
          </p>
          <div className="flex items-center gap-2 opacity-70">
            <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Powered by</span>
            <Image
              src="/logo-idea.webp"
              alt="IDEA"
              width={40}
              height={16}
              style={{ height: '14px', width: 'auto' }}
            />
          </div>
        </div>
      </div>
    </footer>
  );
}
