import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  poweredByHeader: false,
  images: { unoptimized: true },
  transpilePackages: ['@authbox/crypto', '@authbox/shared'],
};

export default nextConfig;
