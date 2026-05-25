/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Landing site cuma serve static content + 1-2 link ke portal/api.
  // Tidak butuh transpilePackages atau webpack custom.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
