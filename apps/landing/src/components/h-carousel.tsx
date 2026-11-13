'use client';

/**
 * Carousel menyamping (fit to screen): kartu setinggi area yang tersedia,
 * geser dengan panah, swipe, atau scroll horizontal (scroll-snap).
 */
import { Children, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from './lang-provider';

export function HCarousel({
  children,
  itemWidth = 'min(300px, 82vw)',
  minItemH,
  itemH,
  className = '',
}: {
  children: React.ReactNode;
  /** Lebar tiap kartu (nilai CSS). */
  itemWidth?: string;
  /**
   * Tinggi minimal kartu (px). Kalau diisi, kartu disusun bertingkat (2–3
   * baris) bila layar cukup tinggi — supaya kartu pendek tidak memanjang
   * dengan ruang kosong. Tanpa ini: 1 baris, tinggi kartu mengikuti isinya.
   */
  minItemH?: number;
  /** Tinggi standar kartu (px) — semua kartu sama tinggi; isi panjang dipotong "…". */
  itemH?: number;
  className?: string;
}) {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const [rows, setRows] = useState(1);
  const items = Children.toArray(children);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const measure = () => {
      if (minItemH) {
        const h = wrap.clientHeight;
        const r = Math.max(1, Math.min(3, Math.floor((h + 16) / (minItemH + 16))));
        // Jangan bertingkat kalau item sedikit (cukup 1 baris).
        const perRow = Math.max(1, Math.floor(el.clientWidth / 300));
        setRows(items.length <= perRow ? 1 : r);
      }
      update();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [update, items.length, minItemH]);

  const move = (dir: number) => {
    const el = ref.current;
    if (!el) return;
    const first = el.firstElementChild as HTMLElement | null;
    const step = first ? first.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    const per = Math.max(1, Math.floor(el.clientWidth / step));
    el.scrollBy({ left: dir * step * per, behavior: 'smooth' });
  };

  const multi = rows > 1;
  return (
    <div ref={wrapRef} className={`relative h-full min-h-0 ${className}`}>
      <div
        ref={ref}
        onScroll={update}
        className={`h-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-px-1 px-1 pb-2 no-scrollbar ${
          multi ? 'grid grid-flow-col gap-4' : 'flex items-start gap-4'
        }`}
        style={multi ? { gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, gridAutoColumns: itemWidth } : undefined}
      >
        {items.map((c, i) => (
          <div
            key={i}
            className={`snap-start min-h-0 ${multi || itemH ? 'h-full [&>*]:h-full' : 'shrink-0 max-h-full flex flex-col [&>*]:min-h-0'} ${!multi && itemH ? 'shrink-0' : ''}`}
            style={multi ? undefined : itemH ? { width: itemWidth, height: `min(100%, ${itemH}px)` } : { width: itemWidth }}
          >
            {c}
          </div>
        ))}
      </div>
      {!edge.start ? (
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label={t('common.prev')}
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-white text-brand-700 shadow-lg items-center justify-center hover:bg-brand-50 z-10"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      ) : null}
      {!edge.end ? (
        <button
          type="button"
          onClick={() => move(1)}
          aria-label={t('common.next')}
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-11 h-11 rounded-full bg-white text-brand-700 shadow-lg items-center justify-center hover:bg-brand-50 z-10"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      ) : null}
    </div>
  );
}

/** Carousel dengan pilihan grup (mis. per cabang) di atasnya. */
export function GroupCarousel({
  groups,
  itemWidth,
  minItemH,
  itemH,
  showAll = true,
}: {
  groups: { key: string; label: string; items: React.ReactNode[] }[];
  itemWidth?: string;
  minItemH?: number;
  itemH?: number;
  showAll?: boolean;
}) {
  const { t } = useLang();
  const [sel, setSel] = useState<string>(showAll && groups.length > 1 ? '__all__' : groups[0]?.key ?? '');
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const items = sel === '__all__' ? groups.flatMap((g) => g.items) : groups.find((g) => g.key === sel)?.items ?? [];
  const chips = [...(showAll && groups.length > 1 ? [{ key: '__all__', label: t('common.all'), n: total }] : []), ...groups.map((g) => ({ key: g.key, label: g.label, n: g.items.length }))];
  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      {chips.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto no-scrollbar shrink-0 pb-0.5">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setSel(c.key)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold border transition ${
                sel === c.key ? 'bg-brand-grad text-white border-transparent shadow' : 'bg-white text-neutral-700 border-neutral-200 hover:border-brand-300'
              }`}
            >
              {c.label}
              <span className={`text-[11px] ${sel === c.key ? 'text-white/85' : 'text-neutral-400'}`}>{c.n}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex-1 min-h-0">
        <HCarousel key={sel} itemWidth={itemWidth} minItemH={minItemH} itemH={itemH}>
          {items}
        </HCarousel>
      </div>
    </div>
  );
}
