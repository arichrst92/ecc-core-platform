import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Heart, Users, Calendar, BookOpen } from 'lucide-react';

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-brand-50 via-white to-accent-400/10 overflow-hidden">
        <div className="container-page py-20 lg:py-28 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
              <Heart className="w-3.5 h-3.5" />
              Engaging Christ Community
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 mb-6">
              Selamat datang di{' '}
              <span className="bg-gradient-to-r from-brand-500 to-accent-500 bg-clip-text text-transparent">
                ECC Church
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600 mb-8 max-w-2xl">
              Komunitas jemaat yang bertumbuh dalam kasih Kristus, melayani sesama, dan
              menjadi terang di tengah dunia. Bergabunglah dengan kami di cabang terdekat.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/cabang" className="btn-primary">
                Temukan Cabang
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link href="/about" className="btn-secondary">
                Tentang Kami
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Visi Misi */}
      <section className="py-16 lg:py-20">
        <div className="container-page">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">Visi & Misi</h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              Komitmen kami untuk mewujudkan komunitas Kristen yang autentik.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <div className="bg-white border border-neutral-200 rounded-2xl p-8 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center mb-4">
                <Heart className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-xl text-neutral-900 mb-3">Visi</h3>
              <p className="text-neutral-600 leading-relaxed">
                Menjadi komunitas jemaat yang dewasa secara rohani, mengalami transformasi
                hidup dalam Kristus, dan berdampak positif bagi masyarakat sekitar.
              </p>
            </div>
            <div className="bg-white border border-neutral-200 rounded-2xl p-8 hover:shadow-lg transition">
              <div className="w-12 h-12 bg-accent-400/20 text-accent-600 rounded-xl flex items-center justify-center mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-xl text-neutral-900 mb-3">Misi</h3>
              <p className="text-neutral-600 leading-relaxed">
                Membangun komunitas yang saling melayani melalui ibadah, persekutuan,
                pemuridan, dan pelayanan kasih kepada sesama tanpa batasan.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Apa yang kami lakukan */}
      <section className="py-16 lg:py-20 bg-neutral-50">
        <div className="container-page">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">
              Apa Yang Kami Lakukan
            </h2>
            <p className="text-neutral-600 max-w-2xl mx-auto">
              Berbagai pelayanan untuk jemaat dari segala usia dan latar belakang.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Calendar,
                title: 'Ibadah Mingguan',
                desc: 'Ibadah hari Minggu di berbagai cabang dengan jadwal yang dapat disesuaikan dengan kebutuhan jemaat.',
              },
              {
                icon: Users,
                title: 'Pemuridan & Homecell',
                desc: 'Persekutuan kelompok kecil untuk bertumbuh bersama dalam iman dan saling menguatkan.',
              },
              {
                icon: BookOpen,
                title: 'Pemberitaan Firman',
                desc: 'Pengajaran Alkitab yang relevan untuk kehidupan sehari-hari dengan dasar teologis yang sehat.',
              },
              {
                icon: Heart,
                title: 'Pelayanan Kasih',
                desc: 'Program sosial untuk komunitas sekitar — bantuan, edukasi, dan dukungan untuk yang membutuhkan.',
              },
              {
                icon: Users,
                title: 'Pelayanan Pemuda',
                desc: 'Wadah bagi generasi muda untuk bertumbuh, melayani, dan menemukan panggilan hidup mereka.',
              },
              {
                icon: Calendar,
                title: 'Event & Retreat',
                desc: 'Acara khusus, conference, dan retreat tahunan untuk pertumbuhan jemaat secara komunitas.',
              },
            ].map((item, idx) => (
              <div key={idx} className="bg-white rounded-xl p-6 hover:shadow-md transition border border-neutral-100">
                <div className="w-10 h-10 bg-brand-50 text-brand-500 rounded-lg flex items-center justify-center mb-3">
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-neutral-900 mb-2">{item.title}</h3>
                <p className="text-sm text-neutral-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 lg:py-20">
        <div className="container-page">
          <div className="bg-gradient-to-br from-brand-500 to-brand-600 rounded-3xl p-10 lg:p-14 text-center text-white shadow-xl">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Bergabunglah Dengan Kami</h2>
            <p className="text-brand-50 max-w-xl mx-auto mb-8 text-lg">
              Datang ke cabang terdekat atau hubungi kami untuk informasi lebih lanjut tentang
              ibadah dan kegiatan ECC.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/cabang"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-brand-600 hover:bg-brand-50 rounded-lg font-semibold transition shadow-sm"
              >
                Lihat Cabang
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-700/30 text-white hover:bg-brand-700/50 rounded-lg font-semibold transition border border-white/20"
              >
                Hubungi Kami
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
