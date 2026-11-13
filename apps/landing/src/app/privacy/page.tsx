import type { Metadata } from 'next';
import { apiGet } from '@/lib/api';
import { Markdown } from '@/components/markdown';
import { ShieldCheck } from 'lucide-react';
import { getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { DetailShell } from '@/components/detail-shell';

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
  const { lang, t } = getT();
  const doc =
    (await apiGet<LegalDoc>(`/public/legal/PRIVACY?lang=${lang}`)) ??
    (lang !== 'id' ? await apiGet<LegalDoc>('/public/legal/PRIVACY?lang=id') : null);

  return (
    <DetailShell
      backHref="/"
      backLabel={t('nav.home')}
      Icon={ShieldCheck}
      badge={t('foot.privacy')}
      title={doc?.title ?? t('foot.privacy')}
      meta={
        doc ? (
          <span>
            v{doc.version} · {t('legal.updated')}{' '}
            {new Date(doc.updatedAt).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long', year: 'numeric' })}
          </span>
        ) : null
      }
    >
      {doc ? (
        <Markdown content={doc.content} />
      ) : (
        <p className="text-neutral-500">
          {t('dt.noContent')}{' '}
          <a href="mailto:info@eccchurch.global" className="text-brand-600 hover:underline">
            info@eccchurch.global
          </a>
        </p>
      )}
    </DetailShell>
  );
}
