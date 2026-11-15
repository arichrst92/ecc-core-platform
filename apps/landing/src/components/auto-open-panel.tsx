'use client';

/**
 * Buka side panel otomatis saat halaman dimuat — dipakai link bagikan
 * (mis. eccchurch.global/event/:slug dari Els App): tampil halaman daftar
 * dengan panel detail langsung terbuka, bukan halaman detail terpisah.
 */
import { useEffect, useRef } from 'react';
import { usePanel, type PanelType } from '@/components/panel-host';

export function AutoOpenPanel({ type, id, title }: { type: PanelType; id: string; title?: string }) {
  const open = usePanel();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    open({ type, id, title });
  }, [open, type, id, title]);
  return null;
}
