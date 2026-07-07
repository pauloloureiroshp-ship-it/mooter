import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';
import { codeInspectorPlugin } from 'code-inspector-plugin';
import { execSync } from 'child_process';
import { realpathSync } from 'fs';

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

// Live Edit (FIX-MP-1 · audit P0-1) — served-tree identity. In dev, `process.cwd()` at config-eval
// time IS the dev server's own root (the tree it compiles + serves). We expose its realpath'd value
// to the client bundle so the Live Preview host can PROVE the preview it frames comes from the same
// tree it would write to. Twin worktrees (same repo, sibling paths) otherwise pass containment and
// the $0 edit lands in the WRONG tree (incident 2026-07-06 06:49). DEV-ONLY: see the `env` gate — the
// key is never emitted in production, so `process.env.NEXT_PUBLIC_LP_ROOT` tree-shakes to undefined
// on the deployed mooter.ai site and can never leak a build-machine path.
function resolveServedRoot() {
  try {
    return realpathSync(process.cwd());
  } catch {
    return process.cwd();
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // Vercel deployment works out of the box; standalone output is used when
  // self-hosting (Docker, Railway, Fly). Toggled via env.
  ...(process.env.FRUGAL_LANDING_STANDALONE === '1' && { output: 'standalone' as const }),
  env: {
    NEXT_PUBLIC_BUILD_SHA: resolveBuildSha(),
    // DEV-ONLY served-tree marker (FIX-MP-1). Absent in prod → undefined → the host fail-closes.
    ...(IS_DEV ? { NEXT_PUBLIC_LP_ROOT: resolveServedRoot() } : {}),
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ];
  },
  // Live Edit (MP5.0) · Source mapping — DOM→código como atributo compilado.
  // `code-inspector-plugin` (MIT) carimba `data-insp-path="ficheiro:linha:coluna:tag"` em
  // cada elemento JSX no build de DEV. É a verdade que o select-to-edit lê no DOM (sobrevive
  // ao React 19 e aos Server Components — a verdade vive no DOM, não no fiber).
  //
  // Wiring via o hook `webpack`, NÃO `turbopack.rules`: o dev script é `next dev` SEM
  // `--turbopack`, logo o dev server é webpack. (Se algum dia adoptarmos `--turbopack`,
  // migrar para `turbopack.rules: codeInspectorPlugin({ bundler: 'turbopack' })`.)
  //
  // DEV-ONLY: só é adicionado quando `dev === true`; o build de produção nunca o inclui, por
  // isso `data-insp-path` e o runtime do plugin são dead-code em prod (nunca chega a mooter.ai).
  // `hotKeys:false` desliga o overlay/atalho do próprio plugin — a seleção é conduzida pela
  // nossa `lp-error-tap`, não pela UI dele (evita hijack de cliques). O atributo é carimbado
  // na mesma (é um transform de build, independente do runtime do plugin).
  webpack: (config: { plugins: unknown[] }, { dev }: { dev: boolean }) => {
    if (dev) {
      config.plugins.push(codeInspectorPlugin({ bundler: 'webpack', hotKeys: false }));
    }
    return config;
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
