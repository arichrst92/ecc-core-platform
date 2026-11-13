import type { Metadata } from 'next';
import Image from 'next/image';
import { Heart, Users, BookOpen, Globe, Sparkles, type LucideIcon } from 'lucide-react';
import { getWebsiteContent, getMarkdown, getJson } from '@/lib/website-content';
import { Markdown } from '@/components/markdown';
import { apiGet, absoluteUrl } from '@/lib/api';
import { getL, getT } from '@/lib/i18n-server';
import { ScreenPage } from '@/components/screen-page';
import { HCarousel } from '@/components/h-carousel';

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

  return (
    <ScreenPage title={t('about.title')} subtitle={t('about.sub')}>
      <div
        className={`h-full min-h-0 grid gap-6 overflow-y-auto lg:overflow-visible ${
          team.length ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]' : ''
        }`}
      >
        {/* Satu lembar editorial: cerita · visi · misi · nilai */}
        <article className="min-h-0 bg-white rounded-3xl border border-orange-100 shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)] overflow-y-auto">
          <div className="px-6 py-7 sm:px-10 sm:py-9">
            <div className="flex items-center gap-3">
              <Image src="/logo-ecc.webp" alt="ECC" width={40} height={40} />
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

            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{t('about.visi')}</div>
                <div className="mt-3 relative pl-5 border-l-4 border-brand-500">
                  <Markdown content={visi} className="prose max-w-none prose-p:text-xl prose-p:font-semibold prose-p:leading-snug prose-p:text-neutral-900" />
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{t('about.misi')}</div>
                <ol className="mt-3 space-y-2.5">
                  {misi.map((m, idx) => (
                    <li key={idx} className="flex gap-3 text-[14.5px] text-neutral-700 leading-relaxed">
                      <span className="font-extrabold text-brand-600 tabular-nums">{String(idx + 1).padStart(2, '0')}</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="my-8 h-px bg-gradient-to-r from-brand-300 via-orange-100 to-transparent" />

            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600">{t('about.valuesTitle')}</div>
            <div className="mt-4 grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {values.map((v, idx) => {
                const Icon = ICONS[v.icon] ?? Heart;
                return (
                  <div key={`${v.title}-${idx}`} className="flex gap-3">
                    <Icon className="w-6 h-6 text-brand-500 shrink-0 mt-0.5" strokeWidth={1.8} />
                    <div>
                      <div className="font-bold text-neutral-900">{v.title}</div>
                      <p className="text-sm text-neutral-600 leading-snug">{v.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </article>

        {/* Tim pastoral — dari pelayanan Penggembalaan (level ≥ 8) */}
        {team.length ? (
          <section className="min-h-[420px] lg:min-h-0 flex flex-col">
            <div className="shrink-0 mb-3 px-1">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-700">{t('about.pastors')}</h2>
              <p className="text-sm text-neutral-500">{t('about.pastorsSub')}</p>
            </div>
            <div className="flex-1 min-h-0">
              <HCarousel itemWidth="min(250px, 70vw)" itemH={420}>
                {team.map((p) => (
                  <figure key={p.id} className="relative h-full rounded-3xl overflow-hidden bg-brand-grad shadow-[0_24px_48px_-28px_rgba(124,45,18,.7)]">
                    {p.fotoUrl ? (
                      <Image src={absoluteUrl(p.fotoUrl) ?? ''} alt={p.nama} fill className="object-cover object-top" sizes="250px" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-white/90 text-6xl font-extrabold tracking-tight">{initials(p.nama)}</div>
                    )}
                    <figcaption className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black/80 via-black/40 to-transparent text-white">
                      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-200">{p.posisi}</div>
                      <div className="text-lg font-extrabold leading-tight">{p.nama}</div>
                      {p.cabang ? <div className="text-xs text-white/80 mt-0.5">{p.cabang.nama}</div> : null}
                    </figcaption>
                  </figure>
                ))}
              </HCarousel>
            </div>
          </section>
        ) : null}
      </div>
    </ScreenPage>
  );
}
