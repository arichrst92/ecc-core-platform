import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { SiteChrome } from '@/components/site-chrome';
import { LangProvider } from '@/components/lang-provider';
import { PanelProvider } from '@/components/panel-host';
import { getLang } from '@/lib/i18n-server';

export const metadata: Metadata = {
  title: {
    default: 'ECC — Elshaddai Creative Community',
    template: '%s · ECC',
  },
  description:
    'Elshaddai Creative Community (ECC) — komunitas jemaat yang bertumbuh dalam Kristus, melayani dengan kreativitas. Bergabung dengan ibadah, persekutuan, dan pelayanan di cabang terdekat.',
  keywords: [
    'ECC',
    'Elshaddai Creative Community',
    'gereja',
    'church',
    'Jakarta',
    'ibadah',
    'jemaat',
    'community',
  ],
  openGraph: {
    title: 'ECC — Elshaddai Creative Community',
    description: 'Elshaddai Creative Community',
    url: 'https://eccchurch.global',
    siteName: 'ECC',
    locale: 'id_ID',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/logo-ecc.webp',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Coming-soon mode: hide Navbar/Footer, render page fullscreen. Toggle
  // via ENV `LANDING_MODE=coming-soon` (see middleware.ts).
  const isComingSoon = process.env.LANDING_MODE === 'coming-soon';
  const lang = getLang();

  // Satu layar: body setinggi layar; konten mengisi sisa tinggi di antara
  // navbar & footer ramping. Halaman panjang (form, legal) menggulung di <main>.
  return (
    <html lang={lang}>
      <body className="h-dvh flex flex-col overflow-hidden">
        <LangProvider lang={lang}>
          <PanelProvider>
          {isComingSoon ? (
            <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
          ) : (
            <>
              <SiteChrome>
                <Navbar />
              </SiteChrome>
              <main className="flex-1 min-h-0 overflow-y-auto">{children}</main>
              <SiteChrome>
                <Footer />
              </SiteChrome>
            </>
          )}
          </PanelProvider>
        </LangProvider>
      </body>
    </html>
  );
}
