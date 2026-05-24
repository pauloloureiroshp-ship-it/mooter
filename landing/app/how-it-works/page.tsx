/**
 * /how-it-works — commercial visualisation of the Mooter routing pipeline.
 *
 * Strategy: show the *shape* of how routing works without revealing the
 * specific thresholds, seed counts, algorithms, or specialists that make it
 * work in production. We trade depth for clarity.
 *
 * The full technical strategy lives in:
 *   ~/frugal/docs/strategy/FLOWCHART.md
 *   ~/frugal/docs/strategy/ROUTING.md
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How Mooter routes — Mooter',
  description:
    'A 7-layer pipeline picks the right model for every prompt. Local for benign work, frontier for hard reasoning. Honest about what we don\'t show.',
};

const TIERS = [
  {
    label: 'T0',
    color: 'var(--t0-green)',
    bg: 'color-mix(in srgb, var(--t0-green) 10%, transparent)',
    title: 'Local',
    use: 'Schema-defined, low entropy',
    examples: 'Summaries · JSON extract · format transforms',
    cost: 'Free (your hardware)',
  },
  {
    label: 'T1',
    color: 'var(--t1-blue)',
    bg: 'color-mix(in srgb, var(--t1-blue) 10%, transparent)',
    title: 'Fast cloud',
    use: 'Short, single-shot, benign',
    examples: 'Commit messages · docstrings · explain error',
    cost: 'Cents per thousand calls',
  },
  {
    label: 'T2',
    color: 'var(--t2-purple)',
    bg: 'color-mix(in srgb, var(--t2-purple) 10%, transparent)',
    title: 'Reasoning',
    use: 'Multi-step, 1–3 files',
    examples: 'Bug investigation · refactor · technical plan',
    cost: 'Cached, mid-tier',
  },
  {
    label: 'T3',
    color: 'var(--t3-red)',
    bg: 'color-mix(in srgb, var(--t3-red) 10%, transparent)',
    title: 'Architecture',
    use: '> 3 files, prod, secrets',
    examples: 'Architecture · system refactor · safety-critical',
    cost: 'Premium, used sparingly',
  },
];

const LAYERS = [
  { n: '01', title: 'Cache',       sub: 'Have we answered this before?' },
  { n: '02', title: 'Guardrails',  sub: 'Touches anything sensitive?' },
  { n: '03', title: 'Classify',    sub: 'What shape is this task?' },
  { n: '04', title: 'Pick tier',   sub: 'Smallest model that fits.' },
  { n: '05', title: 'Cascade',     sub: 'Wrong? Escalate once, learn.' },
];

export default function HowItWorksPage() {
  return (
    <main style={{ background: 'var(--beige-bg)', minHeight: '100vh' }}>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 880, margin: '0 auto', padding: '5rem 1.5rem 2rem' }}>
        <div style={{
          color: 'var(--rose)',
          fontSize: '0.78rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          marginBottom: '1rem',
        }}>
          HOW MOOTER ROUTES
        </div>
        <h1 style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
          fontWeight: 400,
          lineHeight: 1.05,
          color: 'var(--ink)',
          margin: '0 0 1.5rem',
          letterSpacing: '-0.02em',
        }}>
          The right model,<br />
          every prompt,<br />
          <span style={{ color: 'var(--rose)' }}>with the receipts.</span>
        </h1>
        <p style={{
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '1.18rem',
          lineHeight: 1.6,
          color: 'var(--ink-2)',
          maxWidth: 640,
          margin: '0 0 1rem',
        }}>
          Most LLM routers chase the wrong target — diff size, prompt length,
          leaderboard rankings. Mooter routes by the <em>shape of the task</em>:
          schema-defined work goes to local or fast cloud; reasoning over many
          files goes to the heavy hitters. Everything in between is plumbing.
        </p>
        <p style={{ color: 'var(--muted-ink)', fontSize: '0.95rem' }}>
          Five layers. One decision. Honest about what we don&rsquo;t show you.
        </p>
      </section>

      {/* ── Pipeline diagram ─────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{
          background: 'var(--beige-card)',
          border: '1px solid var(--beige-line)',
          borderRadius: 14,
          padding: '3rem 2rem',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: '0.6rem',
            alignItems: 'stretch',
          }}>
            {LAYERS.map((layer, idx) => (
              <div key={layer.n} style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <div style={{
                  flex: 1,
                  padding: '1.2rem 1rem',
                  background: 'var(--beige-card-2)',
                  border: '1px solid var(--beige-line)',
                  borderRadius: 10,
                  textAlign: 'center',
                }}>
                  <div style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '0.7rem',
                    color: 'var(--faint-ink)',
                    letterSpacing: '0.12em',
                    marginBottom: '0.5rem',
                  }}>
                    {layer.n}
                  </div>
                  <div style={{
                    fontWeight: 700,
                    fontSize: '1.05rem',
                    color: 'var(--ink)',
                    marginBottom: '0.4rem',
                  }}>
                    {layer.title}
                  </div>
                  <div style={{
                    fontSize: '0.78rem',
                    color: 'var(--muted-ink)',
                    lineHeight: 1.4,
                  }}>
                    {layer.sub}
                  </div>
                </div>
                {idx < LAYERS.length - 1 && (
                  <div style={{
                    color: 'var(--beige-line-2)',
                    fontSize: '1.5rem',
                    padding: '0 0.2rem',
                  }}>
                    →
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '2.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid var(--beige-line)',
            fontSize: '0.85rem',
            color: 'var(--muted-ink)',
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <span>~100ms p50 · observable at every layer · no black box</span>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--faint-ink)' }}>
              v3 · 2026-05-07
            </span>
          </div>
        </div>
      </section>

      {/* ── Tiers ────────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '3rem 1.5rem' }}>
        <h2 style={{
          fontFamily: 'Georgia, serif',
          fontSize: '2rem',
          fontWeight: 400,
          letterSpacing: '-0.01em',
          color: 'var(--ink)',
          marginBottom: '0.5rem',
        }}>
          Four tiers. One rule.
        </h2>
        <p style={{
          color: 'var(--muted-ink)',
          marginBottom: '2rem',
          maxWidth: 720,
          fontSize: '1.05rem',
          lineHeight: 1.6,
        }}>
          The mother rule isn&rsquo;t diff size. It&rsquo;s <em>task shape</em>.
          Schema-defined and low-entropy → small. Reasoning over many files
          → large. The rest is style.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}>
          {TIERS.map((tier) => (
            <div key={tier.label} style={{
              background: 'var(--beige-card)',
              border: `1px solid ${tier.color}`,
              borderTopWidth: 3,
              borderRadius: 10,
              padding: '1.5rem 1.25rem',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                marginBottom: '0.75rem',
              }}>
                <span style={{
                  background: tier.bg,
                  color: tier.color,
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  padding: '0.15rem 0.55rem',
                  borderRadius: 6,
                  fontFamily: 'var(--mono)',
                }}>
                  {tier.label}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{tier.title}</span>
              </div>
              <div style={{
                fontSize: '0.82rem',
                color: 'var(--muted-ink)',
                marginBottom: '0.5rem',
                fontStyle: 'italic',
              }}>
                {tier.use}
              </div>
              <div style={{
                fontSize: '0.88rem',
                color: 'var(--ink-2)',
                lineHeight: 1.5,
                marginBottom: '0.75rem',
              }}>
                {tier.examples}
              </div>
              <div style={{
                fontSize: '0.78rem',
                color: 'var(--faint-ink)',
                fontFamily: 'var(--mono)',
                paddingTop: '0.6rem',
                borderTop: '1px solid var(--beige-line)',
              }}>
                {tier.cost}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Subscription-aware ───────────────────────────────────── */}
      <section style={{
        background: 'var(--beige-bg-2)',
        padding: '4rem 1.5rem',
        marginTop: '2rem',
      }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: 'Georgia, serif',
            fontSize: '1.7rem',
            fontWeight: 400,
            color: 'var(--ink)',
            marginBottom: '1rem',
          }}>
            Routing aware of how you actually pay.
          </h2>
          <p style={{
            fontSize: '1.05rem',
            color: 'var(--ink-2)',
            lineHeight: 1.7,
            maxWidth: 700,
          }}>
            Mooter knows whether you&rsquo;re on Pro, Max, pay-as-you-go, or a
            hybrid setup — and re-weights tier choices accordingly. On Claude
            Max, marginal cost inside the window is zero, so cached cloud
            beats local on latency without costing more. On PAYG, local wins
            aggressively for benign tasks. We haven&rsquo;t seen anyone else
            ship this. We think they should.
          </p>
        </div>
      </section>

      {/* ── Honest about what we don't show ──────────────────────── */}
      <section style={{ maxWidth: 880, margin: '0 auto', padding: '4rem 1.5rem' }}>
        <h2 style={{
          fontFamily: 'Georgia, serif',
          fontSize: '1.7rem',
          fontWeight: 400,
          color: 'var(--ink)',
          marginBottom: '1.5rem',
        }}>
          Honest about what we don&rsquo;t show.
        </h2>
        <p style={{
          color: 'var(--muted-ink)',
          marginBottom: '2rem',
          fontSize: '0.95rem',
          maxWidth: 640,
        }}>
          A few things we hold back, on purpose, with our reasoning:
        </p>

        {[
          {
            head: 'The exact thresholds.',
            body: 'Cosine similarity for cache hits, confidence cut-off for the LLM-as-judge fallback, the size of our seed dataset — these are the dials we tune every week against a private golden set. Publishing them locks us in and helps competitors who wouldn\'t cite us anyway.',
          },
          {
            head: 'Which specialist models we route to.',
            body: 'For SQL-heavy work, PT-PT cultural prompts, PT-BR cultural prompts, and tool-use benchmarks, we route to specialists that beat frontier generalists on those exact benchmarks. The specific picks change as new releases land. We\'ll publish a quarterly transparency note instead.',
          },
          {
            head: 'The exact savings number.',
            body: 'We say 65–82% versus all-Opus baseline because that\'s the honest range across realistic workflows. Vendor blogs promise 95% — those are MT-Bench numbers that don\'t generalise. Your dashboard shows your actual savings, with estimates marked ~ and audit-trail savings unmarked.',
          },
        ].map((item) => (
          <div key={item.head} style={{
            background: 'var(--beige-card)',
            border: '1px solid var(--beige-line)',
            borderLeft: '3px solid var(--rose)',
            borderRadius: 8,
            padding: '1.25rem 1.5rem',
            marginBottom: '1rem',
          }}>
            <div style={{
              fontWeight: 700,
              color: 'var(--ink)',
              marginBottom: '0.4rem',
              fontSize: '1rem',
            }}>
              {item.head}
            </div>
            <div style={{
              fontSize: '0.95rem',
              color: 'var(--ink-2)',
              lineHeight: 1.6,
            }}>
              {item.body}
            </div>
          </div>
        ))}

        <p style={{
          marginTop: '2rem',
          fontSize: '0.9rem',
          color: 'var(--muted-ink)',
          lineHeight: 1.6,
        }}>
          What <em>is</em> public: the pipeline shape, the four tiers, the
          fact that we run shadow routing on 100% of traffic from day one,
          and the methodology behind the savings number. The full technical
          strategy is open-source — see the{' '}
          <a href="/methodology" style={{ color: 'var(--rose)', textDecoration: 'underline' }}>
            methodology page
          </a>
          {' '}or the routing strategy document on GitHub.
        </p>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section style={{
        maxWidth: 880,
        margin: '0 auto',
        padding: '3rem 1.5rem 6rem',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontFamily: 'Georgia, serif',
          fontSize: '2rem',
          fontWeight: 400,
          color: 'var(--ink)',
          marginBottom: '1rem',
        }}>
          See it on your own work.
        </h2>
        <p style={{
          color: 'var(--ink-2)',
          fontSize: '1.05rem',
          marginBottom: '2rem',
          maxWidth: 540,
          margin: '0 auto 2rem',
        }}>
          Install in two commands. Run normally. After a few days of telemetry,
          your dashboard tells you what you saved — with estimates marked
          honestly.
        </p>
        <div style={{
          display: 'inline-block',
          background: 'var(--ink)',
          color: '#F2ECDF',
          fontFamily: 'var(--mono)',
          fontSize: '0.95rem',
          padding: '0.9rem 1.4rem',
          borderRadius: 8,
          marginBottom: '1rem',
        }}>
          curl -sSL mooter.ai/install.sh | sh
        </div>
        <div>
          <a href="/" style={{
            color: 'var(--rose)',
            fontSize: '0.95rem',
            textDecoration: 'underline',
          }}>
            ← back to home
          </a>
        </div>
      </section>
    </main>
  );
}
