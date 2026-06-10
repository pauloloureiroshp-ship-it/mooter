import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sandbox security — 4 layers | Mooter',
  description:
    'Mooter spawns run inside a 4-layer sandbox (network, filesystem, secrets, config). Mandatory — no --no-sandbox. Verified against the CVE-2025-59528 escape scenario on real bubblewrap.',
};

// Wave 33.5 Block G.1 — info page (scaffold; CC Design will redesign).
export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 prose">
      <h1>Security-first, or it isn&apos;t local-first</h1>
      <p>
        CVE-2025-59528 — the Antigravity sandbox escape (CVSS 10.0) — is why Mooter ships sandboxing as
        mandatory. Every spawn is wrapped in four layers, and there is no <code>--no-sandbox</code>.
      </p>
      <ol>
        <li><strong>Network egress</strong> — empty network namespace for isolated spawns.</li>
        <li><strong>Filesystem boundary</strong> — read-only root; one writable worktree; secret dirs masked.</li>
        <li><strong>Secrets scoping</strong> — cleared env + whitelist; provider keys excluded from local spawns.</li>
        <li><strong>Config protection</strong> — your settings stay read-only.</li>
      </ol>
      <p>
        <code>mooter security audit</code> reports the layers on your host; <code>mooter security spawn-test</code>{' '}
        runs a real escape attempt and must block reading <code>~/.ssh</code>, writing outside the
        worktree, and leaking the API key.
      </p>
    </main>
  );
}
