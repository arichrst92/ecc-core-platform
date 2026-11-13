'use client';

/**
 * Panel detail yang meluncur dari kanan ke kiri (persona ECC):
 * kepala oranye gradient (badge, judul, chip) · isi menggulung · kaki tombol.
 */
import { useEffect } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { useLang } from './lang-provider';

export function SlidePanel({
  open,
  onClose,
  Icon,
  badge,
  title,
  chips,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  Icon?: LucideIcon;
  badge?: string;
  title: string;
  chips?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useLang();
  useEffect(() => {
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={onClose} className={`absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <aside
        className={`absolute right-0 top-0 h-full w-full sm:w-[480px] bg-[#FFFBF7] shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="bg-brand-grad text-white px-6 pt-5 pb-5 shrink-0 relative">
          <button type="button" onClick={onClose} aria-label={t('ib.close')} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
          {badge ? (
            <div className="page-hero-badge !mb-2">
              {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
              {badge}
            </div>
          ) : null}
          <h2 className="text-2xl font-extrabold leading-tight pr-10 line-clamp-3">{title}</h2>
          {chips ? <div className="mt-3 flex flex-wrap gap-1.5 text-xs">{chips}</div> : null}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">{children}</div>
        {footer ? <div className="shrink-0 p-5 pt-3 border-t border-orange-100 bg-white space-y-2">{footer}</div> : null}
      </aside>
    </div>
  );
}

export function PanelChip({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${strong ? 'bg-white text-brand-700 font-bold' : 'bg-white/20 border border-white/25 font-semibold'}`}>
      {children}
    </span>
  );
}

export function PanelSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl border border-orange-100 p-5">
      {title ? <h3 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-2">{title}</h3> : null}
      {children}
    </section>
  );
}

/** Baris tombol aksi (ikon gradient + judul + keterangan). */
export function PanelAction({ href, Icon, title, sub, tone = 'brand' }: { href: string; Icon: LucideIcon; title: string; sub?: string; tone?: 'brand' | 'wa' }) {
  const ext = !href.startsWith('mailto:') && !href.startsWith('/');
  return (
    <a
      href={href}
      target={ext ? '_blank' : undefined}
      rel={ext ? 'noopener noreferrer' : undefined}
      className="flex items-center gap-3 rounded-2xl bg-white border border-orange-100 px-4 py-3 hover:border-brand-300 hover:bg-brand-50 transition"
    >
      <span className={`w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 ${tone === 'wa' ? 'bg-emerald-600' : 'bg-brand-grad'}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-neutral-900">{title}</span>
        {sub ? <span className="block text-xs text-neutral-500 truncate">{sub}</span> : null}
      </span>
    </a>
  );
}
