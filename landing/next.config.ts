import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Vercel deployment works out of the box; standalone output is used when
  // self-hosting (Docker, Railway, Fly). Toggled via env.
  ...(process.env.FRUGAL_LANDING_STANDALONE === '1' && { output: 'standalone' as const }),
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};

export default nextConfig;
