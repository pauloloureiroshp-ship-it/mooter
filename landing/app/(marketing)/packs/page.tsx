'use client';

import { useEffect, useMemo, useState } from 'react';
import Card from '@/components/Card';
import Eyebrow from '@/components/Eyebrow';
import Dotgrid from '@/components/Dotgrid';
import ProgressBar from '@/components/ProgressBar';
import RevealOnView from '../compare/RevealOnView';
import versionInfo from '../../version.json';

// Wave 60 — design-mock parity for the pack browser (PackBrowserArtboard).
// Data stays honest: packs are loaded from /packs-seed.json (the same source the
// detail pages use); the visual is adopted from the mock but every number on a
// card is computed from real seed fields. No fabricated metrics, single rose
// accent, no orange. Counts (skills/mcps/agents) are derived deterministically
// from each pack's real `models` list so they reflect actual pack composition.

interface Pack {
  id: string;
  trust: number;
  installs: number;
  min_vram_gb: number;
  domain: string;
  savings_pct: number;
  models: string[];
  summary: string;
}

// Derived, honest composition counts: how many models a pack bundles, split into
// local (skills run on local models) vs cloud. No invented data — purely a view
// over the real `models` array already in the seed.
function composition(p: Pack) {
  const local = p.models.filter((m) => !m.startsWith('claude-')).length;
  const cloud = p.models.filter((m) => m.startsWith('claude-')).length;
  return { models: p.models.length, local, cloud };
}

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [minTrust, setMinTrust] = useState(0);
  const [ready, setReady] = useState(false);

  // Load seed + restore filters from URL (acceptance: filter persists in URL params).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get('domain');
    const t = sp.get('trust');
    if (d) setDomains(d.split(',').filter(Boolean));
    if (t) setMinTrust(Number(t) || 0);
    fetch('/packs-seed.json')
      .then((r) => r.json())
      .then((j) => setPacks(j.packs ?? []))
      .catch(() => setPacks([]))
      .finally(() => setReady(true));
  }, []);

  // Persist filters to URL.
  useEffect(() => {
    if (!ready) return;
    const sp = new URLSearchParams();
    if (domains.length) sp.set('domain', domains.join(','));
    if (minTrust > 0) sp.set('trust', String(minTrust));
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [domains, minTrust, ready]);

  const allDomains = useMemo(
    () => Array.from(new Set(packs.map((p) => p.domain))).sort(),
    [packs],
  );

  // Highest-install pack is the only one flagged "trending" — derived from real
  // data, not a hand-set flag.
  const topInstalls = useMemo(
    () => packs.reduce((max, p) => Math.max(max, p.installs), 0),
    [packs],
  );

  const filtered = useMemo(
    () =>
      packs
        .filter(
          (p) =>
            (domains.length === 0 || domains.includes(p.domain)) && p.trust >= minTrust,
        )
        .sort((a, b) => b.trust - a.trust),
    [packs, domains, minTrust],
  );

  function toggleDomain(d: string) {
    setDomains((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  return (
    <section style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }}>
      <Dotgrid />
      <div style={{ position: 'relative' }}>
        <Eyebrow>Pack browser</Eyebrow>
        <div
          className="m-stack"
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 24,
            margin: '0 0 12px',
          }}
        >
          <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, margin: 0, maxWidth: 720, lineHeight: 1.05 }}>
            Tired of picking which skill, repo, or agent? <span style={{ color: 'var(--color-muted)' }}>Mooter picks. Packs deliver.</span>
          </h1>
        </div>
        <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 640, marginBottom: 36 }}>
          Domain bundles of models, skills, MCPs and scaffolds, so each prompt lands on the model best suited to that kind of work. Share with the herd.
        </p>

        <div className="packs-layout m-stack" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 28, alignItems: 'start' }}>
          {/* Filter sidebar */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Domain</div>
              {allDomains.map((d) => {
                const on = domains.includes(d);
                return (
                  <label
                    key={d}
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      padding: '5px 0',
                      fontSize: 14,
                      color: on ? 'var(--color-text)' : 'var(--color-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleDomain(d)}
                      style={{ accentColor: 'var(--color-accent)' }}
                    />
                    {d}
                  </label>
                );
              })}
            </div>

            <div>
              <div style={{ fontWeight: 600, margin: '0 0 6px' }}>Min trust score</div>
              <input
                type="range"
                min={0}
                max={100}
                value={minTrust}
                onChange={(e) => setMinTrust(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--color-accent)' }}
                aria-label="Minimum trust score"
              />
              <div className="num" style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>
                ≥ <span style={{ color: 'var(--color-text)' }}>{minTrust}</span>
              </div>
            </div>

            {/* Honest illustrative example — clearly labelled, not a live read of
                the visitor's machine. */}
            <div style={{ padding: 14, background: 'var(--color-accent-08)', border: '1px solid var(--color-accent-25)', borderRadius: 10 }}>
              <div style={{ fontSize: 12.5, color: 'var(--color-accent)', fontWeight: 600, marginBottom: 6 }}>
                Example stack
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.6, fontFamily: 'var(--mono)' }}>
                RTX 4090 · 24GB
                <br />
                Claude Max + local Ollama
                <br />
                8 local models
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 8, lineHeight: 1.5 }}>
                Illustrative — mooter detects your real setup at install time.
              </div>
            </div>
          </aside>

          {/* Card grid */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, minHeight: 22 }}>
              <span style={{ fontSize: 13.5, color: 'var(--color-muted)' }}>
                {ready && (
                  <>
                    <span className="num" style={{ color: 'var(--color-text)', fontFamily: 'var(--mono)' }}>{filtered.length}</span>{' '}
                    {filtered.length === 1 ? 'pack' : 'packs'} ·{' '}
                    <span style={{ color: 'var(--color-muted)' }}>sorted by trust score</span>
                  </>
                )}
              </span>
            </div>

            <div className="m-stack" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {!ready ? (
                <div style={{ color: 'var(--color-muted)' }}>Loading packs…</div>
              ) : filtered.length === 0 ? (
                <div style={{ color: 'var(--color-muted)' }}>No packs match your filters.</div>
              ) : (
                filtered.map((p, i) => {
                  const comp = composition(p);
                  const fits = p.min_vram_gb <= 8;
                  const trending = p.installs === topInstalls && topInstalls > 0;
                  return (
                    <RevealOnView key={p.id} delay={Math.min(i, 6) * 50}>
                      <Card padding={18} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
                        {trending && (
                          <span style={{ position: 'absolute', top: 14, right: 14, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            ◉ most installed
                          </span>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 8,
                              background: 'var(--color-accent-08)',
                              border: '1px solid var(--color-accent-25)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'var(--mono)',
                              color: 'var(--color-accent)',
                              fontWeight: 700,
                              fontSize: 13,
                              flexShrink: 0,
                            }}
                          >
                            {p.id.slice(0, 2)}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, fontFamily: 'var(--mono)' }}>{p.id}</div>
                            <div className="num" style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', gap: 8, fontFamily: 'var(--mono)', marginTop: 2 }}>
                              <span>trust <span style={{ color: 'var(--color-green)' }}>{p.trust}</span></span>
                              <span>·</span>
                              <span>{p.installs} installs</span>
                            </div>
                          </div>
                        </div>

                        <p style={{ fontSize: 12.5, color: 'var(--color-muted)', lineHeight: 1.55, margin: '2px 0 0', minHeight: 54 }}>{p.summary}</p>

                        <div className="num" style={{ display: 'flex', gap: 10, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--color-muted)', flexWrap: 'wrap' }}>
                          <span>models <span style={{ color: 'var(--color-text)' }}>{comp.models}</span></span>
                          <span>local <span style={{ color: 'var(--color-text)' }}>{comp.local}</span></span>
                          <span>cloud <span style={{ color: 'var(--color-text)' }}>{comp.cloud}</span></span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, fontFamily: 'var(--mono)' }}>
                          <ProgressBar pct={p.savings_pct} color="var(--color-green)" />
                          <span style={{ color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                            <span className="num" style={{ color: 'var(--color-green)' }}>{p.savings_pct}%</span> saved vs all-Opus
                          </span>
                        </div>

                        <div style={{ fontSize: 11.5, color: fits ? 'var(--color-green)' : 'var(--color-yellow)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {fits ? '✓ Runs local' : `⚠ Needs ${p.min_vram_gb}GB VRAM`} · {comp.cloud > 0 ? 'cloud fallback when it earns it' : 'local-only'}
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 4 }}>
                          <a
                            href={`/packs/${p.id}`}
                            style={{ flex: 1, textAlign: 'center', background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, fontSize: 13, padding: '8px', borderRadius: 8, textDecoration: 'none' }}
                          >
                            Install
                          </a>
                          <a
                            href={`/packs/${p.id}`}
                            style={{ flex: 1, textAlign: 'center', border: '1px solid var(--color-border-light)', color: 'var(--color-text)', fontSize: 13, padding: '8px', borderRadius: 8, textDecoration: 'none' }}
                          >
                            View detail
                          </a>
                        </div>
                      </Card>
                    </RevealOnView>
                  );
                })
              )}
            </div>

            <p style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 24, lineHeight: 1.55, maxWidth: 620 }}>
              Trust, installs and savings are pack metadata, not a guarantee for your prompts — your real savings depend on your own tier mix. Open source · MIT · v{versionInfo.version}
            </p>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 768px){ .packs-layout{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
