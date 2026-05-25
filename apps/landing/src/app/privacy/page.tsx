import type { Metadata } from 'next';
import { apiGet } from '@/lib/api';
import { Markdown } from '@/components/markdown';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Kebijakan privasi Elshaddai Creative Community.',
};

interface LegalDoc {
  key: string;
  title: string;
  content: string;
  version: string;
  publishedAt: string;
  updatedAt: string;
}

export default async function PrivacyPage() {
  const doc = await apiGet<LegalDoc>('/public/legal/PRIVACY?lang=id');

  return (
    <article className="container-page py-12 lg:py-16 max-w-3xl mx-auto">
      <h1 className="text-4xl font-bold text-neutral-900 mb-2">
        {doc?.title ?? 'Privacy Policy'}
      </h1>
      {doc && (
        <p className="text-sm text-neutral-500 mb-8">
          Versi {doc.version} · Diperbarui{' '}
          {new Date(doc.updatedAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}
      {doc ? (
        <Markdown content={doc.content} />
      ) : (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-8 text-center text-neutral-500">
          Dokumen Privacy Policy sedang di-update. Silakan kembali lagi nanti, atau hubungi
          kami di{' '}
          <a href="mailto:info@eccchurch.global" className="text-brand-600 hover:underline">
            info@eccchurch.global
          </a>
          .
        </div>
      )}
    </article>
  );
}
