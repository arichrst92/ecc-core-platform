'use client';

/** Kirim 1 hit kunjungan saat halaman Local Market dibuka (2.4.7). */
import { useEffect } from 'react';

export function MarketViewPing({ id, itemId }: { id: string; itemId?: string }) {
  useEffect(() => {
    fetch('/api/market-view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, itemId }),
      keepalive: true,
    }).catch(() => undefined);
  }, [id, itemId]);
  return null;
}
