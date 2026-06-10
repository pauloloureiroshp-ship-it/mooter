// Wave 44 — OAuth sign-in polish. Source-level assertions (the (app) shell is a
// big client component; landing vitest is node-env, no RTL — same pattern as
// login-hero/dark-parity).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');
const LAYOUT = read('layout.tsx');
const BANNER = read('../_components/AuthErrorBanner.tsx');
const CALLBACK = read('../auth/callback/route.ts');

describe('Wave 44 — sign-in button has an in-flight loading state', () => {
  it('LoginHero tracks loading and disables + relabels the button while redirecting', () => {
    // a useState loading flag set on click
    expect(LAYOUT).toMatch(/const \[loading, setLoading\] = useState\(false\)/);
    expect(LAYOUT).toContain('setLoading(true)');
    // button reflects it
    expect(LAYOUT).toContain('disabled={loading}');
    expect(LAYOUT).toContain('aria-busy={loading}');
    expect(LAYOUT).toContain('Connecting to GitHub…');
    // hover handlers must not fight the loading style
    expect(LAYOUT).toMatch(/onMouseEnter=\{e => \{ if \(!loading\)/);
  });

  it('still uses the privacy-first minimal scopes (no regression)', () => {
    expect(LAYOUT).toContain('scopes=read:user,user:email');
    // public_repo must not be a GRANTED scope (it may appear in a comment).
    expect(LAYOUT).not.toMatch(/scopes=[^`'"]*public_repo/);
  });
});

describe('Wave 44 — AuthErrorBanner is reason-aware (honest, not fabricated)', () => {
  it('maps denied/network/failed to distinct messages with a generic fallback', () => {
    expect(BANNER).toMatch(/const MESSAGES: Record<string, string>/);
    for (const reason of ['denied', 'network', 'failed']) {
      expect(BANNER).toContain(`${reason}:`);
    }
    // reads the reason from the URL and only trusts known reasons
    expect(BANNER).toContain("params.get('reason')");
    expect(BANNER).toMatch(/r in MESSAGES \? .* : 'failed'/);
    // denied copy reassures about scope; never claims code access
    expect(BANNER).toContain('read:user + user:email');
    // retry affordance preserved
    expect(BANNER).toContain('Retry →');
  });
});

describe('Wave 44 — callback forwards a derived reason', () => {
  it('distinguishes denied (access_denied) vs network vs failed', () => {
    // query-error early return (code-flow denial)
    expect(CALLBACK).toContain("searchParams.get('error')");
    expect(CALLBACK).toMatch(/access_denied' \? 'denied' : 'failed'/);
    // implicit-flow paths
    expect(CALLBACK).toContain('/?auth=error&reason=network');
    expect(CALLBACK).toContain('/?auth=error&reason=failed');
    expect(CALLBACK).toContain('/?auth=error&reason=denied');
    // no bare /?auth=error left behind (every error path carries a reason);
    // a quote/backtick right after `error` means no &reason was appended.
    expect(CALLBACK).not.toMatch(/auth=error['"`]/);
  });
});
