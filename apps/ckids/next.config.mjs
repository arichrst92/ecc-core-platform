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
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
