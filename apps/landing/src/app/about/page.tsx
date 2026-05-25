import type { Metadata } from 'next';
import { Heart, Users, BookOpen, Globe, Sparkles, type LucideIcon } from 'lucide-react';
import { getWebsiteContent, getMarkdown, getJson } from '@/lib/website-content';
import { Markdown } from '@/components/markdown';

export const metadata: Metadata = {
  title: 'Tentang Kami',
  description: 'Tentang Elshaddai Creative Community (ECC) — visi, misi, dan nilai-nilai kami.',
};

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

const VALUES_FALLBACK: ValueCard[] = [
  { icon: 'Heart', title: 'Kasih', desc: 'Mengasihi Tuhan dan sesama.' },
  { icon: 'BookOpen', title: 'Firman', desc: 'Berpegang pada Alkitab.' },
  { icon: 'Users', title: 'Komunitas', desc: 'Membangun relasi otentik.' },
  { icon: 'Sparkles', title: 'Kreativitas', desc: 'Melayani Tuhan dengan kreativitas.' },
];

export default async function AboutPage() {
  const cms = await getWebsiteContent();
  const story = getMarkdown(cms, 'about.story', STORY_FALLBACK);
  const visi = getMarkdown(cms, 'about.visi', VISI_FALLBACK);
  const misi = getJson<string[]>(cms, 'about.misi', MISI_FALLBACK);
  const values = getJson<ValueCard[]>(cms, 'about.values', VALUES_FALLBACK);

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 to-white py-16 lg:py-20">
        <div className="container-page text-center max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-4">Tentang ECC</h1>
          <p className="text-lg text-neutral-600">
            <strong>Elshaddai Creative Community</strong> — komunitas jemaat yang
            berkomitmen membangun kerajaan Allah melalui kasih, kebenaran, kreativitas, dan
            pelayanan.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="container-page max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-neutral-900 mb-6">Cerita Kami</h2>
          <Markdown content={story} />
        </div>
      </section>

      <section className="py-16 lg:py-20 bg-neutral-50">
        <div className="container-page max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-8 border border-neutral-200">
              <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4">
                <Heart className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-2xl text-neutral-900 mb-3">Visi</h3>
              <Markdown content={visi} className="prose prose-neutral max-w-none prose-p:text-neutral-700" />
            </div>
            <div className="bg-white rounded-2xl p-8 border border-neutral-200">
              <div className="w-12 h-12 bg-accent-400/20 text-accent-600 rounded-xl flex items-center justify-center mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-2xl text-neutral-900 mb-3">Misi</h3>
              <ul className="text-neutral-700 leading-relaxed space-y-2 list-disc list-inside">
                {misi.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="container-page">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-neutral-900 mb-3">Nilai-Nilai Kami</h2>
            <p className="text-neutral-600 max-w-xl mx-auto">
              Pilar yang menjadi fondasi setiap pelayanan dan kegiatan di ECC.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {values.map((v, idx) => {
              const Icon = ICONS[v.icon] ?? Heart;
              return (
                <div
                  key={`${v.title}-${idx}`}
                  className="text-center bg-white border border-neutral-200 rounded-xl p-6 hover:shadow-md transition"
                >
                  <div className="w-12 h-12 bg-brand-50 text-brand-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-bold text-neutral-900 mb-2">{v.title}</h3>
                  <p className="text-sm text-neutral-600 leading-relaxed">{v.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
