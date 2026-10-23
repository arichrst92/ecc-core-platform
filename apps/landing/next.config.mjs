/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Landing site cuma serve static content + 1-2 link ke portal/api.
  // Tidak butuh transpilePackages atau webpack custom.
  images: {
    // Hanya domain ECC (CVE-2026-96889 / CVE-2026-94483: jangan izinkan host sembarang).
    remotePatterns: [
      { protocol: 'https', hostname: 'eccchurch.global' },
      { protocol: 'https', hostname: '*.eccchurch.global' },
      ...(process.env.NODE_ENV === 'production' ? [] : [{ protocol: 'http', hostname: 'localhost' }]),
    ],
  },
  async rewrites() {
    return [
      // Universal Links AASA + Android App Links assetlinks.
      // Next.js App Router exclude folder `.well-known` (dot prefix di-treat
      // sebagai private). Map ke route handler biasa di /api/well-known/*.
      // Per backend-request-universal-links-aasa-assetlinks.md (2026-09-01).
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/api/well-known/aasa',
      },
      {
        source: '/.well-known/assetlinks.json',
        destination: '/api/well-known/assetlinks',
      },
    ];
  },
};

export default nextConfig;
