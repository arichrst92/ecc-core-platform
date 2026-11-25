/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ecc/shared-types'],
  images: {
    // Hanya domain ECC (CVE-2026-96889 / CVE-2026-94483: jangan izinkan host sembarang).
    remotePatterns: [
      { protocol: 'https', hostname: 'eccchurch.global' },
      { protocol: 'https', hostname: '*.eccchurch.global' },
      ...(process.env.NODE_ENV === 'production' ? [] : [{ protocol: 'http', hostname: 'localhost' }]),
    ],
  },
  env: {
    NEXT_PUBLIC_CORE_API_URL: process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4100',
  },
  /**
   * Dev-only rewrite: /planning/* diarahkan ke apps/planning (port 3300)
   * supaya same-origin dengan portal (localStorage shared, no SSO flow).
   *
   * Di production, nginx handle ini sebelum request sampai ke portal — jadi
   * rewrite di sini idempotent (prod tidak akan pernah match).
   */
  async rewrites() {
    const planningTarget = process.env.PLANNING_DEV_URL ?? 'http://localhost:3400';
    return {
      afterFiles: [
        { source: '/planning', destination: `${planningTarget}/planning` },
        { source: '/planning/:path*', destination: `${planningTarget}/planning/:path*` },
      ],
      // Manual per bahasa (2026-11): `/download/manual-<bahasa>.pdf` (mis.
      // manual-en.pdf dari APP_MANUAL_URL_EN) yang BELUM ada → manual Bahasa
      // Indonesia, bukan 404. Fallback hanya berjalan bila file public tidak
      // ditemukan, jadi begitu manual-en.pdf diunggah, file itu yang dipakai.
      fallback: [{ source: '/download/manual-:lang.pdf', destination: '/download/manual.pdf' }],
    };
  },
  webpack: (config, { isServer }) => {
    // Resolve `.js` import paths ke `.ts`/`.tsx` (NodeNext-style imports kita
    // pakai `.js` extension biar kompatibel dengan tsx + Node ESM; webpack
    // default tidak auto-strip jadi perlu hint ini).
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };

    // face-api.js bawa Node-only modules yang tidak ada di browser.
    // Stub mereka jadi false supaya webpack skip saat bundle untuk client.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        encoding: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
