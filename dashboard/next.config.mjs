/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dashboard is local-only. Reduce telemetry + ensure strict mode.
  reactStrictMode: true,
  // Explicitly disable telemetry (defense-in-depth; the user should also
  // run `next telemetry disable` once before starting).
  experimental: {},
};

export default nextConfig;
