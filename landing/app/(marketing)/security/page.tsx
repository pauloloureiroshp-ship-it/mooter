import type { Metadata } from 'next';
import Link from 'next/link';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import Dotgrid from '@/components/Dotgrid';

export const metadata: Metadata = {
  title: 'Sandbox security — 4 layers | Mooter',
  description:
    'Mooter spawns run inside a 4-layer sandbox (network, filesystem, secrets, config). Mandatory — no --no-sandbox. Verified against the CVE-2025-59528 escape scenario on real bubblewrap.',
};

// Wave 60 — design redesign (port of stubs.jsx SecurityArtboard into the real
// info page). Content kept from the PR #179 scaffold; layout adopts the mock's
// eyebrow + headline + numbered layers + audit commands. Single rose accent.

const layers: { title: string; body: string }[] = [
  {
    title: 'Network egress',
    body: 'An empty network namespace for isolated spawns — a local agent has no route off the machine.',
  },
  {
    title: 'Filesystem boundary',
    body: 'Read-only root, exactly one writable worktree, and secret directories masked out of view.',
  },
  {
    title: 'Secrets scoping',
    body: 'Cleared env plus an explicit whitelist — provider API keys are excluded from local spawns.',
  },
  {
    title: 'Config protection',
    body: 'Your settings stay read-only. A spawned agent cannot rewrite the rules it runs under.',
  },
];

export default function SecurityPage() {
  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      <Dotgrid />
      <div
        className="m-pad"
        style={{ position: 'relative', maxWidth: 820, margin: '0 auto', padding: '72px 40px' }}
      >
        <Eyebrow>Security</Eyebrow>
        <h1
          style={{
            fontSize: 'clamp(34px, 5vw, 52px)',
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 1.04,
            margin: '0 0 12px',
          }}
        >
          The 4-layer sandbox, in the open.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.6, maxWidth: 640, marginBottom: 36 }}>
          CVE-2025-59528 — the Antigravity sandbox escape (CVSS 10.0) — is why Mooter ships sandboxing
          as mandatory. There is no{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>--no-sandbox</code>: when no backend can enforce
          these layers, the orchestrator <strong>refuses to spawn</strong> and tells you what to install.
        </p>
        {/* 2026-08-27 · esta frase dizia «Every spawned agent runs inside four isolation
            layers». Não é falso, mas escondia metade: `sandbox/detect.ts` devolve
            `bubblewrap` em Linux, `seatbelt` em macOS e **`none` em Windows** — e em
            Windows não corre agente nenhum, sandboxed ou não. Escrito como estava,
            um utilizador de Windows lia «todo o agente que lanço está protegido»
            quando o que se passa é que não lança nenhum.
            A recusa é a parte mais forte da história e estava por dizer:
            `detect.ts:3-5` — «There is NO unsandboxed mode … the orchestrator refuses
            to spawn and tells the user how to install one» — e `fanout.ts:126-130`
            reporta a tarefa como «unavailable» com a razão real em vez de a correr
            à solta. É por isso que agora está escrito ao contrário: primeiro a
            recusa, depois a cobertura por plataforma na linha abaixo. */}
        <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.6, maxWidth: 640, marginBottom: 36 }}>
          Backends today: <strong>Linux</strong> via bubblewrap, <strong>macOS</strong> via Seatbelt
          (<code style={{ fontFamily: 'var(--mono)' }}>sandbox-exec</code>). <strong>Windows</strong> has
          no backend yet — local spawns are reported unavailable, never run unprotected.
        </p>

        <ol
          className="m-stack"
          style={{
            margin: '0 0 36px',
            padding: 0,
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          {layers.map((l, i) => (
            <li key={l.title}>
              <Card padding={20} style={{ height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ color: 'var(--color-accent)', fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: '-0.015em' }}>{l.title}</span>
                </div>
                <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.55, margin: '8px 0 0' }}>
                  {l.body}
                </p>
              </Card>
            </li>
          ))}
        </ol>

        <Card accent padding={24}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Verify it yourself</div>
          <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>
            <code style={{ fontFamily: 'var(--mono)' }}>mooter security audit</code> reports the layers
            active on your host. <code style={{ fontFamily: 'var(--mono)' }}>mooter security spawn-test</code>{' '}
            runs a real escape attempt and must block reading{' '}
            <code style={{ fontFamily: 'var(--mono)' }}>~/.ssh</code>, writing outside the worktree, and
            leaking the API key.
          </p>
        </Card>

        <div
          className="m-stack"
          style={{ marginTop: 28, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <Link href="/" style={{ color: 'var(--color-accent)', fontSize: 14 }}>
            ← Back home
          </Link>
          <span style={{ fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>
            open source, MIT · audit the sandbox on GitHub
          </span>
        </div>
      </div>
    </section>
  );
}
