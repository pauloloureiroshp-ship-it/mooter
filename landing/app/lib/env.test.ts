import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// We can't import app/lib/env.ts directly in a test — it throws at import if
// env is missing, and Vitest runs with whatever env the shell has. Instead,
// we re-declare the same schema here and prove the rules hold. Keep in sync
// with env.ts.
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .refine((v) => v.endsWith('.supabase.co'), { message: 'must be a *.supabase.co URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_SITE_URL: z.string().url().default('https://mooter.ai'),
  NEXT_PUBLIC_MOOTER_HUB_URL: z.string().url().default('https://mooter-hub.frugal-hub.workers.dev'),
  NEXT_PUBLIC_FRUGAL_HUB_URL: z.string().url().optional(),
});

describe('env schema', () => {
  it('accepts a valid production-like config', () => {
    const result = clientSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://eymtobwinevywmmlmxqa.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y',
      NEXT_PUBLIC_SITE_URL: 'https://mooter.ai',
      NEXT_PUBLIC_MOOTER_HUB_URL: 'https://mooter-hub.frugal-hub.workers.dev',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing SUPABASE_URL — the P1-OAuth bug class', () => {
    const result = clientSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'NEXT_PUBLIC_SUPABASE_URL')).toBe(true);
    }
  });

  it('rejects non-supabase.co URLs (typosquat guard)', () => {
    const result = clientSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://supabase-fake.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y',
    });
    expect(result.success).toBe(false);
  });

  it('rejects too-short anon key', () => {
    const result = clientSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://eymtobwinevywmmlmxqa.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('fills SITE_URL + HUB_URL with sensible defaults', () => {
    const result = clientSchema.safeParse({
      NEXT_PUBLIC_SUPABASE_URL: 'https://eymtobwinevywmmlmxqa.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NEXT_PUBLIC_SITE_URL).toBe('https://mooter.ai');
      expect(result.data.NEXT_PUBLIC_MOOTER_HUB_URL).toBe('https://mooter-hub.frugal-hub.workers.dev');
    }
  });
});
