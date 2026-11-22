'use client';

/**
 * Kuota seat ibadah / event dalam progress bar (kartu, panel, halaman detail).
 * quota null = tanpa batas → hanya jumlah pendaftar.
 *
 * 2026-11: sebelum check-in dibuka (`opensAt`, dari server) tampil jumlah
 * RESERVASI (ibadah) / TERDAFTAR (event); sesudahnya jumlah HADIR (`attending`).
 * Tanpa `attending`/`opensAt` (data lama) → tetap jumlah reservasi/terdaftar.
 */
import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { useLang } from './lang-provider';

/** Mode tampilan berdasarkan jam sekarang (diperbarui tiap 30 detik). */
export function useAttendMode(opensAt: string | null | undefined, attending: number | null | undefined): boolean {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const opens = opensAt ? Date.parse(opensAt) : NaN;
  // Render server (now null) → mode reservasi; diperbarui setelah mount.
  return attending != null && Number.isFinite(opens) && now != null && now >= opens;
}

export function SeatBar({
  quota,
  filled,
  size = 'sm',
  tone = 'light',
  showLeft = true,
  kind = 'event',
  attending,
  opensAt,
}: {
  quota: number | null | undefined;
  /** Reservasi aktif (ibadah) / pendaftar (event). */
  filled: number | null | undefined;
  size?: 'sm' | 'md';
  tone?: 'light' | 'dark';
  /** Tampilkan "xx tersisa" di kanan (false = sembunyikan). */
  showLeft?: boolean;
  kind?: 'ibadah' | 'event';
  /** Jumlah hadir (null = tidak dicatat). */
  attending?: number | null;
  /** Saat check-in dibuka (ISO, dari server). */
  opensAt?: string | null;
}) {
  const { L } = useLang();
  const attendMode = useAttendMode(opensAt, attending);
  const n = Math.max(0, (attendMode ? attending : filled) ?? 0);
  const unit = attendMode
    ? L('hadir', 'attending')
    : kind === 'ibadah'
      ? L('reservasi', 'reserved')
      : L('terdaftar', 'registered');
  const muted = tone === 'dark' ? 'text-white/80' : 'text-neutral-500';
  const strong = tone === 'dark' ? 'text-white' : 'text-neutral-800';
  if (quota == null || quota <= 0) {
    return (
      <p className={`flex items-center gap-1.5 ${size === 'md' ? 'text-sm' : 'text-[12.5px]'} ${muted}`}>
        <Users className="w-3.5 h-3.5 shrink-0" />
        {n > 0 ? `${n} ${unit} · ${L('kuota tidak dibatasi', 'unlimited seats')}` : L('Kuota tidak dibatasi', 'Unlimited seats')}
      </p>
    );
  }
  const pct = Math.min(100, Math.round((n / quota) * 100));
  const left = Math.max(0, quota - n);
  // Penuh / hampir penuh / sisa kursi hanya relevan untuk reservasi & pendaftaran.
  const full = !attendMode && left === 0;
  const almost = !attendMode && !full && pct >= 85;
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
          {n}/{quota} {unit}
        </span>
        {badge ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${badge.cls}`}>{badge.text}</span>
        ) : showLeft && !attendMode ? (
          <span className={muted}>{L(`${left} tersisa`, `${left} left`)}</span>
        ) : null}
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

/** Teks ringkas untuk kartu kecil (Beranda): "40/155 reservasi" → "12/155 hadir". */
export function SeatText({
  kind = 'ibadah',
  quota,
  filled,
  attending,
  opensAt,
}: {
  kind?: 'ibadah' | 'event';
  quota: number | null | undefined;
  filled: number | null | undefined;
  attending?: number | null;
  opensAt?: string | null;
}) {
  const { L } = useLang();
  const attendMode = useAttendMode(opensAt, attending);
  if (!quota || quota <= 0) return null;
  const n = Math.max(0, (attendMode ? attending : filled) ?? 0);
  const unit = attendMode ? L('hadir', 'attending') : kind === 'ibadah' ? L('reservasi', 'reserved') : L('terdaftar', 'registered');
  return (
    <>
      <Users size={12} /> {n}/{quota} {unit}
    </>
  );
}
