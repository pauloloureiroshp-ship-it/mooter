import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dashboard is local-only. Reduce telemetry + ensure strict mode.
  reactStrictMode: true,
  // Explicitly disable telemetry (defense-in-depth; the user should also
  // run `next telemetry disable` once before starting).
  experimental: {},
};

// Sprint 8.2 — Sentry wrapping.
// No-op at build time unless both DSN + auth token are set, so local dev
// on 127.0.0.1:7820 keeps working without Sentry credentials.
const SENTRY_ENABLED =
  !!process.env.NEXT_PUBLIC_SENTRY_DSN && !!process.env.SENTRY_AUTH_TOKEN;

export default SENTRY_ENABLED
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      disableLogger: true,
      reactComponentAnnotation: { enabled: false },
    })
  : nextConfig;
