import Link from 'next/link';
import Image from 'next/image';
import { Mail, MapPin, Globe } from 'lucide-react';
import { getWebsiteContent, getMarkdown, getJson } from '@/lib/website-content';

interface ContactInfo {
  email: string;
  alamat: string;
}

const BRAND_FALLBACK =
  '**Elshaddai Creative Community** — komunitas jemaat yang bertumbuh dalam kasih Kristus, melayani sesama dengan kreativitas, dan menjadi terang di tengah dunia.';

const CONTACT_FALLBACK: ContactInfo = {
  email: 'info@eccchurch.global',
  alamat: 'Jakarta, Indonesia',
};

export async function Footer() {
  const cms = await getWebsiteContent();
  const brandText = getMarkdown(cms, 'footer.brand', BRAND_FALLBACK);
  const contact = getJson<ContactInfo>(cms, 'contact.info', CONTACT_FALLBACK);

  // Simple markdown-to-html mini converter untuk brand description (cuma bold + paragraph)
  const brandHtml = brandText
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');

  return (
    <footer className="border-t border-neutral-200 bg-neutral-50 mt-20">
      <div className="container-page py-12 grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Brand */}
        <div className="md:col-span-5">
          <div className="flex items-center gap-2.5 mb-3">
            <Image src="/logo-ecc.webp" alt="ECC" width={36} height={36} />
            <span className="font-bold text-neutral-900 text-lg">ECC</span>
          </div>
          <p
            className="text-sm text-neutral-600 max-w-md"
            dangerouslySetInnerHTML={{ __html: brandHtml }}
          />
        </div>

        {/* Explore */}
        <div className="md:col-span-3">
          <h3 className="font-semibold text-neutral-900 text-sm uppercase tracking-wider mb-3">
            Jelajah
          </h3>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li><Link href="/about" className="hover:text-brand-500">Tentang Kami</Link></li>
            <li><Link href="/ibadah" className="hover:text-brand-500">Jadwal Ibadah</Link></li>
            <li><Link href="/event" className="hover:text-brand-500">Event</Link></li>
            <li><Link href="/news" className="hover:text-brand-500">News</Link></li>
            <li><Link href="/cabang" className="hover:text-brand-500">Cabang</Link></li>
            <li><Link href="/contact" className="hover:text-brand-500">Kontak</Link></li>
          </ul>
        </div>

        {/* Legal + Contact */}
        <div className="md:col-span-4">
          <h3 className="font-semibold text-neutral-900 text-sm uppercase tracking-wider mb-3">
            Kontak &amp; Legal
          </h3>
          <ul className="space-y-2 text-sm text-neutral-600">
            <li className="flex items-start gap-2">
              <Mail className="w-4 h-4 mt-0.5 shrink-0" />
              <a href={`mailto:${contact.email}`} className="hover:text-brand-500 break-all">
                {contact.email}
              </a>
            </li>
            <li className="flex items-start gap-2">
              <Globe className="w-4 h-4 mt-0.5 shrink-0" />
              <span>eccchurch.global</span>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{contact.alamat}</span>
            </li>
            <li className="pt-2 mt-2 border-t border-neutral-200 space-x-3">
              <Link href="/privacy" className="hover:text-brand-500">Privacy Policy</Link>
              <span className="text-neutral-300">·</span>
              <Link href="/terms" className="hover:text-brand-500">Terms &amp; Conditions</Link>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t border-neutral-200 bg-white">
        <div className="container-page py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            © {new Date().getFullYear()} Elshaddai Creative Community. All rights reserved.
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
