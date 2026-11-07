/** Pernyataan Local Market (2.4.7). */
import { Info } from 'lucide-react';

export const MARKET_DISCLAIMER =
  'ECC hanya memfasilitasi bisnis jemaat dan tidak mengambil keuntungan dalam bentuk apa pun.';

export function MarketDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl bg-neutral-100 px-3 py-2.5 text-xs text-neutral-600 ${className}`}>
      <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-neutral-500" />
      <span>{MARKET_DISCLAIMER}</span>
    </div>
  );
}
