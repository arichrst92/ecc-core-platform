'use client';

/**
 * "Aturan event ini" — bagian buka-tutup di tab Peserta (detail event Portal).
 * Teks & jam dari server (GET /admin/event/:id/aturan → lib/event-rules-text.ts)
 * supaya selalu sama dengan aturan yang dialami jemaat di app.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Ban,
  CalendarCheck,
  ChevronDown,
  ClipboardList,
  Layers,
  Loader2,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Timer,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

type Rule = { key: string; judul: string; isi: string; tone: 'info' | 'ok' | 'warn' | 'off' };

const ICON: Record<string, LucideIcon> = {
  daftar: ClipboardList,
  kuota: Users,
  biaya: Wallet,
  hadir: CalendarCheck,
  self: Smartphone,
  scan: ScanLine,
  walkin: UserPlus,
  auto: Timer,
  batal: Ban,
  sesi: Layers,
  admin: ShieldCheck,
};
const TONE: Record<Rule['tone'], string> = {
  info: 'from-brand-500 to-brand-700',
  ok: 'from-emerald-500 to-emerald-700',
  warn: 'from-amber-500 to-amber-600',
  off: 'from-neutral-400 to-neutral-500',
};

export function EventRulesPanel({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['event', eventId, 'aturan'],
    queryFn: async () => (await apiClient.get<{ data: Rule[] }>(`/admin/event/${eventId}/aturan`)).data.data,
    enabled: open,
    staleTime: 30_000,
  });
  return (
    <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 sm:px-6 py-3 text-left hover:bg-neutral-50"
      >
        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shrink-0">
          <ClipboardList className="w-4 h-4" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-neutral-900">Aturan event ini</span>
          <span className="block text-xs text-neutral-500">
            Kapan bisa daftar, kapan check-in dibuka & ditutup, batal otomatis, dan lainnya — dalam bahasa sederhana
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="border-t border-neutral-100 px-4 sm:px-6 py-4">
          {q.isPending ? (
            <div className="py-6 flex justify-center text-neutral-400">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : q.isError ? (
            <p className="text-sm text-red-600">Gagal memuat aturan event.</p>
          ) : (
            <>
              <ul className="grid gap-3 md:grid-cols-2">
                {(q.data ?? []).map((r) => {
                  const Icon = ICON[r.key] ?? ClipboardList;
                  return (
                    <li key={r.key} className="flex gap-3 min-w-0">
                      <span className={`w-7 h-7 rounded-lg bg-gradient-to-br ${TONE[r.tone]} text-white flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-neutral-900">{r.judul}</div>
                        <p className="text-xs text-neutral-600 leading-5">{r.isi}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11px] text-neutral-400 mt-3">Jam mengikuti zona waktu cabang event. Ubah pengaturan lewat tombol Edit event.</p>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
