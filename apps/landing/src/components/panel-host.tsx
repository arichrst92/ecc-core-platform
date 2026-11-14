'use client';

/**
 * Panel detail geser (kanan → kiri) untuk kartu Event, News, Renungan, dan
 * Local Market. Kartu memakai <PanelTrigger>; data lengkap dimuat lewat
 * /api/panel/{type}/{id}.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Calendar,
  Church,
  Clock,
  CreditCard,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Navigation,
  Newspaper,
  Smartphone,
  Store,
  Tag,
} from 'lucide-react';
import { Markdown } from './markdown';
import { SeatBar } from './seat-bar';
import { FitImage } from './fit-image';
import { PanelAction, PanelChip, PanelSection, SlidePanel } from './slide-panel';
import { useLang } from './lang-provider';
import { localeOf } from '@/lib/i18n';
import { hargaText, type KatalogItem } from '@/lib/katalog';
import { tzLabel } from '@/lib/tz';

export type PanelType = 'news' | 'renungan' | 'event' | 'market';
type Target = { type: PanelType; id: string; title?: string };

const Ctx = createContext<(t: Target) => void>(() => {});
export const usePanel = () => useContext(Ctx);

const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'https://api.eccchurch.global';
const abs = (u?: string | null) => (!u ? null : /^https?:/i.test(u) ? u : `${API_BASE}${u}`);
const ELS = 'https://elsapp.eccchurch.global';
const mapsSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function PanelProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');

  const openPanel = useCallback((t: Target) => {
    setTarget(t);
    setData(null);
    setState('loading');
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
    fetch(`/api/panel/${t.type}/${encodeURIComponent(t.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        setData(j.data);
        setState('ok');
      })
      .catch(() => setState('error'));
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setTimeout(() => setTarget(null), 300);
  }, []);

  return (
    <Ctx.Provider value={openPanel}>
      {children}
      {target ? <PanelBody target={target} open={open} onClose={close} data={data} state={state} /> : null}
    </Ctx.Provider>
  );
}

/** Kartu yang membuka panel saat diklik (Enter/Space juga). */
export function PanelTrigger({
  type,
  id,
  title,
  className = '',
  children,
}: {
  type: PanelType;
  id: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const open = usePanel();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => open({ type, id, title })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open({ type, id, title });
        }
      }}
      className={`cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${className}`}
    >
      {children}
    </div>
  );
}

const META: Record<PanelType, { Icon: typeof Newspaper; badge: 'nav.news' | 'nav.renungan' | 'nav.event' | 'nav.market'; href: (d: any, id: string) => string }> = {
  news: { Icon: Newspaper, badge: 'nav.news', href: (d, id) => `/news/${d?.slug ?? id}` },
  renungan: { Icon: BookOpen, badge: 'nav.renungan', href: (d, id) => `/renungan/${d?.slug ?? id}` },
  event: { Icon: Megaphone, badge: 'nav.event', href: (d, id) => `/event/${d?.slug ?? id}` },
  market: { Icon: Store, badge: 'nav.market', href: (_d, id) => `/local-market/${id}` },
};

function PanelBody({ target, open, onClose, data, state }: { target: Target; open: boolean; onClose: () => void; data: any; state: string }) {
  const { lang, t } = useLang();
  const loc = localeOf(lang);
  const d = data;
  const meta = META[target.type];
  const date = (iso?: string | null, o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) =>
    iso ? new Date(iso).toLocaleDateString(loc, o) : null;
  const title = d?.judul ?? d?.nama ?? target.title ?? '';

  let chips: React.ReactNode = null;
  let body: React.ReactNode = null;
  // Cukup panel samping — tanpa tautan "Lihat halaman lengkap".
  let footer: React.ReactNode = null;

  if (state === 'loading') {
    body = (
      <div className="h-40 flex items-center justify-center text-neutral-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> {t('pn.loading')}
      </div>
    );
  } else if (state === 'error' || !d) {
    body = <div className="h-40 flex items-center justify-center text-neutral-500">{t('pn.error')}</div>;
  } else if (target.type === 'news' || target.type === 'renungan') {
    chips = (
      <>
        {d.ayatAlkitab ? <PanelChip strong>{d.ayatAlkitab}</PanelChip> : null}
        {d.tanggal ? (
          <PanelChip>
            <Calendar className="w-3.5 h-3.5" />
            {date(d.tanggal)} · {tzLabel(d.cabang?.timezone)}
          </PanelChip>
        ) : null}
        {d.cabang ? (
          <PanelChip>
            <Church className="w-3.5 h-3.5" />
            {d.cabang.nama}
          </PanelChip>
        ) : null}
      </>
    );
    body = (
      <>
        {d.heroImageUrl ? <FitImage src={abs(d.heroImageUrl)!} alt={title} sizes="480px" className="w-full aspect-[3/2] rounded-3xl" /> : null}
        <PanelSection>
          {d.ringkasan ? <p className="text-[15px] text-neutral-700 leading-relaxed font-medium border-l-4 border-brand-400 pl-3 mb-4">{d.ringkasan}</p> : null}
          {d.konten ? <Markdown content={d.konten} className="prose prose-neutral prose-sm max-w-none" /> : <p className="text-neutral-500 italic">{t('dt.noContent')}</p>}
          {Array.isArray(d.tags) && d.tags.length ? (
            <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center gap-1.5 flex-wrap">
              <Tag className="w-4 h-4 text-brand-500" />
              {d.tags.map((x: string) => (
                <span key={x} className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full text-xs font-semibold">
                  {x}
                </span>
              ))}
            </div>
          ) : null}
        </PanelSection>
      </>
    );
  } else if (target.type === 'event') {
    const fee = d.tipeBayar === 'GRATIS' ? t('common.free') : d.nominal ? `Rp ${Number(d.nominal).toLocaleString('id-ID')}` : t('ev.flexible');
    const when = `${date(d.tanggalMulai, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}${
      d.tanggalSelesai && d.tanggalSelesai !== d.tanggalMulai ? ` – ${date(d.tanggalSelesai)}` : ''
    }`;
    chips = (
      <>
        <PanelChip>
          <Calendar className="w-3.5 h-3.5" />
          {date(d.tanggalMulai, { weekday: 'short', day: 'numeric', month: 'short' })}
        </PanelChip>
        {d.jamMulai ? (
          <PanelChip>
            <Clock className="w-3.5 h-3.5" />
            {d.jamMulai}
            {d.jamSelesai ? ` – ${d.jamSelesai}` : ''} {tzLabel(d.cabang?.timezone)}
          </PanelChip>
        ) : null}
        <PanelChip strong>{fee}</PanelChip>
      </>
    );
    body = (
      <>
        {d.heroImageUrl ? <FitImage src={abs(d.heroImageUrl)!} alt={title} sizes="480px" className="w-full aspect-[3/2] rounded-3xl" /> : null}
        <PanelSection>
          <div className="space-y-3 text-sm">
            <Row Icon={Calendar} label={t('ev.when')}>
              <div className="font-semibold text-neutral-900">
                {when}
                {d.jamMulai ? null : <span className="font-normal text-neutral-500"> · {tzLabel(d.cabang?.timezone)}</span>}
              </div>
              {d.jamMulai ? (
                <div className="text-neutral-600">
                  {d.jamMulai}
                  {d.jamSelesai ? ` – ${d.jamSelesai}` : ''} {tzLabel(d.cabang?.timezone)}
                </div>
              ) : null}
            </Row>
            {d.lokasi || d.cabang ? (
              <Row Icon={MapPin} label={t('ev.where')}>
                {d.lokasi ? <div className="font-semibold text-neutral-900 break-words">{d.lokasi}</div> : null}
                {d.cabang ? <div className="text-neutral-600">{d.cabang.nama}</div> : null}
              </Row>
            ) : null}
            <Row Icon={CreditCard} label={t('ev.fee')}>
              <div className={`font-semibold ${d.tipeBayar === 'GRATIS' ? 'text-green-700' : 'text-neutral-900'}`}>{fee}</div>
            </Row>
            <div className="rounded-2xl bg-brand-50/70 border border-orange-100 p-3">
              <SeatBar quota={d.quotaPeserta} filled={d.pesertaCount} size="md" />
            </div>
          </div>
        </PanelSection>
        {d.lokasi ? <PanelAction href={mapsSearch([d.lokasi, d.cabang?.nama].filter(Boolean).join(', '))} Icon={Navigation} title={t('mk.maps')} sub={d.lokasi} /> : null}
        {d.ringkasan || d.deskripsi ? (
          <PanelSection>
            {d.ringkasan ? <p className="text-[15px] text-neutral-700 font-medium mb-3">{d.ringkasan}</p> : null}
            {d.deskripsi ? <Markdown content={String(d.deskripsi).replace(/\n/g, '  \n')} className="prose prose-neutral prose-sm max-w-none" /> : null}
          </PanelSection>
        ) : null}
      </>
    );
    footer = (
      <>
        <a href={ELS} target="_blank" rel="noopener noreferrer" className="btn-primary w-full justify-center">
          <Smartphone className="w-4 h-4" />
          {t('ev.register')}
        </a>
      </>
    );
  } else if (target.type === 'market') {
    const wa = d.waAdmin ? `https://wa.me/${String(d.waAdmin).replace(/\D/g, '')}` : d.whatsappUrl;
    const maps = d.mapsUrl && /^https?:\/\//i.test(d.mapsUrl) ? d.mapsUrl : d.lokasi ? mapsSearch(`${d.nama}, ${d.lokasi}`) : null;
    const items: KatalogItem[] = d.items ?? [];
    chips = (
      <>
        {d.industri ? <PanelChip>{d.industri}</PanelChip> : null}
        {d.isOnline ? <PanelChip strong>{t('common.online')}</PanelChip> : null}
        {d.owner?.cabang ? (
          <PanelChip>
            <Church className="w-3.5 h-3.5" />
            {d.owner.cabang.nama}
          </PanelChip>
        ) : null}
      </>
    );
    body = (
      <>
        {d.heroImageUrl ? <FitImage src={abs(d.heroImageUrl)!} alt={title} sizes="480px" className="w-full aspect-video rounded-3xl" /> : null}
        <PanelSection title={t('mk.about')}>
          <p className="text-sm text-neutral-700 whitespace-pre-line leading-relaxed">{d.deskripsi || t('mk.noDesc')}</p>
          {d.lokasi ? (
            <p className="mt-3 text-sm text-neutral-600 flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-brand-500" />
              {d.lokasi}
            </p>
          ) : null}
        </PanelSection>
        <div className="grid grid-cols-1 gap-2">
          {maps ? <PanelAction href={maps} Icon={Navigation} title={t('mk.maps')} sub={d.lokasi ?? undefined} /> : null}
          {d.websiteUrl ? <PanelAction href={d.websiteUrl} Icon={Globe} title={t('mk.website')} sub={String(d.websiteUrl).replace(/^https?:\/\//, '')} /> : null}
          {d.email ? <PanelAction href={`mailto:${d.email}`} Icon={Mail} title={t('mk.email')} sub={d.email} /> : null}
        </div>
        {items.length ? (
          <PanelSection title={`${t('mk.catalog')} · ${items.length}`}>
            <div className="grid grid-cols-2 gap-2.5">
              {items.slice(0, 6).map((it) => (
                <Link key={it.id} href={`/local-market/${target.id}/item/${it.id}`} className="rounded-2xl border border-neutral-200 overflow-hidden hover:border-brand-300 transition bg-white">
                  <div className="relative aspect-[3/2] w-full bg-brand-grad">
                    {it.fotoUrls[0] ? (
                      <FitImage src={abs(it.fotoUrls[0])!} alt={it.nama} sizes="200px" className="absolute inset-0" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white/85">
                        <Store className="w-6 h-6" />
                      </div>
                    )}
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-700">
                      {it.jenis === 'JASA' ? t('mk.service') : t('mk.product')}
                    </span>
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-bold text-neutral-900 line-clamp-1">{it.nama}</div>
                    <div className={`text-xs font-extrabold ${it.hargaTipe === 'NEGO' ? 'text-neutral-500' : 'text-brand-700'}`}>{hargaText(it, lang)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </PanelSection>
        ) : null}
      </>
    );
    footer = wa ? (
      <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 transition">
        <MessageCircle className="w-5 h-5" />
        {t('mk.chat')}
      </a>
    ) : null;
  }

  return (
    <SlidePanel open={open} onClose={onClose} Icon={meta.Icon} badge={t(meta.badge)} title={title} chips={chips} footer={footer}>
      {body}
    </SlidePanel>
  );
}

function Row({ Icon, label, children }: { Icon: typeof Calendar; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{label}</div>
        {children}
      </div>
    </div>
  );
}
