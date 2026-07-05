import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { execSync } from 'child_process';

// Live Preview MP2 · red-team loop hole #2(b): the Mooter cockpit's App Stage frames this
// dev server in a VS Code webview <iframe>. `X-Frame-Options: DENY` would make Chromium refuse
// to render the frame regardless of the webview's own CSP, so we OMIT it in development only.
// Production is unchanged — clickjacking protection stays on for the deployed mooter.ai site.
// `next dev` sets NODE_ENV=development; `next build`/`start` set production.
const IS_DEV = process.env.NODE_ENV !== 'production';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  ...(IS_DEV ? [] : [{ key: 'X-Frame-Options', value: 'DENY' }]),
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
];

// Build-time SHA for the statusline + footer. Vercel exposes
// VERCEL_GIT_COMMIT_SHA in production; locally we fall back to git, then
// to "dev" if neither is available.
function resolveBuildSha() {
  if (process.env.NEXT_PUBLIC_BUILD_SHA) return process.env.NEXT_PUBLIC_BUILD_SHA;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', timeout: 1500 }).trim();
  } catch {
    return 'dev';
  }
}

// Live Edit (MP5.0) — dev-only source-location stamping. code-inspector-plugin stamps
// `data-insp-path="file:line:col:tag"` on every JSX element so the Live Preview's in-app tap can
// map a clicked element back to its source. Wired ONLY when Turbopack runs (`npm run dev:inspect`);
// plain `next dev` (webpack) and `next build` ignore the `turbopack` key, and NODE_ENV=production
// short-circuits it here too, so the attribute NEVER ships to production. `hotKeys:false` disables
// the plugin's own overlay/hotkey — our origin-locked tap is the sole driver. Lazy `require` so a
// prod build with pruned devDeps never has to resolve the module; absent plugin → click-to-code
// degrades honestly (the tap reports "sem source-map").
function liveEditTurbopack(): NextConfig['turbopack'] | undefined {
  if (!IS_DEV) return undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { codeInspectorPlugin } = require('code-inspector-plugin');
    return { rules: codeInspectorPlugin({ bundler: 'turbopack', hotKeys: false }) } as NextConfig['turbopack'];
  } catch {
    return undefined;
  }
}
const liveEditTB = liveEditTurbopack();

const nextConfig: NextConfig = {
  reactStrictMode: false,
  ...(liveEditTB && { turbopack: liveEditTB }),
  // Vercel deployment works out of the box; standalone output is used when
  // self-hosting (Docker, Railway, Fly). Toggled via env.
  ...(process.env.FRUGAL_LANDING_STANDALONE === '1' && { output: 'standalone' as const }),
  env: {
    NEXT_PUBLIC_BUILD_SHA: resolveBuildSha(),
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};

// Sprint 8.1 — Sentry wrapping.
//
// withSentryConfig injects source-map upload, tunnelling and server-side
// release detection. It is a NO-OP at build time when SENTRY_AUTH_TOKEN +
// NEXT_PUBLIC_SENTRY_DSN are both absent, so local builds without Sentry
// credentials still succeed. In CI/Vercel, set both to enable upload.
//
// Options are intentionally conservative:
//   - silent=true in CI to avoid log spam
//   - widenClientFileUpload=true so source maps cover the whole client bundle
//   - disableLogger=true strips Sentry's console.logger calls from the bundle
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
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      reactComponentAnnotation: { enabled: false },
    })
  : nextConfig;
