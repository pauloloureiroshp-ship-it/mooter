import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import InstallCommand from './InstallCommand';

export const metadata: Metadata = {
  title: 'Install mooter — one command',
  description: 'One command. Your whole stack, herded. Mooter auto-detects your GPU, subscriptions and recommends packs.',
};

const cards = [
  { icon: '🔍', title: 'Hardware probe', body: 'Detects your GPU, VRAM, and installed Ollama models.' },
  { icon: '🔑', title: 'Subscription mapping', body: 'Reads your Anthropic / OpenAI / Google subscription tiers.' },
  { icon: '🐮', title: 'Pack recommendations', body: 'Suggests 3 Moo Packs that fit your stack.' },
];

export default function InstallPage() {
  return (
    <section style={{ maxWidth: 920, margin: '0 auto', padding: '72px 40px' }}>
      <Eyebrow>Install</Eyebrow>
      <h1 style={{ fontSize: 'clamp(38px, 6vw, 60px)', fontWeight: 700, margin: '0 0 12px' }}>
        One command. Your whole stack, herded.
      </h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 620, marginBottom: 32 }}>
        No proxy, no config files. Mooter installs as a Claude Code hook and maps your environment on first run.
      </p>

      <InstallCommand command="bash <(curl -fsSL https://mooter.ai/install.sh)" />

      <div className="install-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 40 }}>
        {cards.map((c) => (
          <Card key={c.title}>
            <div style={{ fontSize: 24 }} aria-hidden="true">{c.icon}</div>
            <div style={{ fontWeight: 600, marginTop: 10 }}>{c.title}</div>
            <p style={{ color: 'var(--color-muted)', fontSize: 14, marginTop: 6 }}>{c.body}</p>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 36, color: 'var(--color-term-dim)', fontFamily: 'var(--mono)', fontSize: 14 }}>
        $ claude <span style={{ color: 'var(--color-text)' }}>&ldquo;rename this variable&rdquo;</span>
        <div style={{ marginTop: 4 }}>↳ mooter routed to <span style={{ color: 'var(--color-green)' }}>T0 local</span> · saved this call</div>
        <div style={{ marginTop: 8, fontStyle: 'italic', fontSize: 12 }}>
          *illustrative — mooter runs entirely in your terminal after install; no sign-in required.
        </div>
      </div>
      <style>{`@media (max-width: 768px){ .install-cards{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
