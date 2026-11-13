/** Pernyataan Local Market (2.4.7) — ikut bahasa situs (ID/EN). */
import { Info } from 'lucide-react';
import { getT } from '@/lib/i18n-server';

export function MarketDisclaimer({ className = '' }: { className?: string }) {
  const { t } = getT();
  return (
    <div className={`flex items-start gap-2 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs text-neutral-600 ${className}`}>
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-500" />
      <span>{t('mk.disclaimer')}</span>
    </div>
  );
}
