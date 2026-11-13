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

  const visiMisi = (
    <section className="shrink-0 bg-white rounded-3xl border border-orange-100 shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)] overflow-hidden">
      {/* Visi — pita oranye gradient, teks putih */}
      <div className="relative bg-brand-grad text-white px-6 py-5 sm:px-7">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10" />
        <div className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">{t('about.visi')}</div>
        <Markdown
          content={visi}
          className="relative mt-2 prose max-w-none prose-p:my-0 prose-p:text-lg sm:prose-p:text-xl prose-p:font-bold prose-p:leading-snug prose-p:text-white"
        />
      </div>
      {/* Misi */}
      <div className="px-6 py-5 sm:px-7">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{t('about.misi')}</div>
        {misi.length === 1 ? (
          <p className="mt-2 text-[14.5px] text-neutral-700 leading-relaxed">{misi[0]}</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {misi.map((m, idx) => (
              <li key={idx} className="flex gap-3 text-[14.5px] text-neutral-700 leading-relaxed">
                <span className="font-extrabold text-brand-600 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                <span>{m}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );

  return (
    <ScreenPage title={t('about.title')} subtitle={t('about.sub')}>
      <div className="h-full min-h-0 grid gap-5 overflow-y-auto lg:overflow-visible lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* Kiri: cerita + nilai-nilai (menggulung di dalam kartu) */}
        <article className="min-h-0 bg-white rounded-3xl border border-orange-100 shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)] lg:overflow-y-auto">
          <div className="px-6 py-7 sm:px-10 sm:py-9">
            <div className="flex items-center gap-3">
              <EccLogo height={44} className="text-brand-600 shrink-0" />
              <div className="leading-tight">
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{t('about.story')}</div>
                <div className="text-sm text-neutral-500">{t('about.since')}</div>
              </div>
            </div>
            <Markdown
              content={story}
              className="mt-5 prose prose-neutral max-w-none prose-p:text-[15.5px] prose-p:leading-[1.85] prose-p:text-neutral-700 first-letter:float-left first-letter:mr-2 first-letter:text-5xl first-letter:font-extrabold first-letter:leading-none first-letter:text-brand-600"
            />

            <div className="my-8 h-px bg-gradient-to-r from-brand-300 via-orange-100 to-transparent" />

            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{t('about.valuesTitle')}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {values.map((v, idx) => {
                const Icon = ICONS[v.icon] ?? Heart;
                return (
                  <div key={`${v.title}-${idx}`} className="flex gap-3 rounded-2xl bg-brand-50/60 border border-orange-100 p-4">
                    <span className="w-10 h-10 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-neutral-900">{v.title}</div>
                      <p className="text-sm text-neutral-600 leading-snug">{v.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </article>

        {/* Kanan: visi & misi + tim pastoral */}
        <div className="min-h-0 flex flex-col gap-5 lg:overflow-y-auto no-scrollbar">
          {visiMisi}

          {team.length ? (
            <section className="shrink-0 bg-white rounded-3xl border border-orange-100 shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)] p-5 sm:p-6">
              <div className="flex items-end justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{t('about.pastors')}</h2>
                  <p className="text-sm text-neutral-600">{t('about.pastorsSub')}</p>
                </div>
              </div>
              <HCarousel itemWidth="min(190px, 55vw)">
                {team.map((p) => (
                  <figure
                    key={p.id}
                    className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-brand-grad shadow-[0_18px_36px_-24px_rgba(124,45,18,.7)]"
                  >
                    {p.fotoUrl ? (
                      <Image src={absoluteUrl(p.fotoUrl) ?? ''} alt={p.nama} fill className="object-cover object-top" sizes="190px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white/90 text-5xl font-extrabold tracking-tight">
                        {initials(p.nama)}
                      </div>
                    )}
                    <figcaption className="absolute inset-x-0 bottom-0 p-3 pt-12 bg-gradient-to-t from-black/85 via-black/45 to-transparent text-white">
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-200 line-clamp-1">{p.posisi}</div>
                      <div className="text-[15px] font-extrabold leading-tight line-clamp-2">{p.nama}</div>
                      {p.cabang ? <div className="text-[11px] text-white/80 mt-0.5 truncate">{p.cabang.nama}</div> : null}
                    </figcaption>
                  </figure>
                ))}
              </HCarousel>
            </section>
          ) : null}
        </div>
      </div>
    </ScreenPage>
  );
}
