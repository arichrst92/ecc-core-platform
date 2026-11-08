'use client';

/**
 * Tombol Bagikan (2.4.7) — Web Share API di HP; di desktop salin link + notifikasi singkat.
 */
import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';

export function ShareButton({ title, text, className = '' }: { title: string; text?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href.split('?')[0]!;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* dibatalkan pengguna */
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-300 hover:border-brand-300 hover:bg-brand-50 text-sm font-semibold text-neutral-700 transition ${className}`}
    >
      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
      {copied ? 'Link disalin' : 'Bagikan'}
    </button>
  );
}
