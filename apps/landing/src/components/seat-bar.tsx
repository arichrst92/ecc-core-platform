'use client';

/**
 * Kuota seat event dalam progress bar (kartu, panel, halaman detail).
 * quota null = tanpa batas → hanya jumlah pendaftar.
 */
import { Users } from 'lucide-react';
import { useLang } from './lang-provider';

export function SeatBar({
  quota,
  filled,
  size = 'sm',
  tone = 'light',
}: {
  quota: number | null | undefined;
  filled: number | null | undefined;
  size?: 'sm' | 'md';
  tone?: 'light' | 'dark';
}) {
  const { L } = useLang();
  const n = Math.max(0, filled ?? 0);
  const muted = tone === 'dark' ? 'text-white/80' : 'text-neutral-500';
  const strong = tone === 'dark' ? 'text-white' : 'text-neutral-800';
  if (quota == null || quota <= 0) {
    return (
      <p className={`flex items-center gap-1.5 ${size === 'md' ? 'text-sm' : 'text-[12.5px]'} ${muted}`}>
        <Users className="w-3.5 h-3.5 shrink-0" />
        {n > 0 ? L(`${n} terdaftar · kuota tidak dibatasi`, `${n} registered · unlimited seats`) : L('Kuota tidak dibatasi', 'Unlimited seats')}
      </p>
    );
  }
  const pct = Math.min(100, Math.round((n / quota) * 100));
  const left = Math.max(0, quota - n);
  const full = left === 0;
  const almost = !full && pct >= 85;
  const bar = full ? 'bg-red-500' : almost ? 'bg-amber-500' : 'bg-brand-grad';
  const badge = full
    ? { text: L('Penuh', 'Full'), cls: 'bg-red-100 text-red-700' }
    : almost
      ? { text: L('Hampir penuh', 'Almost full'), cls: 'bg-amber-100 text-amber-800' }
      : null;
  return (
    <div className="w-full">
      <div className={`flex items-center justify-between gap-2 ${size === 'md' ? 'text-sm' : 'text-[12px]'}`}>
        <span className={`flex items-center gap-1.5 font-semibold ${strong}`}>
          <Users className="w-3.5 h-3.5 shrink-0" />
          {n}/{quota} {L('seat terisi', 'seats taken')}
        </span>
        {badge ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${badge.cls}`}>{badge.text}</span>
        ) : (
          <span className={muted}>{L(`${left} tersisa`, `${left} left`)}</span>
        )}
      </div>
      <div
        className={`mt-1.5 w-full overflow-hidden rounded-full ${tone === 'dark' ? 'bg-white/25' : 'bg-orange-100'} ${size === 'md' ? 'h-2.5' : 'h-2'}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={quota}
        aria-valuenow={n}
      >
        <div className={`h-full rounded-full ${bar} transition-[width] duration-700`} style={{ width: `${Math.max(pct, n > 0 ? 3 : 0)}%` }} />
      </div>
    </div>
  );
}
