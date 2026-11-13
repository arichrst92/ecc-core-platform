/**
 * Kerangka halaman detail satu layar (persona ECC):
 *   pita oranye gradient — kembali, badge, judul, info singkat, aksi
 *   isi — kiri: gambar utuh (+ kartu info), kanan: kartu konten yang menggulung.
 * Tanpa gambar/info: satu kartu konten lebar di tengah.
 */
import Link from 'next/link';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import { FitImage } from './fit-image';

export function DetailShell({
  backHref,
  backLabel,
  Icon,
  badge,
  title,
  meta,
  actions,
  image,
  media,
  aside,
  children,
}: {
  backHref: string;
  backLabel: string;
  Icon?: LucideIcon;
  badge?: string;
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Gambar utama — bingkai 3:2 (ratio bisa diganti, mis. '16/9'). */
  image?: { src: string; alt: string; ratio?: string } | null;
  /** Ganti gambar tunggal dengan media lain (mis. galeri foto). */
  media?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const split = !!(image || media || aside);
  return (
    <div className="screen-page">
      <section className="screen-hero !pb-16">
        <div className="container-page">
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white/85 hover:text-white mb-2">
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </Link>
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              {badge ? (
                <div className="page-hero-badge !mb-2">
                  {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
                  {badge}
                </div>
              ) : null}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold leading-tight line-clamp-2">{title}</h1>
              {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-white/90">{meta}</div> : null}
            </div>
            {actions ? <div className="shrink-0 self-start">{actions}</div> : null}
          </div>
        </div>
      </section>

      <div
        className={`screen-body container-page overflow-y-auto lg:overflow-visible ${
          split ? 'grid gap-4 grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]' : 'flex justify-center'
        }`}
      >
        {split ? (
          <div className="flex flex-col gap-4 min-h-0 lg:h-full">
            {media ? (
              <div className="s-card shrink-0">{media}</div>
            ) : image ? (
              <div className="s-card shrink-0">
                <FitImage
                  src={image.src}
                  alt={image.alt}
                  priority
                  sizes="(max-width: 1024px) 100vw, 600px"
                  className="w-full max-h-[60vh]"
                  style={{ aspectRatio: image.ratio ?? '3 / 2' }}
                />
              </div>
            ) : null}
            {aside ? <div className="s-card shrink-0">{aside}</div> : null}
          </div>
        ) : null}
        <div className={`s-card min-h-[320px] lg:min-h-0 lg:h-full ${split ? '' : 'w-full max-w-4xl'}`}>
          <div className="s-card-body s-scroll px-5 py-6 sm:px-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Chip kecil di pita judul (cabang, kategori, dll.). */
export function HeroChip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs ${
        strong ? 'bg-white text-brand-700 font-bold' : 'bg-white/20 border border-white/25 font-semibold'
      }`}
    >
      {children}
    </span>
  );
}
