'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyRekeningButton({ nomor }: { nomor: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      // Strip spasi biar copy hanya digit
      await navigator.clipboard.writeText(nomor.replace(/\s+/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: selection-based copy (older browsers / non-secure ctx)
      const ta = document.createElement('textarea');
      ta.value = nomor.replace(/\s+/g, '');
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
        copied
          ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
          : 'bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100'
      }`}
      aria-label="Salin nomor rekening"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" /> Tersalin
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5" /> Salin
        </>
      )}
    </button>
  );
}
