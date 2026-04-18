/**
 * env.ts — centralized, validated environment-variable access.
 *
 * Why this file exists
 * --------------------
 * Before this module, every consumer of `process.env.NEXT_PUBLIC_X` did its
 * own `|| ''` fallback. That pattern silently masked missing envs — the
 * infamous P1-OAuth bug (2026-04-13) was exactly this: `loginWithGitHub()`
 * bailed without error when `NEXT_PUBLIC_SUPABASE_URL` wasn't set, so the
 * button did nothing and nobody knew why.
 *
 * This module fails fast on `import` — if a required env is missing at build
 * time, Next.js build errors. If it's missing at runtime (edge function),
 * the module throws with a clear message naming the variable.
 *
 * Usage
 * -----
 *   import { env } from '@/app/lib/env';
 *   const url = env.NEXT_PUBLIC_SUPABASE_URL;   // typed, guaranteed non-empty
 *
 * Never destructure-with-default elsewhere — pull from `env`.
 */

import { z } from 'zod';

// Client-safe envs (prefixed NEXT_PUBLIC_). These are embedded in the JS
// bundle and therefore NOT secret. Zod enforces shape + presence.
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .refine((v) => v.endsWith('.supabase.co'), { message: 'must be a *.supabase.co URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'anon key looks too short — check Supabase Dashboard → Settings → API'),
  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url()
    .default('https://mooter.ai'),
  NEXT_PUBLIC_MOOTER_HUB_URL: z
    .string()
    .url()
    .default('https://mooter-hub.frugal-hub.workers.dev'),
  // Legacy alias — some older callers still read this. Accept either, but
  // downstream code should prefer NEXT_PUBLIC_MOOTER_HUB_URL.
  NEXT_PUBLIC_FRUGAL_HUB_URL: z.string().url().optional(),
  // Sentry (Sprint 8.1). Optional — when absent the SDK init is a no-op
  // and the landing runs exactly as before. When present, must be a DSN
  // URL. Client-safe (NEXT_PUBLIC_) so the browser bundle can report.
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  // Release tracking — defaults to 'mooter-landing@unknown' when absent.
  NEXT_PUBLIC_APP_VERSION: z.string().optional(),
});

const raw = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_MOOTER_HUB_URL: process.env.NEXT_PUBLIC_MOOTER_HUB_URL,
  NEXT_PUBLIC_FRUGAL_HUB_URL: process.env.NEXT_PUBLIC_FRUGAL_HUB_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
};

const parsed = clientSchema.safeParse(raw);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // In dev, surface this aggressively. In prod it fails the build.
  throw new Error(
    `[env] Invalid/missing environment variables:\n${issues}\n\n` +
      `Fix: set them in Vercel (Project → Settings → Environment Variables) ` +
      `or in landing/.env.local for local dev.`
  );
}

export const env = parsed.data;

// Canonical hub URL — callers should import this instead of reading the
// raw var. Falls back through the legacy alias to the schema default.
export const HUB_URL =
  env.NEXT_PUBLIC_MOOTER_HUB_URL ||
  env.NEXT_PUBLIC_FRUGAL_HUB_URL ||
  'https://mooter-hub.frugal-hub.workers.dev';
