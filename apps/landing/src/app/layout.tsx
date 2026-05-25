import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: {
    default: 'ECC Church — Engaging Christ Community',
    template: '%s · ECC Church',
  },
  description:
    'ECC Church — komunitas jemaat yang bertumbuh dalam Kristus. Bergabung dengan ibadah, persekutuan, dan pelayanan di cabang gereja terdekat.',
  keywords: ['ECC Church', 'gereja', 'church', 'Jakarta', 'ibadah', 'jemaat', 'community'],
  openGraph: {
    title: 'ECC Church',
    description: 'Engaging Christ Community',
    url: 'https://eccchurch.global',
    siteName: 'ECC Church',
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
