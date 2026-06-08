import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Spawn agents — local-first, sandboxed, by default | Mooter',
  description:
    'Mooter spawns coding agents on your machine, each isolated in a git worktree inside a 4-layer sandbox. No --no-sandbox. Verified against the CVE-2025-59528 escape scenario.',
};

// Wave 33.5 Block G.1 — info page (scaffold; CC Design will redesign).
export default function SpawnPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 prose">
      <h1>Spawn agents — local-first, by default</h1>
      <p>
        <code>mooter spawn &quot;fix bug in Hero.tsx&quot;</code> classifies the task with the same{' '}
        <code>classify.js</code> doctrine that routes everything else, cuts an isolated git worktree,
        wraps the process in a 4-layer sandbox, and streams the output to a log you can tail.
      </p>
      <h2>The 4 mandatory layers</h2>
      <ul>
        <li><strong>Network egress</strong> — <code>--unshare-net</code> for pure-compute spawns.</li>
        <li><strong>Filesystem</strong> — read-only root; the worktree is the single writable mount; secret dirs masked.</li>
        <li><strong>Secrets</strong> — cleared env + whitelist; <code>ANTHROPIC_API_KEY</code> never reaches a local spawn.</li>
        <li><strong>Config</strong> — <code>settings.json</code> read-only.</li>
      </ul>
      <p>
        There is no <code>--no-sandbox</code>. Run <code>mooter security spawn-test</code> to verify the
        sandbox blocks the escape — on real bubblewrap, every release.
      </p>
    </main>
  );
}
