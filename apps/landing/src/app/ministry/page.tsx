import type { Metadata } from 'next';
import {
  HandHeart,
  ExternalLink,
  Users,
  Briefcase,
} from 'lucide-react';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Ministry',
  description:
    'Berbagai pelayanan / ministry yang ada di Elshaddai Creative Community.',
};

interface Ministry {
  id: string;
  nama: string;
  deskripsi: string | null;
  roleCount: number;
  memberCount: number;
}

export default async function MinistryPage() {
  const list = (await apiGet<Ministry[]>('/public/ministry?limit=100')) ?? [];

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 to-white py-12 lg:py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
            <HandHeart className="w-3.5 h-3.5" />
            Ministry
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">
            Pelayanan / Ministry
          </h1>
          <p className="text-neutral-600">
            Setiap orang punya panggilan untuk melayani. Temukan ministry yang
            sesuai dengan talentamu.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page max-w-5xl mx-auto">
          {list.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl">
              Belum ada ministry yang terdaftar.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {list.map((m) => (
                <div
                  key={m.id}
                  className="bg-white border border-neutral-200 rounded-2xl p-6 hover:shadow-md transition"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-brand-100 text-brand-600 rounded-xl flex items-center justify-center shrink-0">
                      <HandHeart className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-xl text-neutral-900 mb-2">
                        {m.nama}
                      </h3>
                      {m.deskripsi && (
                        <p className="text-sm text-neutral-600 mb-4">
                          {m.deskripsi}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                        <span className="inline-flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5" />
                          {m.roleCount} role
                        </span>
                        <span className="text-neutral-300">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5" />
                          {m.memberCount} anggota aktif
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-12 p-6 bg-neutral-50 border border-neutral-200 rounded-2xl text-center">
            <HandHeart className="w-10 h-10 mx-auto mb-3 text-brand-500" />
            <p className="text-sm text-neutral-700 mb-3">
              Tertarik bergabung di salah satu ministry? Daftar via aplikasi ECC
              dan tim kami akan menghubungi Anda.
            </p>
            <a
              href="https://apps.apple.com/app/ecc-church"
              className="btn-primary text-sm"
            >
              Download Aplikasi ECC
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
