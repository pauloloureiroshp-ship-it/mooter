import type { Metadata } from 'next';
import { readFile } from 'fs/promises';
import { join } from 'path';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';

export const metadata: Metadata = {
  title: 'Privacy — your code stays yours',
  description: 'Mooter is a hook in your terminal, not a proxy. T0 stays local, prompts are hashed, telemetry is opt-in.',
};

const cards = [
  { icon: '💻', title: 'T0 stays local', body: 'When mooter routes to your local Ollama, your prompt and your code never touch a network.' },
  { icon: '🔒', title: 'Prompts hashed', body: 'We log a SHA-256 hash of each prompt — never the text itself.' },
  { icon: '🤝', title: 'Opt-in telemetry', body: 'Defaults OFF. When you turn it on, only aggregated stats leave.' },
  { icon: '🚫', title: 'Opt out anytime', body: 'Turn telemetry fully off with `mooter quiet --telemetry-off`. No prompt text is ever transmitted — only hashes and counts.' },
  { icon: '🐄', title: 'The herd stays on your machine', body: 'The 🐄×N counter and the “Moos that worked” digest are in-process runtime state only — counts and latencies, never prompt text, and none of it is sent anywhere. Tune it with `mooter quiet --verbose|--herd-quiet|--herd-off`; even `verbose` logs file paths, never their contents.' },
  { icon: '📖', title: 'Open source · audit it', body: 'Every line of mooter is on GitHub under MIT. Read the code yourself.' },
];

// D4 — how mooter differs from cloud routers/proxies on privacy.
const vsCloud: { head: string; items: string[] }[] = [
  { head: 'mooter (hook, local-first)', items: ['T0 runs on your machine — prompt never leaves', 'T1–T3 go direct to your own provider key', 'mooter never sees or stores your prompt text'] },
  { head: 'Cloud routers / proxies (e.g. LiteLLM-as-a-service, OpenRouter)', items: ['Every prompt transits a third-party server', 'That hop can log, cache or train on your text', 'You trust an extra party with your code'] },
];

const compliance: { head: string; items: string[] }[] = [
  { head: '✓ GDPR-aligned (EU)', items: ['Data minimization · purpose limitation', 'Right to access · right to erasure'] },
  { head: '✓ LGPD-aligned (Brazil)', items: ['Consentimento expresso e granular', 'Direito de acesso, correção, eliminação'] },
  { head: '✓ CCPA-aligned (California)', items: ['No sale of personal information', 'Right to know what is collected'] },
  { head: '✓ Privacy-first by design', items: ['Telemetry default OFF', 'k-anonymity threshold ≥50', 'Differential privacy noise (ε=1.0)'] },
  { head: '✓ Open source', items: ['MIT License', 'Reproducible builds', 'Independent audit welcome'] },
];

export default async function PrivacyPage() {
  // Build-time read — source of "what we collect" (IMPLEMENTATION_SPEC §10.4).
  let collected = '';
  try {
    collected = await readFile(join(process.cwd(), 'docs/data-policy.md'), 'utf-8');
  } catch {
    collected = '';
  }
  const hasPolicy = collected.includes('We collect');

  return (
    <section style={{ maxWidth: 1080, margin: '0 auto', padding: '72px 40px' }}>
      <Eyebrow>Privacy</Eyebrow>
      <h1 style={{ fontSize: 'clamp(38px, 6vw, 60px)', fontWeight: 700, margin: '0 0 10px' }}>
        Your code stays yours. Always.
      </h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 640, marginBottom: 40 }}>
        Mooter is a hook in your terminal, not a proxy through someone else&apos;s servers.
      </p>

      <div className="priv-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {cards.map((c) => (
            <Card key={c.title}>
              <div style={{ fontSize: 22 }} aria-hidden="true">{c.icon}</div>
              <div style={{ fontWeight: 600, marginTop: 8 }}>{c.title}</div>
              <p style={{ color: 'var(--color-muted)', fontSize: 13.5, marginTop: 6 }}>{c.body}</p>
            </Card>
          ))}
        </div>

        <Card accent padding={28}>
          <div style={{ fontWeight: 600, fontSize: 17, marginBottom: 16 }}>Compliance &amp; data laws</div>
          {compliance.map((b) => (
            <div key={b.head} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-green)' }}>{b.head}</div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--color-muted)', fontSize: 13.5 }}>
                {b.items.map((it) => <li key={it}>{it}</li>)}
              </ul>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
            <a href="/privacy" style={{ color: 'var(--color-accent)', fontSize: 14 }}>Read the privacy policy →</a>
            <a href="/privacy" style={{ color: 'var(--color-accent)', fontSize: 14 }}>Read the security policy →</a>
          </div>
        </Card>
      </div>

      {/* D4 — privacy vs cloud routers */}
      <div style={{ marginTop: 36 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Why a hook beats a cloud router on privacy</h2>
        <div className="priv-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {vsCloud.map((c) => (
            <Card key={c.head} padding={22}>
              <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{c.head}</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.7 }}>
                {c.items.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      </div>

      {hasPolicy ? (
        <Card style={{ marginTop: 28 }} padding={28}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>What mooter collects (telemetry, opt-in only)</div>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)', margin: 0 }}>
            {collected}
          </pre>
        </Card>
      ) : null}
      <style>{`@media (max-width: 900px){ .priv-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
