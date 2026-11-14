import Link from 'next/link';
import Image from 'next/image';
import { getT } from '@/lib/i18n-server';

/** Footer ramping (satu baris) supaya halaman muat satu layar. */
export async function Footer() {
  const { t } = getT();
  return (
    <footer className="shrink-0 page-fabric text-neutral-500 text-xs">
      <div className="container-page py-2.5 flex flex-col sm:flex-row items-center justify-between gap-1.5 sm:gap-3">
        <p className="text-center sm:text-left">
          © {new Date().getFullYear()} Gereja Elshaddai Injil Sepenuh
          <span className="mx-2 text-neutral-300">·</span>
          <Link href="/privacy" className="hover:text-brand-600">{t('foot.privacy')}</Link>
          <span className="mx-2 text-neutral-300">·</span>
          <Link href="/terms" className="hover:text-brand-600">{t('foot.terms')}</Link>
          <span className="mx-2 text-neutral-300">·</span>
          <Link href="/contact" className="hover:text-brand-600">{t('foot.contact')}</Link>
        </p>
        <span className="hidden sm:inline-flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider">{t('foot.powered')}</span>
          <Image src="/logo-idea.webp" alt="IDEA" width={40} height={16} style={{ height: '13px', width: 'auto' }} />
        </span>
      </div>
    </footer>
  );
}
