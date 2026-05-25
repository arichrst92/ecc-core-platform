import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

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
  return (
    <html lang="id">
      <body className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
