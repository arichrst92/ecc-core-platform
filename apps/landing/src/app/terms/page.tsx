import type { Metadata } from 'next';
import { apiGet } from '@/lib/api';
import { Markdown } from '@/components/markdown';
import { ShieldCheck } from 'lucide-react';
import { getL, getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { DetailShell } from '@/components/detail-shell';

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: L('Syarat & Ketentuan', 'Terms & Conditions'),
    description: L(
      'Syarat dan ketentuan penggunaan layanan Elshaddai Creative Community.',
      'Terms and conditions for using Elshaddai Creative Community services.',
    ),
  };
}

interface LegalDoc {
  key: string;
  title: string;
  content: string;
  version: string;
  publishedAt: string;
  updatedAt: string;
}

export default async function TermsPage() {
  const { lang, t } = getT();
  const doc =
    (await apiGet<LegalDoc>(`/public/legal/TERMS?lang=${lang}`)) ??
    (lang !== 'id' ? await apiGet<LegalDoc>('/public/legal/TERMS?lang=id') : null);

  return (
    <DetailShell
      backHref="/"
      backLabel={t('nav.home')}
      Icon={ShieldCheck}
      badge={t('foot.terms')}
      title={doc?.title ?? t('foot.terms')}
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
