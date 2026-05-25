import type { Metadata } from 'next';
import { Heart, Users, BookOpen, Globe } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Tentang Kami',
  description: 'ECC Church — Engaging Christ Community. Visi, misi, dan nilai-nilai kami.',
};

const VALUES = [
  {
    icon: Heart,
    title: 'Kasih',
    desc: 'Mengasihi Tuhan dan sesama sebagai dasar setiap pelayanan dan keputusan.',
  },
  {
    icon: BookOpen,
    title: 'Firman',
    desc: 'Berpegang pada otoritas Alkitab sebagai sumber kebenaran dan pedoman hidup.',
  },
  {
    icon: Users,
    title: 'Komunitas',
    desc: 'Membangun relasi otentik di mana setiap jemaat bertumbuh bersama dalam iman.',
  },
  {
    icon: Globe,
    title: 'Dampak',
    desc: 'Menjadi berkat bagi masyarakat sekitar melalui pelayanan sosial dan kasih praktis.',
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white py-16 lg:py-20">
        <div className="container-page text-center max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-bold text-neutral-900 mb-4">Tentang ECC Church</h1>
          <p className="text-lg text-neutral-600">
            Engaging Christ Community — komunitas jemaat yang berkomitmen membangun
            kerajaan Allah melalui kasih, kebenaran, dan pelayanan.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-16 lg:py-20">
        <div className="container-page max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-neutral-900 mb-6">Cerita Kami</h2>
          <div className="prose prose-neutral max-w-none">
            <p className="text-neutral-700 leading-relaxed text-lg mb-4">
              ECC Church didirikan dengan visi untuk menjadi komunitas jemaat yang dewasa
              secara rohani, mengalami transformasi hidup dalam Kristus, dan berdampak
              positif bagi masyarakat sekitar.
            </p>
            <p className="text-neutral-700 leading-relaxed mb-4">
              Sejak berdirinya, ECC terus bertumbuh dengan membuka cabang di berbagai kota
              di Indonesia. Setiap cabang melayani jemaat lokal dengan pendekatan kontekstual
              namun tetap berpegang pada doktrin yang sama — Firman Tuhan sebagai dasar dan
              kasih Kristus sebagai teladan.
            </p>
            <p className="text-neutral-700 leading-relaxed">
              Kami percaya bahwa gereja bukan hanya tempat ibadah hari Minggu, tetapi
              komunitas hidup yang saling melayani sepanjang minggu. Melalui pelayanan
              homecell, pemuridan, dan kegiatan sosial, kami mengajak setiap jemaat untuk
              terlibat aktif dalam pertumbuhan iman bersama.
            </p>
          </div>
        </div>
      </section>

      {/* Visi Misi detail */}
      <section className="py-16 lg:py-20 bg-neutral-50">
        <div className="container-page max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-8 border border-neutral-200">
              <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4">
                <Heart className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-2xl text-neutral-900 mb-3">Visi</h3>
              <p className="text-neutral-700 leading-relaxed">
                Menjadi komunitas jemaat yang dewasa secara rohani, mengalami transformasi
                hidup dalam Kristus, dan berdampak positif bagi masyarakat sekitar — di
                seluruh cabang ECC.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 border border-neutral-200">
              <div className="w-12 h-12 bg-accent-400/20 text-accent-600 rounded-xl flex items-center justify-center mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-2xl text-neutral-900 mb-3">Misi</h3>
              <ul className="text-neutral-700 leading-relaxed space-y-2 list-disc list-inside">
                <li>Mengajarkan Firman Tuhan secara sistematis dan relevan</li>
                <li>Membangun persekutuan otentik melalui homecell &amp; small group</li>
                <li>Memperlengkapi jemaat untuk pelayanan dan misi</li>
                <li>Menjangkau komunitas dengan kasih dan tindakan nyata</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-16 lg:py-20">
        <div className="container-page">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-neutral-900 mb-3">Nilai-Nilai Kami</h2>
            <p className="text-neutral-600 max-w-xl mx-auto">
              4 pilar yang menjadi fondasi setiap pelayanan dan kegiatan di ECC.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {VALUES.map((v, idx) => (
              <div key={idx} className="text-center bg-white border border-neutral-200 rounded-xl p-6 hover:shadow-md transition">
                <div className="w-12 h-12 bg-brand-50 text-brand-500 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <v.icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-neutral-900 mb-2">{v.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
