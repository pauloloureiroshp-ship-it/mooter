// Pure changelog helpers (Wave 42.B) — kept out of page.tsx so they unit-test in
// the node-env landing vitest without rendering an async server component.

export const REPO = 'pauloloureiroshp-ship-it/mooter';

export interface Entry {
  version: string;
  date: string;
  headline: string;
  items: string[];
  url?: string;
}

export interface GhRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  body: string | null;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

// Curated fallback — shown only if the GitHub API is unreachable at build/revalidate.
export const FALLBACK: Entry[] = [
  {
    version: 'v1.23.0 — Bug Fix Trinity',
    date: '2026-06-09',
    headline: 'Workflow native deps + MLWR subagent visibility + honest savings caveat',
    items: [
      'mooter digest now folds subagent dispatches into the tier mix — delegation is no longer invisible.',
      'Actionable error when the workflow engine hits missing native deps.',
      'Honest "explain saved" caveat (delegation + inline-Opus reality).',
    ],
  },
  {
    version: 'v1.21.1 — Historic',
    date: '2026-06-08',
    headline: 'Spawn agents default + orchestration + security framework',
    items: [
      'Spawn agents local-first by default, isolated in a 4-layer bubblewrap sandbox.',
      'Cross-session intelligence: mooter sessions watch/quota/handoff across all projects.',
      'Worktree Conductor: atomic locks + heartbeats serialize git push/tag/deploy.',
      'Security framework: mooter security audit + spawn-test (real CVE escape test).',
    ],
  },
];

/** A release is shown only if it is a published v1.x.y tag (skip drafts + pre-1.0/nightly). */
export function isShown(r: Pick<GhRelease, 'tag_name' | 'draft'>): boolean {
  return !r.draft && /^v1\.\d+\.\d+/.test(r.tag_name);
}

// Convert a GitHub release into a changelog entry. Body stays plain text — bullet
// lines become list items; nothing is rendered as HTML, so remote content is safe.
export function toEntry(r: GhRelease): Entry {
  const lines = (r.body ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const items: string[] = [];
  let headline = '';
  for (const line of lines) {
    const bullet = line.match(/^[-*]\s+(.*)$/);
    const clean = (bullet ? bullet[1] : line).replace(/\*\*/g, '').replace(/`/g, '');
    if (bullet) {
      if (items.length < 8) items.push(clean);
    } else if (!headline && !line.startsWith('#')) {
      headline = clean.slice(0, 200);
    }
  }
  return {
    version: r.name?.trim() || r.tag_name,
    date: r.published_at ? r.published_at.slice(0, 10) : '',
    headline: headline || 'Release notes on GitHub.',
    items,
    url: r.html_url,
  };
}

export function toEntries(releases: GhRelease[]): Entry[] {
  return releases.filter(isShown).map(toEntry).slice(0, 20);
}
