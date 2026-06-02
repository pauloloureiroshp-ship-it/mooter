import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 10 — sign-in CTA fix. The hero/nav/footer "Sign in with GitHub" links
// pointed at /auth/sign-in, which 404s (only /auth/callback + /auth/token
// exist; sign-in is the LoginHero on /dashboard, per middleware.ts). They now
// point at /dashboard. Source-level guard so the broken route never returns.
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('sign-in CTAs point to a real route', () => {
  for (const f of ['app/page.tsx', 'components/NavBar.tsx', 'components/Footer.tsx']) {
    it(`${f} has no /auth/sign-in (404) link`, () => {
      expect(read(f)).not.toContain('/auth/sign-in');
    });
  }

  it('hero CTA routes sign-in to /dashboard (LoginHero)', () => {
    expect(read('app/page.tsx')).toContain('href="/dashboard"');
  });
});
