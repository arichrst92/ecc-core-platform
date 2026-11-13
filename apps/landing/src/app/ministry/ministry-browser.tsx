'use client';

/**
 * Ministry — tampilan direktori: daftar pelayanan (kiri) + detail terpilih
 * (kanan). Di HP: daftar saja, ketuk → panel geser dari kanan.
 */
import { useMemo, useState } from 'react';
import { Briefcase, ChevronRight, ExternalLink, HandHeart, Search, Users } from 'lucide-react';
import { PelayananIcon, PELAYANAN_ICON_MAP, pelayananWarna } from '@/components/pelayanan-icon';
import { SlidePanel } from '@/components/slide-panel';
import { useLang } from '@/components/lang-provider';

export interface MinistryItem {
  id: string;
  nama: string;
  deskripsi: string | null;
  ikon?: string | null;
  warna?: string | null;
  roleCount: number;
  memberCount: number;
}

const ELS = 'https://elsapp.eccchurch.global';

export function MinistryBrowser({ list }: { list: MinistryItem[] }) {
  const { t, lang } = useLang();
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState(list[0]?.id ?? null);
  const [mobile, setMobile] = useState<MinistryItem | null>(null);
  const [open, setOpen] = useState(false);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? list.filter((m) => m.nama.toLowerCase().includes(s) || (m.deskripsi ?? '').toLowerCase().includes(s)) : list;
  }, [q, list]);
  const sel = list.find((m) => m.id === selId) ?? null;
  const num = (n: number) => n.toLocaleString(lang === 'en' ? 'en-GB' : 'id-ID');

  const pick = (m: MinistryItem) => {
    setSelId(m.id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setMobile(m);
      requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    }
  };
  const closeMobile = () => {
    setOpen(false);
    setTimeout(() => setMobile(null), 300);
  };

  return (
    <div className="h-full min-h-0 grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      {/* Daftar */}
      <section className="min-h-0 flex flex-col bg-white rounded-3xl border border-orange-100 shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)] overflow-hidden">
        <div className="shrink-0 p-4 border-b border-orange-50">
          <label className="flex items-center gap-2 rounded-2xl bg-[#FFFBF7] border border-orange-100 px-3.5 py-2.5 focus-within:border-brand-300">
            <Search className="w-4 h-4 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('ministry.search')}
              className="flex-1 bg-transparent outline-none text-sm"
            />
            <span className="text-xs text-neutral-400 tabular-nums">
              {shown.length} {t('ministry.count')}
            </span>
          </label>
        </div>
        <ul className="flex-1 min-h-0 overflow-y-auto p-2">
          {shown.map((m) => {
            const on = m.id === selId;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => pick(m)}
                  className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                    on ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-[#FFFBF7]'
                  }`}
                >
                  <PelayananIcon ikon={m.ikon} warna={m.warna} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className={`block font-bold truncate ${on ? 'text-brand-800' : 'text-neutral-900'}`}>{m.nama}</span>
                    <span className="block text-xs text-neutral-500">
                      {num(m.memberCount)} {t('ministry.members')}
                    </span>
                  </span>
                  <ChevronRight className={`w-4 h-4 shrink-0 ${on ? 'text-brand-600' : 'text-neutral-300'}`} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Detail (desktop) */}
      <section className="hidden lg:flex min-h-0">{sel ? <Detail m={sel} /> : null}</section>

      {/* Detail (HP) — panel geser */}
      {mobile ? (
        <SlidePanel open={open} onClose={closeMobile} Icon={HandHeart} badge={t('nav.ministry')} title={mobile.nama}>
          <Detail m={mobile} compact />
        </SlidePanel>
      ) : null}
    </div>
  );

  function Detail({ m, compact }: { m: MinistryItem; compact?: boolean }) {
    const w = pelayananWarna(m.warna);
    const Icon = (m.ikon && PELAYANAN_ICON_MAP[m.ikon]) || HandHeart;
    return (
      <article className={`relative w-full min-h-0 flex flex-col overflow-hidden rounded-3xl bg-white border border-orange-100 ${compact ? '' : 'shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)]'}`}>
        {!compact ? (
          <div className="relative shrink-0 px-8 pt-8 pb-7 overflow-hidden" style={{ background: `linear-gradient(135deg, ${w.bg} 0%, #ffffff 85%)` }}>
            <Icon aria-hidden className="absolute -right-6 -top-6 w-44 h-44 opacity-[0.08]" style={{ color: w.fg }} />
            <PelayananIcon ikon={m.ikon} warna={m.warna} size={64} />
            <h2 className="mt-4 text-3xl font-extrabold text-neutral-900 leading-tight">{m.nama}</h2>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-neutral-200 px-3 py-1 text-neutral-700">
                <Users className="w-4 h-4" style={{ color: w.fg }} />
                <b className="tabular-nums">{num(m.memberCount)}</b> {t('ministry.members')}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-neutral-200 px-3 py-1 text-neutral-700">
                <Briefcase className="w-4 h-4" style={{ color: w.fg }} />
                <b className="tabular-nums">{m.roleCount}</b> {t('ministry.roles')}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 text-sm p-5 pb-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-brand-800">
              <Users className="w-4 h-4" /> {num(m.memberCount)} {t('ministry.members')}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-brand-800">
              <Briefcase className="w-4 h-4" /> {m.roleCount} {t('ministry.roles')}
            </span>
          </div>
        )}
        <div className={`flex-1 min-h-0 overflow-y-auto ${compact ? 'p-5' : 'px-8 py-6'}`}>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{t('mk.about')}</div>
          <p className="mt-2 text-[15.5px] leading-[1.8] text-neutral-700 whitespace-pre-line">{m.deskripsi || t('ministry.noDesc')}</p>
        </div>
        <div className={`shrink-0 border-t border-orange-50 ${compact ? 'p-5' : 'px-8 py-5'} flex flex-col sm:flex-row sm:items-center gap-3`}>
          <p className="flex-1 text-sm text-neutral-500">{t('ministry.joinSub')}</p>
          <a href={ELS} target="_blank" rel="noopener noreferrer" className="btn-primary justify-center whitespace-nowrap">
            {t('ministry.join')}
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </article>
    );
  }
}
