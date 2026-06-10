// Wave 42.B — changelog now pulls live from GitHub releases with a static fallback.
// Pure-logic unit tests (node-env vitest, no RTL — same pattern as the rest of landing).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toEntry, toEntries, isShown, FALLBACK, type GhRelease } from './_lib';

const rel = (over: Partial<GhRelease>): GhRelease => ({
  tag_name: 'v1.0.0',
  name: null,
  published_at: '2026-06-09T21:33:47Z',
  body: null,
  html_url: 'https://github.com/x/y/releases/tag/v1.0.0',
  prerelease: false,
  draft: false,
  ...over,
});

describe('Wave 42.B changelog — release filtering', () => {
  it('keeps published v1.x.y releases, drops drafts and pre-1.0/nightly', () => {
    expect(isShown(rel({ tag_name: 'v1.23.0-bugfix-trinity' }))).toBe(true);
    expect(isShown(rel({ tag_name: 'v0.8.0' }))).toBe(false);
    expect(isShown(rel({ tag_name: 'v1.23.0', draft: true }))).toBe(false);
    expect(isShown(rel({ tag_name: 'nightly-2026-06-09' }))).toBe(false);
  });
});

describe('Wave 42.B changelog — toEntry parsing', () => {
  it('parses a markdown body into headline + bullet items, stripping ** and `', () => {
    const e = toEntry(
      rel({
        name: 'v1.23.0 Bug Fix Trinity',
        body: '## Highlights\nWorkflow **native deps** fixed.\n- MLWR subagent visibility in `mooter digest`\n- Honest savings caveat',
      }),
    );
    expect(e.version).toBe('v1.23.0 Bug Fix Trinity');
    expect(e.date).toBe('2026-06-09');
    expect(e.headline).toBe('Workflow native deps fixed.');
    expect(e.items).toEqual([
      'MLWR subagent visibility in mooter digest',
      'Honest savings caveat',
    ]);
  });

  it('falls back to tag_name + a default headline when body is empty', () => {
    const e = toEntry(rel({ tag_name: 'v1.22.0', name: null, body: '' }));
    expect(e.version).toBe('v1.22.0');
    expect(e.headline).toBe('Release notes on GitHub.');
    expect(e.items).toEqual([]);
  });

  it('caps bullet items at 8', () => {
    const body = Array.from({ length: 12 }, (_, i) => `- item ${i}`).join('\n');
    expect(toEntry(rel({ body })).items).toHaveLength(8);
  });
});

describe('Wave 42.B changelog — toEntries + fallback', () => {
  it('filters, maps and caps the list at 20', () => {
    const releases = Array.from({ length: 25 }, (_, i) => rel({ tag_name: `v1.${i}.0` }));
    expect(toEntries(releases)).toHaveLength(20);
  });

  it('curated FALLBACK is non-empty and current (includes v1.23.0)', () => {
    expect(FALLBACK.length).toBeGreaterThan(0);
    expect(FALLBACK[0].version).toContain('v1.23.0');
  });
});

describe('Wave 42.B changelog — page wiring (no unsafe HTML, ISR on)', () => {
  const page = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
  it('fetches GitHub releases with ISR revalidate and never injects raw HTML', () => {
    expect(page).toContain('api.github.com/repos/');
    expect(page).toContain('export const revalidate = 3600');
    expect(page).not.toContain('dangerouslySetInnerHTML');
  });
});
