import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cross-session intelligence | Mooter',
  description:
    'See every Claude Code session across every project on one screen — age, prompts, tier mix, estimated savings, branch, and a 5h quota forecast. Local-first, no server.',
};

// Wave 33.5 Block G.1 — info page (scaffold; CC Design will redesign).
export default function SessionsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 prose">
      <h1>Every session, one screen</h1>
      <p>
        If you run Claude Code seriously, you have three or four sessions open and they are blind to
        each other. Mooter discovers them all from the local transcripts.
      </p>
      <ul>
        <li><code>mooter sessions watch</code> — live board: age, prompts, tier mix, ~saved, branch, active workflow.</li>
        <li><code>mooter sessions quota</code> — honest 5-hour usage forecast (a local rate projection, not a server quota).</li>
        <li><code>mooter sessions handoff &lt;id&gt;</code> — context summary so another session can pick up the thread; no prompt text leaves the machine.</li>
      </ul>
      <p>It also feeds the Pastor a cross-session view, so routing advice reflects everything you do — not just this terminal.</p>
    </main>
  );
}
