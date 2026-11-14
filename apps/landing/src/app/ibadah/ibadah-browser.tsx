'use client';

/**
 * Jadwal ibadah: pilih cabang → kartu per tanggal (geser menyamping) →
 * klik ibadah → panel detail meluncur dari kanan ke kiri.
 */
import { useEffect, useState } from 'react';
import { Baby, Calendar, Church, Clock, ExternalLink, Globe, MapPin, Navigation, Smartphone, X } from 'lucide-react';
import { GroupCarousel } from '@/components/h-carousel';
import { useLang } from '@/components/lang-provider';
import { localeOf } from '@/lib/i18n';
import { tzLabel } from '@/lib/tz';

export interface IbadahEvent {
  id: string;
  tanggal: string;
  jam: string;
  jamSelesai: string;
  judul: string;
  kategori: { id: string; nama: string } | null;
  lokasi: string | null;
  isOnline: boolean;
  cabang: { id: string; nama: string; timezone?: string | null };
  linkOnline?: string | null;
  deskripsi?: string | null;
  mapsUrl?: string | null;
  isKidsIbadah?: boolean;
}

const hhmm = (s: string) => (s ?? '').slice(0, 5);

export function IbadahBrowser({ events, todayIso }: { events: IbadahEvent[]; todayIso: string }) {
  const { lang, t } = useLang();
  const loc = localeOf(lang);
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00`).toLocaleDateString(loc, o);
  const [sel, setSel] = useState<IbadahEvent | null>(null);
  const [open, setOpen] = useState(false);
  const isUrl = (u?: string | null) => !!u && /^https?:\/\//i.test(u);
  // Google Maps: titik dari Portal bila ada; kalau tidak, cari lokasi + cabang.
  const mapsHref = !sel || sel.isOnline
    ? null
    : isUrl(sel.mapsUrl)
      ? sel.mapsUrl!
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([sel.lokasi, sel.cabang.nama].filter(Boolean).join(', '))}`;
  const online = sel && isUrl(sel.linkOnline) ? sel.linkOnline! : null;

  // Panel: render dulu, lalu geser masuk (animasi kanan → kiri).
  const show = (e: IbadahEvent) => {
    setSel(e);
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  };
  const close = () => {
    setOpen(false);
    setTimeout(() => setSel(null), 300);
  };
  useEffect(() => {
    if (!sel) return;
    const k = (ev: KeyboardEvent) => ev.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [sel]);

  // cabang → tanggal → ibadah
  const cabangMap = new Map<string, { nama: string; tz: string; perTanggal: Map<string, IbadahEvent[]> }>();
  for (const e of events) {
    const b = cabangMap.get(e.cabang.id) ?? { nama: e.cabang.nama, tz: tzLabel(e.cabang.timezone), perTanggal: new Map<string, IbadahEvent[]>() };
    const arr = b.perTanggal.get(e.tanggal) ?? [];
    arr.push(e);
    b.perTanggal.set(e.tanggal, arr);
    cabangMap.set(e.cabang.id, b);
  }
  const groups = [...cabangMap.entries()]
    .sort(([, a], [, b]) => a.nama.localeCompare(b.nama))
    .map(([key, { nama, tz, perTanggal }]) => ({
      key,
      label: nama,
      items: [...perTanggal.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([tanggal, list]) => (
          <div key={`${key}-${tanggal}`} className="s-card">
            <div className={`px-5 py-4 shrink-0 ${tanggal === todayIso ? 'bg-brand-grad text-white' : 'bg-brand-50 text-brand-800'}`}>
              <p className="text-xs font-bold uppercase tracking-wider opacity-85">{fmt(tanggal, { weekday: 'long' })}</p>
              <p className="text-2xl font-extrabold leading-tight">{fmt(tanggal, { day: 'numeric', month: 'long' })}</p>
              <p className="text-xs opacity-80 mt-0.5">
                {nama} · {t('common.tzTime')} {tz}
              </p>
            </div>
            <div className="s-card-body s-scroll space-y-2">
              {[...list]
                .sort((a, b) => a.jam.localeCompare(b.jam))
                .map((e) => (
                  <button
                    key={`${e.id}-${e.jam}`}
                    type="button"
                    onClick={() => show(e)}
                    className="w-full text-left flex gap-3 rounded-2xl border border-neutral-100 p-3 hover:border-brand-300 hover:bg-brand-50/60 transition group"
                  >
                    <div className="w-14 shrink-0 text-center rounded-xl bg-brand-50 py-1.5 text-brand-700 group-hover:bg-brand-grad group-hover:text-white transition">
                      <b className="block text-sm">{hhmm(e.jam)}</b>
                      <span className="text-[11px] opacity-75">{hhmm(e.jamSelesai)}</span>
                      <span className="block text-[9.5px] font-bold opacity-70">{tz}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-neutral-900 leading-snug line-clamp-2">{e.judul}</p>
                      {e.kategori ? <p className="text-xs text-neutral-500 truncate">{e.kategori.nama}</p> : null}
                      <p className="mt-0.5 text-xs text-neutral-500 flex items-center gap-1">
                        {e.isOnline ? <Globe className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
                        <span className="truncate">{e.isOnline ? t('common.online') : e.lokasi ?? nama}</span>
                      </p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        )),
    }));

  return (
    <>
      <GroupCarousel itemWidth="min(290px, 82vw)" itemH={460} showAll={false} groups={groups} />

      {sel ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t('ib.detail')}>
          <div
            onClick={close}
            className={`absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
          />
          <aside
            className={`absolute right-0 top-0 h-full w-full sm:w-[440px] panel-fabric shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
              open ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="hero-fabric band-shadow text-white px-6 pt-5 pb-5 shrink-0 relative z-[1]">
              <button type="button" onClick={close} aria-label={t('ib.close')} className="absolute right-4 top-4 w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
              <div className="page-hero-badge !mb-2">
                <Church className="w-3.5 h-3.5" />
                {sel.kategori?.nama ?? t('nav.ibadah')}
              </div>
              <h2 className="text-2xl font-extrabold leading-tight pr-10">{sel.judul}</h2>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/25 px-2.5 py-1 font-semibold">
                  <Calendar className="w-3.5 h-3.5" />
                  {fmt(sel.tanggal, { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white text-brand-700 px-2.5 py-1 font-bold">
                  <Clock className="w-3.5 h-3.5" />
                  {hhmm(sel.jam)} – {hhmm(sel.jamSelesai)} {tzLabel(sel.cabang.timezone)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 border border-white/25 px-2.5 py-1 font-semibold">
                  <Church className="w-3.5 h-3.5" />
                  {sel.cabang.nama}
                </span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
              <section className="bg-white rounded-3xl border border-orange-100 p-5 space-y-4">
                <Row Icon={Calendar} label={t('ib.time')}>
                  <div className="font-semibold text-neutral-900">{fmt(sel.tanggal, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  <div className="text-neutral-600">
                    {hhmm(sel.jam)} – {hhmm(sel.jamSelesai)} {tzLabel(sel.cabang.timezone)}
                  </div>
                </Row>
                <div className="h-px bg-orange-100" />
                <Row Icon={sel.isOnline ? Globe : MapPin} label={t('ib.place')}>
                  <div className="font-semibold text-neutral-900">{sel.isOnline ? t('common.online') : sel.lokasi ?? sel.cabang.nama}</div>
                  <div className="text-neutral-600">{sel.cabang.nama}</div>
                </Row>
              </section>

              {mapsHref || online ? (
                <section className="grid grid-cols-1 gap-2">
                  {mapsHref ? (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-2xl bg-white border border-orange-100 px-4 py-3 hover:border-brand-300 hover:bg-brand-50 transition"
                    >
                      <span className="w-9 h-9 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
                        <Navigation className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-neutral-900">{t('mk.maps')}</span>
                        <span className="block text-xs text-neutral-500 truncate">{sel.lokasi ?? sel.cabang.nama}</span>
                      </span>
                      <ExternalLink className="w-4 h-4 text-neutral-400 shrink-0" />
                    </a>
                  ) : null}
                  {online ? (
                    <a
                      href={online}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-2xl bg-white border border-orange-100 px-4 py-3 hover:border-brand-300 hover:bg-brand-50 transition"
                    >
                      <span className="w-9 h-9 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
                        <Globe className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-neutral-900">{t('ib.joinOnline')}</span>
                        <span className="block text-xs text-neutral-500 truncate">{online.replace(/^https?:\/\//, '')}</span>
                      </span>
                      <ExternalLink className="w-4 h-4 text-neutral-400 shrink-0" />
                    </a>
                  ) : null}
                </section>
              ) : null}

              {sel.isKidsIbadah ? (
                <section className="flex items-start gap-3 rounded-2xl bg-pink-50 border border-pink-100 px-4 py-3 text-sm text-pink-900">
                  <Baby className="w-5 h-5 shrink-0 text-pink-600" />
                  <span>
                    <b className="block">{t('ib.kids')}</b>
                    {t('ib.kidsNote')}
                  </span>
                </section>
              ) : null}

              {sel.deskripsi ? (
                <section className="bg-white rounded-3xl border border-orange-100 p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-2">{t('ib.about')}</h3>
                  <p className="text-sm text-neutral-700 whitespace-pre-line leading-relaxed">{sel.deskripsi}</p>
                </section>
              ) : null}
            </div>

            <div className="shrink-0 p-5 pt-3 border-t border-orange-100 bg-white">
              <a href="https://elsapp.eccchurch.global" target="_blank" rel="noopener noreferrer" className="btn-primary w-full justify-center">
                <Smartphone className="w-4 h-4" />
                {t('ib.reserve')}
              </a>
              <p className="mt-2 text-center text-xs text-neutral-500">{t('ib.reserveSub')}</p>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function Row({ Icon, label, children }: { Icon: typeof Calendar; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-sm">
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
