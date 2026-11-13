/**
 * Kerangka halaman satu layar: pita judul oranye gradient (menyambung dari
 * navbar) + area isi yang mengisi sisa tinggi layar (biasanya carousel).
 */
import Link from 'next/link';
import { Sparkles, type LucideIcon } from 'lucide-react';
import { getT } from '@/lib/i18n-server';

export function ScreenPage({
  Icon,
  badge,
  title,
  subtitle,
  aside,
  children,
}: {
  Icon?: LucideIcon;
  badge?: string;
  title: string;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="screen-page">
      <section className="screen-hero">
        <div className="container-page flex flex-col md:flex-row md:items-end gap-3 md:gap-6">
          <div className="flex-1 min-w-0">
            {badge ? (
              <div className="page-hero-badge !mb-2">
                {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
                {badge}
              </div>
            ) : null}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm sm:text-base text-white/90 max-w-2xl">{subtitle}</p> : null}
          </div>
          {aside ? <div className="shrink-0">{aside}</div> : null}
        </div>
      </section>
      <div className="screen-body container-page">{children}</div>
    </div>
  );
}

/**
 * Template data kosong — persona ECC: ikon dalam lingkaran oranye gradient,
 * kilau kecil di sekelilingnya, judul "Untuk saat ini belum ada …", ajakan
 * stay tune, dan tombol ke Beranda / Els App.
 */
export function EmptyState({ Icon, children }: { Icon?: LucideIcon; children: React.ReactNode }) {
  const { t } = getT();
  const I = Icon ?? Sparkles;
  return (
    <div className="h-full min-h-[260px] flex items-center justify-center">
      <div className="relative w-full max-w-xl bg-white rounded-[2rem] border border-orange-100 px-6 py-10 sm:px-10 text-center shadow-[0_24px_48px_-32px_rgba(124,45,18,.55)] overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 w-48 h-48 rounded-full bg-brand-100/60" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-12 w-40 h-40 rounded-full bg-brand-50" />
        <div className="relative mx-auto w-24 h-24">
          <span aria-hidden className="absolute inset-0 rounded-full bg-brand-200/50 animate-ping [animation-duration:2.4s]" />
          <span className="relative w-24 h-24 rounded-full bg-brand-grad text-white flex items-center justify-center shadow-[0_16px_32px_-12px_rgba(234,88,12,.8)]">
            <I className="w-11 h-11" strokeWidth={1.8} />
          </span>
          <Sparkles aria-hidden className="absolute -top-2 -left-5 w-5 h-5 text-brand-400" />
          <Sparkles aria-hidden className="absolute -bottom-1 -right-6 w-4 h-4 text-amber-400" />
        </div>
        <h2 className="relative mt-6 text-xl sm:text-2xl font-extrabold text-neutral-900">{children}</h2>
        <p className="relative mt-2 text-sm sm:text-base text-neutral-600 max-w-md mx-auto">{t('common.stayTune')}</p>
        <div className="relative mt-6 flex flex-wrap items-center justify-center gap-2.5">
          <a href="https://elsapp.eccchurch.global" target="_blank" rel="noopener noreferrer" className="btn-primary text-sm">
            {t('common.openApp')}
          </a>
          <Link href="/" className="btn-secondary text-sm">
            {t('common.goHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
