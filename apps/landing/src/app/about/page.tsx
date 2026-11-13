import type { Metadata } from 'next';
import Image from 'next/image';
import { Heart, Users, BookOpen, Globe, Sparkles, type LucideIcon } from 'lucide-react';
import { getWebsiteContent, getMarkdown, getJson } from '@/lib/website-content';
import { Markdown } from '@/components/markdown';
import { apiGet, absoluteUrl } from '@/lib/api';
import { getL, getT } from '@/lib/i18n-server';
import { ScreenPage } from '@/components/screen-page';
import { HCarousel } from '@/components/h-carousel';
import { EccLogo } from '@/components/ecc-logo';

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: L('Tentang Kami', 'About Us'),
    description: L(
      'Tentang Elshaddai Creative Community (ECC) — visi, misi, dan nilai-nilai kami.',
      'About Elshaddai Creative Community (ECC) — our vision, mission, and values.',
    ),
  };
}

interface ValueCard {
  icon: string;
  title: string;
  desc: string;
}

const ICONS: Record<string, LucideIcon> = {
  Heart,
  Users,
  BookOpen,
  Globe,
  Sparkles,
};

const STORY_FALLBACK = `Elshaddai Creative Community (ECC) didirikan dengan visi untuk menjadi komunitas jemaat yang dewasa secara rohani.

Sejak berdirinya, ECC terus bertumbuh dengan membuka cabang di berbagai kota di Indonesia.

Kami percaya bahwa gereja bukan hanya tempat ibadah hari Minggu, tetapi komunitas hidup yang saling melayani sepanjang minggu.`;

const VISI_FALLBACK =
  'Menjadi komunitas jemaat yang dewasa secara rohani melalui pelayanan kreatif di seluruh cabang ECC.';

const MISI_FALLBACK = [
  'Mengajarkan Firman Tuhan secara sistematis dan relevan',
  'Membangun persekutuan otentik melalui homecell & small group',
  'Memperlengkapi jemaat untuk pelayanan dan misi',
  'Mengembangkan ekspresi iman lewat seni, musik, media, dan kreativitas',
  'Menjangkau komunitas dengan kasih dan tindakan nyata',
];

const STORY_FALLBACK_EN = `Elshaddai Creative Community (ECC) was founded with a vision to be a spiritually mature community of believers.

Since its founding, ECC has kept growing by opening branches in cities across Indonesia.

We believe the church is not just a place for Sunday worship, but a living community that serves one another throughout the week.`;

const VISI_FALLBACK_EN =
  'To be a spiritually mature community of believers through creative ministry across all ECC branches.';

const MISI_FALLBACK_EN = [
  "Teach God's Word systematically and relevantly",
  'Build authentic fellowship through homecells & small groups',
  'Equip members for ministry and mission',
  'Develop expressions of faith through art, music, media, and creativity',
  'Reach the community with love and real action',
];

const VALUES_FALLBACK_EN: ValueCard[] = [
  { icon: 'Heart', title: 'Love', desc: 'Loving God and others.' },
  { icon: 'BookOpen', title: 'The Word', desc: 'Holding to the Bible.' },
  { icon: 'Users', title: 'Community', desc: 'Building authentic relationships.' },
  { icon: 'Sparkles', title: 'Creativity', desc: 'Serving God with creativity.' },
];

const VALUES_FALLBACK: ValueCard[] = [
  { icon: 'Heart', title: 'Kasih', desc: 'Mengasihi Tuhan dan sesama.' },
  { icon: 'BookOpen', title: 'Firman', desc: 'Berpegang pada Alkitab.' },
  { icon: 'Users', title: 'Komunitas', desc: 'Membangun relasi otentik.' },
  { icon: 'Sparkles', title: 'Kreativitas', desc: 'Melayani Tuhan dengan kreativitas.' },
];

interface Pastor {
  id: string;
  nama: string;
  fotoUrl: string | null;
  posisi: string;
  cabang: { id: string; nama: string } | null;
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

export default async function AboutPage() {
  const { lang, t } = getT();
  const en = lang === 'en';
  const [cms, pastors] = await Promise.all([getWebsiteContent(), apiGet<Pastor[]>('/public/pastors', { revalidate: 600 })]);
  // EN: pakai section "<key>.en" dari Portal; kalau belum ada → teks EN bawaan.
  const story = en ? getMarkdown(cms, 'about.story.en', STORY_FALLBACK_EN) : getMarkdown(cms, 'about.story', STORY_FALLBACK);
  const visi = en ? getMarkdown(cms, 'about.visi.en', VISI_FALLBACK_EN) : getMarkdown(cms, 'about.visi', VISI_FALLBACK);
  const misi = en ? getJson<string[]>(cms, 'about.misi.en', MISI_FALLBACK_EN) : getJson<string[]>(cms, 'about.misi', MISI_FALLBACK);
  const values = en
    ? getJson<ValueCard[]>(cms, 'about.values.en', VALUES_FALLBACK_EN)
    : getJson<ValueCard[]>(cms, 'about.values', VALUES_FALLBACK);
  const team = pastors ?? [];

  const label = 'text-[10.5px] font-bold uppercase tracking-[0.2em] text-brand-600';

  // Ringkas: cerita, visi, misi, nilai — teks kecil, menggulung di kartunya sendiri (desktop).
  const info = (
    <aside className="shrink-0 lg:shrink lg:min-h-0 w-full min-w-0 [overflow-wrap:anywhere] bg-white rounded-3xl border border-orange-100 shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)] lg:overflow-y-auto">
      <div className="p-5 sm:p-6 space-y-6">
        <div className="flex items-center gap-3">
          <EccLogo height={38} className="text-brand-600 shrink-0" />
          <div className="leading-tight min-w-0">
            <div className={label}>{t('about.story')}</div>
            <div className="text-xs text-neutral-500 truncate">{t('about.since')}</div>
          </div>
        </div>

        <Markdown
          content={story}
          className="prose prose-neutral max-w-none prose-p:my-2 prose-p:text-[13px] prose-p:leading-relaxed prose-p:text-neutral-600"
        />

        <div className="rounded-2xl bg-brand-grad text-white px-4 py-3.5">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-white/80">{t('about.visi')}</div>
          <Markdown
            content={visi}
            className="mt-1 prose max-w-none prose-p:my-0 prose-p:text-[14px] prose-p:font-semibold prose-p:leading-snug prose-p:text-white"
          />
        </div>

        <div>
          <div className={label}>{t('about.misi')}</div>
          {misi.length === 1 ? (
            <p className="mt-1.5 text-[13px] text-neutral-600 leading-relaxed">{misi[0]}</p>
          ) : (
            <ol className="mt-1.5 space-y-1.5">
              {misi.map((m, idx) => (
                <li key={idx} className="flex gap-2 text-[13px] text-neutral-600 leading-relaxed">
                  <span className="font-bold text-brand-600 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                  <span>{m}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div>
          <div className={label}>{t('about.valuesTitle')}</div>
          <ul className="mt-2 space-y-2">
            {values.map((v, idx) => {
              const Icon = ICONS[v.icon] ?? Heart;
              return (
                <li key={`${v.title}-${idx}`} className="flex gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </span>
                  <div className="min-w-0 text-[13px] leading-snug">
                    <span className="font-bold text-neutral-900">{v.title}</span>
                    <span className="text-neutral-600"> — {v.desc}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );

  return (
    <ScreenPage title={t('about.title')} subtitle={t('about.sub')}>
      <div
        className={`h-full min-h-0 w-full min-w-0 flex flex-col gap-5 overflow-y-auto overflow-x-hidden pb-2 lg:pb-0 lg:grid lg:overflow-hidden ${
          team.length ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)]' : 'max-w-3xl'
        }`}
      >
        {/* Tim pastoral — sorotan utama halaman (Penggembalaan level ≥ 8) */}
        {team.length ? (
          <section className="shrink-0 lg:shrink lg:min-h-0 w-full min-w-0 flex flex-col bg-white rounded-3xl border border-orange-100 shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)] p-4 sm:p-6">
            <div className="shrink-0 mb-4 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className={label}>{t('about.pastors')}</div>
                <h2 className="mt-0.5 text-sm text-neutral-600">{t('about.pastorsSub')}</h2>
              </div>
              <span className="shrink-0 hidden sm:inline-flex items-center rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                {team.length}
              </span>
            </div>
            {/* 2 baris kartu persegi. Mobile: tinggi tetap; desktop: mengisi sisa tinggi kartu. */}
            <div className="w-full min-w-0 h-[340px] sm:h-[440px] lg:h-auto lg:flex-1 lg:min-h-0 [container-type:size]">
              {/* Lebar kolom = tinggi baris (persegi): (tinggi wadah − pb-2 − gap-4) / 2. */}
              <HCarousel itemWidth="calc((100cqh - 24px) / 2)" rows={2}>
                {team.map((p) => (
                  <figure
                    key={p.id}
                    className="relative h-full w-full rounded-2xl overflow-hidden bg-brand-grad shadow-[0_20px_40px_-26px_rgba(124,45,18,.75)]"
                  >
                    {p.fotoUrl ? (
                      <Image src={absoluteUrl(p.fotoUrl) ?? ''} alt={p.nama} fill className="object-cover object-top" sizes="(max-width: 640px) 170px, 320px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white/90 text-4xl sm:text-5xl font-extrabold tracking-tight">
                        {initials(p.nama)}
                      </div>
                    )}
                    <figcaption className="absolute inset-x-0 bottom-0 p-2.5 sm:p-3.5 pt-10 bg-gradient-to-t from-black/85 via-black/45 to-transparent text-white">
                      <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.14em] text-orange-200 line-clamp-1">{p.posisi}</div>
                      <div className="text-[13px] sm:text-base font-extrabold leading-tight line-clamp-2">{p.nama}</div>
                      {p.cabang ? <div className="text-[10px] sm:text-xs text-white/80 mt-0.5 truncate">{p.cabang.nama}</div> : null}
                    </figcaption>
                  </figure>
                ))}
              </HCarousel>
            </div>
          </section>
        ) : null}

        {info}
      </div>
    </ScreenPage>
  );
}
