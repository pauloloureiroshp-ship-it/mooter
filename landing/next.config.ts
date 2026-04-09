import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Vercel deployment works out of the box; standalone output is used when
  // self-hosting (Docker, Railway, Fly). Toggled via env.
  ...(process.env.FRUGAL_LANDING_STANDALONE === '1' && { output: 'standalone' as const }),
};

export default nextConfig;
